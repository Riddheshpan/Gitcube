const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dns = require("dns");
const boardNormalizer = require("./boardNormalizer");

try {
    dns.setServers(["8.8.8.8", "8.8.4.4"]);
} catch (err) {
    console.warn("Failed to set custom DNS servers for SRV resolution:", err.message);
}

dotenv.config();

const PORT = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

// Log all incoming requests with buffering for debugging
const debugLogs = [];
app.use((req, res, next) => {
    const logMsg = `[Server] ${new Date().toISOString()} - ${req.method} ${req.url} - body: ${JSON.stringify(req.body)}`;
    console.log(logMsg);
    debugLogs.push(logMsg);
    if (debugLogs.length > 100) debugLogs.shift();
    next();
});

// Expose global logs buffer for testing
app.use((req, res, next) => {
    req.debugLogs = debugLogs;
    next();
});

// Local JSON file path for persistent users fallback when MongoDB is not running
const JSON_DB_PATH = path.join(__dirname, "users.json");

function loadUsersFromJSON() {
    try {
        if (fs.existsSync(JSON_DB_PATH)) {
            const data = fs.readFileSync(JSON_DB_PATH, "utf8");
            return JSON.parse(data || "[]");
        }
    } catch (error) {
        console.error("Error reading fallback JSON database:", error.message);
    }
    return [];
}

function saveUsersToJSON(users) {
    try {
        fs.writeFileSync(JSON_DB_PATH, JSON.stringify(users, null, 2), "utf8");
    } catch (error) {
        console.error("Error writing fallback JSON database:", error.message);
    }
}

// PBKDF2 Password Hashing Utilities
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
    return { salt, hash };
}

function verifyPassword(password, salt, hash) {
    const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
    return hash === checkHash;
}

// Ensure key is exactly 32 bytes by hashing it with SHA-256
const getSecretKey = () => {
    const key = process.env.ENCRYPTION_KEY || 'gitcube-default-encryption-secret-key-32';
    return crypto.createHash('sha256').update(key).digest();
};

function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(12);
    const key = getSecretKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(encryptedText) {
    if (!encryptedText) return null;
    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 3) return null;
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];
        const key = getSecretKey();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error("Token decryption failed:", error.message);
        return null;
    }
}

const Board = require("./models/Board");
const Card = require("./models/Card");

// User Model Mongoose Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    salt: { type: String, required: true },
    hash: { type: String, required: true },
    fullName: { type: String, default: "" },
    email: { type: String, default: "" },
    defaultWorkspace: { type: String, default: "" },
    pushToken: { type: String, default: "" },
    tokens: [{
        token: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
    }],
    connections: {
        github: {
            accessToken: String,
            username: String,
            userId: String,
            connectedAt: Date
        },
        gitlab: {
            accessToken: String,
            refreshToken: String,
            expiresAt: Date,
            username: String,
            userId: String,
            connectedAt: Date
        },
        jira: {
            accessToken: String,
            refreshToken: String,
            expiresAt: Date,
            connectedAt: Date
        },
        trello: {
            apiKey: String,
            token: String,
            connectedAt: Date
        }
    },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

// Mongoose Connection Status Helpers
function isDbConnected() {
    return mongoose.connection.readyState === 1;
}

// Database persistent actions with fallback to local JSON database
async function findUser(username) {
    const normalizedUsername = username.trim().toLowerCase();
    if (isDbConnected()) {
        try {
            return await User.findOne({ username: { $regex: new RegExp(`^${normalizedUsername}$`, 'i') } });
        } catch (e) {
            console.error("MongoDB findOne failed, using JSON database:", e.message);
        }
    }
    const users = loadUsersFromJSON();
    return users.find(u => u.username.toLowerCase() === normalizedUsername);
}

async function createUser(username, password) {
    const normalizedUsername = username.trim();
    const { salt, hash } = hashPassword(password);
    
    if (isDbConnected()) {
        try {
            const newUser = new User({ username: normalizedUsername, salt, hash });
            await newUser.save();
            return newUser;
        } catch (e) {
            console.error("MongoDB save failed, using JSON database:", e.message);
        }
    }
    
    const users = loadUsersFromJSON();
    const newUser = {
        _id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
        username: normalizedUsername,
        salt,
        hash,
        fullName: "",
        email: "",
        defaultWorkspace: "",
        createdAt: new Date().toISOString()
    };
    users.push(newUser);
    saveUsersToJSON(users);
    return newUser;
}

async function getUserByToken(token) {
    let user = null;
    if (isDbConnected()) {
        try {
            user = await User.findOne({ "tokens.token": token });
        } catch (e) {
            console.error("MongoDB find user by token failed, using JSON fallback:", e.message);
        }
    }
    if (!user) {
        const users = loadUsersFromJSON();
        user = users.find(u => u.tokens && u.tokens.some(t => t.token === token));
    }
    return user;
}

async function saveUserToken(username, token) {
    const normalizedUsername = username.trim().toLowerCase();
    if (isDbConnected()) {
        try {
            await User.updateOne(
                { username: { $regex: new RegExp(`^${normalizedUsername}$`, 'i') } },
                { $push: { tokens: { token, createdAt: new Date() } } }
            );
            return;
        } catch (e) {
            console.error("MongoDB save token failed:", e.message);
        }
    }
    
    const users = loadUsersFromJSON();
    const user = users.find(u => u.username.toLowerCase() === normalizedUsername);
    if (user) {
        if (!user.tokens) user.tokens = [];
        user.tokens.push({ token, createdAt: new Date().toISOString() });
        saveUsersToJSON(users);
    }
}

async function saveConnection(username, provider, connectionData) {
    const normalizedUsername = username.trim().toLowerCase();
    
    // Encrypt sensitive tokens
    const encryptedData = { ...connectionData };
    if (connectionData.accessToken) {
        encryptedData.accessToken = encrypt(connectionData.accessToken);
    }
    if (connectionData.refreshToken) {
        encryptedData.refreshToken = encrypt(connectionData.refreshToken);
    }
    if (connectionData.apiKey) {
        encryptedData.apiKey = encrypt(connectionData.apiKey);
    }
    if (connectionData.token) {
        encryptedData.token = encrypt(connectionData.token);
    }
    
    if (isDbConnected()) {
        try {
            const updateField = `connections.${provider}`;
            await User.updateOne(
                { username: { $regex: new RegExp(`^${normalizedUsername}$`, 'i') } },
                { $set: { [updateField]: { ...encryptedData, connectedAt: new Date() } } }
            );
            return;
        } catch (e) {
            console.error(`MongoDB save connection for ${provider} failed:`, e.message);
        }
    }
    
    const users = loadUsersFromJSON();
    const user = users.find(u => u.username.toLowerCase() === normalizedUsername);
    if (user) {
        if (!user.connections) user.connections = {};
        user.connections[provider] = {
            ...encryptedData,
            connectedAt: new Date().toISOString()
        };
        saveUsersToJSON(users);
    }
}

async function getConnection(username, provider) {
    const normalizedUsername = username.trim().toLowerCase();
    let user = null;
    if (isDbConnected()) {
        try {
            user = await User.findOne({ username: { $regex: new RegExp(`^${normalizedUsername}$`, 'i') } });
        } catch (e) {
            console.error(`MongoDB get connection for ${provider} failed:`, e.message);
        }
    }
    if (!user) {
        const users = loadUsersFromJSON();
        user = users.find(u => u.username.toLowerCase() === normalizedUsername);
    }
    
    if (!user || !user.connections || !user.connections[provider]) {
        return null;
    }
    
    const connection = user.connections[provider];
    
    // Extract connections safely
    const plainConnection = connection.toObject ? connection.toObject() : connection;
    
    return {
        accessToken: plainConnection.accessToken ? decrypt(plainConnection.accessToken) : null,
        refreshToken: plainConnection.refreshToken ? decrypt(plainConnection.refreshToken) : null,
        apiKey: plainConnection.apiKey ? decrypt(plainConnection.apiKey) : null,
        token: plainConnection.token ? decrypt(plainConnection.token) : null,
        expiresAt: plainConnection.expiresAt,
        connectedAt: plainConnection.connectedAt
    };
}

async function getOrRefreshToken(username, provider) {
    const connection = await getConnection(username, provider);
    if (!connection) return null;
    
    if (!connection.expiresAt) {
        return connection.accessToken;
    }
    
    const expiresAt = new Date(connection.expiresAt);
    const now = new Date();
    
    // Refresh if expiring within 5 minutes
    const isExpired = expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
    if (!isExpired) {
        return connection.accessToken;
    }
    
    console.log(`Token for ${provider} is expired or close to expiry, refreshing...`);
    
    if (provider === 'gitlab') {
        try {
            const response = await axios.post("https://gitlab.com/oauth/token", {
                client_id: process.env.GITLAB_CLIENT_ID,
                client_secret: process.env.GITLAB_CLIENT_SECRET,
                refresh_token: connection.refreshToken,
                grant_type: "refresh_token"
            });
            
            const data = response.data;
            const expiryDate = new Date();
            expiryDate.setSeconds(expiryDate.getSeconds() + data.expires_in);
            
            await saveConnection(username, 'gitlab', {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresAt: expiryDate
            });
            
            return data.access_token;
        } catch (error) {
            console.error("Error refreshing GitLab token:", error.response?.data || error.message);
            return null;
        }
    } else if (provider === 'jira') {
        try {
            const response = await axios.post("https://auth.atlassian.com/oauth/token", {
                client_id: process.env.JIRA_CLIENT_ID,
                client_secret: process.env.JIRA_CLIENT_SECRET,
                refresh_token: connection.refreshToken,
                grant_type: "refresh_token"
            });
            
            const data = response.data;
            const expiryDate = new Date();
            expiryDate.setSeconds(expiryDate.getSeconds() + data.expires_in);
            
            await saveConnection(username, 'jira', {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresAt: expiryDate
            });
            
            return data.access_token;
        } catch (error) {
            console.error("Error refreshing Jira token:", error.response?.data || error.message);
            return null;
        }
    }
    
    return connection.accessToken;
}

async function authenticateUser(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    const token = authHeader.split(' ')[1];
    
    const user = await getUserByToken(token);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
    
    req.user = user;
    req.token = token;
    next();
}

app.get("/", (req, res) => {
    res.send("gitcube running smooth");
});

app.get("/api/debug-logs", (req, res) => {
    res.json(req.debugLogs || []);
});

// Username & Password Authentication Endpoints
app.post("/auth/register", async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }
    
    if (username.trim().length < 3) {
        return res.status(400).json({ error: "Username must be at least 3 characters long" });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    try {
        const existingUser = await findUser(username);
        if (existingUser) {
            return res.status(400).json({ error: "Username already exists" });
        }

        const user = await createUser(username, password);
        const token = `user-token-${user.username}-${crypto.randomBytes(16).toString("hex")}`;
        await saveUserToken(user.username, token);
        
        res.status(201).json({
            access_token: token,
            username: user.username
        });
    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({ error: "Internal server error during registration" });
    }
});

app.post("/auth/login", async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }

    try {
        const user = await findUser(username);
        if (!user) {
            return res.status(401).json({ error: "Invalid username or password" });
        }

        const isValid = verifyPassword(password, user.salt, user.hash);
        if (!isValid) {
            return res.status(401).json({ error: "Invalid username or password" });
        }

        const token = `user-token-${user.username}-${crypto.randomBytes(16).toString("hex")}`;
        await saveUserToken(user.username, token);
        
        res.json({
            access_token: token,
            username: user.username
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Internal server error during login" });
    }
});

app.post("/auth/github", async (req, res) => {
    const { code, code_verifier, redirect_uri } = req.body;
    
    if (!code) {
        return res.status(400).json({ error: "No code provided" });
    }

    try {
        const response = await axios.post("https://github.com/login/oauth/access_token", {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code: code,
            ...(code_verifier && { code_verifier }),
            ...(redirect_uri && { redirect_uri })
        }, {
            headers: { Accept: "application/json" }
        });

        const data = response.data;
        if (data.error) {
            return res.status(400).json({ error: data.error_description || data.error });
        }

        // Fetch GitHub profile to get username
        let ghUsername = "";
        let ghUserId = "";
        try {
            const profileRes = await axios.get("https://api.github.com/user", {
                headers: {
                    Authorization: `Bearer ${data.access_token}`,
                    Accept: "application/vnd.github+json",
                    "User-Agent": "gitCube-App"
                }
            });
            ghUsername = profileRes.data.login || "";
            ghUserId = profileRes.data.id?.toString() || "";
        } catch (profileErr) {
            console.error("Failed to fetch GitHub profile during auth:", profileErr.message);
        }

        // Check if an existing session token was provided (user linking accounts)
        const authHeader = req.headers.authorization;
        let sessionToken = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const existingToken = authHeader.split(' ')[1];
            const existingUser = await getUserByToken(existingToken);
            if (existingUser) {
                // Existing logged-in user connecting GitHub — just save connection
                await saveConnection(existingUser.username, 'github', {
                    accessToken: data.access_token,
                    username: ghUsername,
                    userId: ghUserId
                });
                return res.json({ access_token: data.access_token });
            }
        }

        // No existing session — auto-create/find user account and issue a session token
        if (ghUsername) {
            const accountUsername = `gh-${ghUsername}`;
            let user = await findUser(accountUsername);
            if (!user) {
                // Create a new gitCube account for this GitHub user
                user = await createUser(accountUsername, crypto.randomBytes(32).toString('hex'));
            }
            sessionToken = `user-token-${user.username}-${crypto.randomBytes(16).toString('hex')}`;
            await saveUserToken(user.username, sessionToken);
            await saveConnection(user.username, 'github', {
                accessToken: data.access_token,
                username: ghUsername,
                userId: ghUserId
            });
        }

        res.json({ access_token: data.access_token, session_token: sessionToken, username: ghUsername ? `gh-${ghUsername}` : null });
    } catch (error) {
        const errorMsg = `[Server] Error exchanging GitHub code: ${error.message} - ${error.response?.data ? JSON.stringify(error.response.data) : ''}`;
        console.error(errorMsg);
        res.status(500).json({ error: "Internal server error: " + error.message });
    }
});


app.post("/auth/gitlab", async (req, res) => {
    const { code, code_verifier, redirect_uri } = req.body;
    
    if (!code) {
        return res.status(400).json({ error: "No code provided" });
    }

    try {
        const response = await axios.post("https://gitlab.com/oauth/token", {
            client_id: process.env.GITLAB_CLIENT_ID,
            client_secret: process.env.GITLAB_CLIENT_SECRET,
            code: code,
            grant_type: "authorization_code",
            redirect_uri: redirect_uri,
            ...(code_verifier && { code_verifier })
        }, {
            headers: { Accept: "application/json" }
        });

        const data = response.data;
        if (data.error) {
            return res.status(400).json({ error: data.error_description || data.error });
        }

        // Fetch GitLab profile
        let glUsername = "";
        let glUserId = "";
        try {
            const profileRes = await axios.get("https://gitlab.com/api/v4/user", {
                headers: { Authorization: `Bearer ${data.access_token}` }
            });
            glUsername = profileRes.data.username || "";
            glUserId = profileRes.data.id?.toString() || "";
        } catch (profileErr) {
            console.error("Failed to fetch GitLab profile during auth:", profileErr.message);
        }

        const authHeader = req.headers.authorization;
        let sessionToken = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const existingToken = authHeader.split(' ')[1];
            const existingUser = await getUserByToken(existingToken);
            if (existingUser) {
                const expiryDate = new Date();
                expiryDate.setSeconds(expiryDate.getSeconds() + data.expires_in);
                await saveConnection(existingUser.username, 'gitlab', {
                    accessToken: data.access_token,
                    refreshToken: data.refresh_token,
                    expiresAt: expiryDate,
                    username: glUsername,
                    userId: glUserId
                });
                return res.json({ access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in });
            }
        }

        // No existing session — auto-create/find user and issue session token
        if (glUsername) {
            const accountUsername = `gl-${glUsername}`;
            let user = await findUser(accountUsername);
            if (!user) {
                user = await createUser(accountUsername, crypto.randomBytes(32).toString('hex'));
            }
            sessionToken = `user-token-${user.username}-${crypto.randomBytes(16).toString('hex')}`;
            await saveUserToken(user.username, sessionToken);
            const expiryDate = new Date();
            expiryDate.setSeconds(expiryDate.getSeconds() + (data.expires_in || 7200));
            await saveConnection(user.username, 'gitlab', {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresAt: expiryDate,
                username: glUsername,
                userId: glUserId
            });
        }

        res.json({ access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in, session_token: sessionToken, username: glUsername ? `gl-${glUsername}` : null });
    } catch (error) {
        console.error("Error exchanging code for GitLab token:", error.response?.data || error.message);
        res.status(500).json({ error: "Internal server error" });
    }
});


app.post("/auth/jira", async (req, res) => {
    const { code, redirect_uri } = req.body;
    
    if (!code) {
        return res.status(400).json({ error: "No code provided" });
    }

    try {
        const response = await axios.post("https://auth.atlassian.com/oauth/token", {
            client_id: process.env.JIRA_CLIENT_ID,
            client_secret: process.env.JIRA_CLIENT_SECRET,
            code: code,
            grant_type: "authorization_code",
            redirect_uri: redirect_uri
        }, {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            }
        });

        const data = response.data;
        if (data.error) {
            return res.status(400).json({ error: data.error_description || data.error });
        }

        // If user session token is provided, associate the connection in DB
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const sessionToken = authHeader.split(' ')[1];
            const user = await getUserByToken(sessionToken);
            if (user) {
                const expiryDate = new Date();
                expiryDate.setSeconds(expiryDate.getSeconds() + data.expires_in);
                await saveConnection(user.username, 'jira', {
                    accessToken: data.access_token,
                    refreshToken: data.refresh_token,
                    expiresAt: expiryDate
                });
            }
        }

        res.json({ 
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in
        });
    } catch (error) {
        console.error("Error exchanging code for Jira token:", error.response?.data || error.message);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ----------------------------------------------------
// BOARDS & KANBAN CARD ROUTE HANDLERS
// ----------------------------------------------------

// Get all accessible boards for the logged-in user (with caching)
app.get("/api/boards", authenticateUser, async (req, res) => {
    const user = req.user;
    const fetchedBoards = [];
    
    try {
        // 1. GitHub Connections (Repository + Projects v2)
        const githubToken = await getOrRefreshToken(user.username, 'github');
        if (githubToken) {
            try {
                const ghBoards = await boardNormalizer.fetchGithubBoards(githubToken);
                fetchedBoards.push(...ghBoards);
            } catch (err) {
                console.error("Failed to fetch GitHub repository boards:", err.message);
            }
            try {
                const ghProjBoards = await boardNormalizer.fetchGithubProjectsV2(githubToken);
                fetchedBoards.push(...ghProjBoards);
            } catch (err) {
                console.error("Failed to fetch GitHub Projects v2 boards:", err.message);
            }
        }
        
        // 2. Jira Connection
        const jiraToken = await getOrRefreshToken(user.username, 'jira');
        if (jiraToken) {
            try {
                const jiraBoards = await boardNormalizer.fetchJiraBoards(jiraToken);
                fetchedBoards.push(...jiraBoards);
            } catch (err) {
                console.error("Failed to fetch Jira boards:", err.message);
            }
        }

        // 3. Trello Connection
        const trelloConn = await getConnection(user.username, 'trello');
        if (trelloConn && trelloConn.apiKey && trelloConn.token) {
            try {
                const trelloBoards = await boardNormalizer.fetchTrelloBoards(trelloConn.apiKey, trelloConn.token);
                fetchedBoards.push(...trelloBoards);
            } catch (err) {
                console.error("Failed to fetch Trello boards:", err.message);
            }
        }

        // Save/Upsert boards to MongoDB cache if DB is connected
        if (isDbConnected() && fetchedBoards.length > 0) {
            for (const b of fetchedBoards) {
                await Board.findOneAndUpdate(
                    { id: b.id, user: user._id, provider: b.provider },
                    { ...b, user: user._id, lastSynced: new Date(), syncError: null },
                    { upsert: true, new: true }
                );
            }
        }
    } catch (error) {
        console.error("Error in fetching boards from providers:", error.message);
    }

    // Serve from local cache if DB is connected
    if (isDbConnected()) {
        try {
            const cachedBoards = await Board.find({ user: user._id });
            return res.json(cachedBoards);
        } catch (dbErr) {
            console.error("Failed to query Board collection:", dbErr.message);
        }
    }

    res.json(fetchedBoards);
});

// Get cards for a specific board (with caching and offline fallback)
app.get("/api/boards/cards/:provider", authenticateUser, async (req, res) => {
    const { provider } = req.params;
    const { boardId } = req.query;
    
    if (!boardId) {
        return res.status(400).json({ error: "boardId query parameter is required" });
    }
    
    let freshCards = null;
    let fetchError = null;

    try {
        if (provider === 'jira') {
            const token = await getOrRefreshToken(req.user.username, 'jira');
            if (token) freshCards = await boardNormalizer.fetchJiraCards(token, boardId);
        } else if (provider === 'github') {
            const token = await getOrRefreshToken(req.user.username, 'github');
            if (token) freshCards = await boardNormalizer.fetchGithubCards(token, boardId);
        } else if (provider === 'github_projects') {
            const token = await getOrRefreshToken(req.user.username, 'github');
            if (token) freshCards = await boardNormalizer.fetchGithubProjectsV2Cards(token, boardId);
        } else if (provider === 'trello') {
            const trelloConn = await getConnection(req.user.username, 'trello');
            if (trelloConn && trelloConn.apiKey && trelloConn.token) {
                freshCards = await boardNormalizer.fetchTrelloCards(trelloConn.apiKey, trelloConn.token, boardId);
            }
        }
    } catch (err) {
        console.error(`Failed to fetch live cards for ${provider} board ${boardId}:`, err.message);
        fetchError = err.message;
    }

    // Update MongoDB Cache if successfully fetched
    if (isDbConnected() && freshCards) {
        try {
            for (const c of freshCards) {
                await Card.findOneAndUpdate(
                    { id: c.id, boardId: boardId, provider: provider },
                    { ...c, boardId: boardId, provider: provider, updatedAt: new Date() },
                    { upsert: true, new: true }
                );
            }
            const freshCardIds = freshCards.map(c => c.id);
            await Card.deleteMany({
                boardId: boardId,
                provider: provider,
                id: { $nin: freshCardIds }
            });
            await Board.updateOne(
                { id: boardId, user: req.user._id, provider: provider },
                { $set: { lastSynced: new Date(), syncError: null } }
            );
        } catch (dbErr) {
            console.error("Failed to update cache in MongoDB:", dbErr.message);
        }
    } else if (isDbConnected() && fetchError) {
        try {
            await Board.updateOne(
                { id: boardId, user: req.user._id, provider: provider },
                { $set: { syncError: fetchError } }
            );
        } catch (dbErr) {
            console.error("Failed to update board sync error:", dbErr.message);
        }
    }

    // Serve from cache if database is connected
    if (isDbConnected()) {
        try {
            const cachedCards = await Card.find({ boardId, provider });
            return res.json(cachedCards);
        } catch (dbErr) {
            console.error("Failed to query Card cache:", dbErr.message);
        }
    }

    if (freshCards) {
        return res.json(freshCards);
    }

    res.status(500).json({ error: fetchError || "Database offline and no cached cards available" });
});

// Move card to new status
app.post("/api/boards/cards/:provider/move", authenticateUser, async (req, res) => {
    const { provider } = req.params;
    const { boardId, cardId, status } = req.body;
    
    if (!cardId || !status) {
        return res.status(400).json({ error: "cardId and status are required in request body" });
    }
    
    try {
        let result = null;
        if (provider === 'jira') {
            const token = await getOrRefreshToken(req.user.username, 'jira');
            if (!token) return res.status(401).json({ error: "Not connected to Jira" });
            result = await boardNormalizer.moveJiraCard(token, cardId, status);
        } else if (provider === 'github') {
            const token = await getOrRefreshToken(req.user.username, 'github');
            if (!token) return res.status(401).json({ error: "Not connected to GitHub" });
            if (!boardId) return res.status(400).json({ error: "boardId is required to update GitHub cards" });
            result = await boardNormalizer.moveGithubCard(token, boardId, cardId, status);
        } else if (provider === 'github_projects') {
            const token = await getOrRefreshToken(req.user.username, 'github');
            if (!token) return res.status(401).json({ error: "Not connected to GitHub" });
            if (!boardId) return res.status(400).json({ error: "boardId is required to update GitHub Projects v2 cards" });
            result = await boardNormalizer.moveGithubProjectsV2Card(token, boardId, cardId, status);
        } else if (provider === 'trello') {
            const trelloConn = await getConnection(req.user.username, 'trello');
            if (!trelloConn || !trelloConn.apiKey || !trelloConn.token) {
                return res.status(401).json({ error: "Not connected to Trello" });
            }
            if (!boardId) return res.status(400).json({ error: "boardId is required to update Trello cards" });
            result = await boardNormalizer.moveTrelloCard(trelloConn.apiKey, trelloConn.token, boardId, cardId, status);
        } else {
            return res.status(400).json({ error: `Provider ${provider} not supported` });
        }
        
        // Update local MongoDB cache immediately so UI matches the change
        if (isDbConnected()) {
            await Card.updateOne(
                { id: cardId, boardId: boardId, provider: provider },
                { $set: { status: status, updatedAt: new Date() } }
            );
        }

        res.json(result);
    } catch (error) {
        console.error(`Failed to move card ${cardId} to ${status}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get all connections for the logged in user
app.get("/api/connections", authenticateUser, async (req, res) => {
    const user = req.user;
    const connections = {
        github: !!(user.connections?.github?.accessToken),
        gitlab: !!(user.connections?.gitlab?.accessToken),
        jira: !!(user.connections?.jira?.accessToken),
        trello: !!(user.connections?.trello?.apiKey && user.connections?.trello?.token)
    };
    res.json(connections);
});

// Get user profile info
app.get("/api/user/profile", authenticateUser, async (req, res) => {
    const user = req.user;
    res.json({
        username: user.username,
        fullName: user.fullName || "",
        email: user.email || "",
        defaultWorkspace: user.defaultWorkspace || "",
        connections: {
            github: !!(user.connections?.github?.accessToken),
            gitlab: !!(user.connections?.gitlab?.accessToken),
            jira: !!(user.connections?.jira?.accessToken),
            trello: !!(user.connections?.trello?.apiKey && user.connections?.trello?.token)
        }
    });
});

// Update user profile info
app.post("/api/user/profile", authenticateUser, async (req, res) => {
    const user = req.user;
    const { fullName, email, defaultWorkspace } = req.body;
    
    if (isDbConnected()) {
        try {
            await User.updateOne(
                { _id: user._id },
                { 
                    $set: { 
                        fullName: fullName !== undefined ? fullName : user.fullName,
                        email: email !== undefined ? email : user.email,
                        defaultWorkspace: defaultWorkspace !== undefined ? defaultWorkspace : user.defaultWorkspace
                    } 
                }
            );
        } catch (e) {
            console.error("MongoDB update user profile failed:", e.message);
        }
    }
    
    // Sync with fallback JSON DB
    const users = loadUsersFromJSON();
    const jsonUser = users.find(u => u.username.toLowerCase() === user.username.toLowerCase());
    if (jsonUser) {
        if (fullName !== undefined) jsonUser.fullName = fullName;
        if (email !== undefined) jsonUser.email = email;
        if (defaultWorkspace !== undefined) jsonUser.defaultWorkspace = defaultWorkspace;
        saveUsersToJSON(users);
    }
    
    res.json({ 
        success: true, 
        message: "Profile updated successfully",
        profile: {
            username: user.username,
            fullName: fullName !== undefined ? fullName : (user.fullName || ""),
            email: email !== undefined ? email : (user.email || ""),
            defaultWorkspace: defaultWorkspace !== undefined ? defaultWorkspace : (user.defaultWorkspace || "")
        }
    });
});

// Delete user account
app.delete("/api/user", authenticateUser, async (req, res) => {
    const user = req.user;
    
    if (isDbConnected()) {
        try {
            // Delete user boards & cards cache
            await Board.deleteMany({ user: user._id });
            // Delete user document
            await User.deleteOne({ _id: user._id });
        } catch (e) {
            console.error("MongoDB delete user account failed:", e.message);
        }
    }
    
    // Sync with fallback JSON DB
    const users = loadUsersFromJSON();
    const filteredUsers = users.filter(u => u.username.toLowerCase() !== user.username.toLowerCase());
    saveUsersToJSON(filteredUsers);
    
    res.json({ success: true, message: "Account deleted successfully" });
});

// Revoke all tokens (log out of all sessions)
app.post("/api/user/revoke-tokens", authenticateUser, async (req, res) => {
    const user = req.user;
    
    if (isDbConnected()) {
        try {
            await User.updateOne(
                { _id: user._id },
                { $set: { tokens: [] } }
            );
        } catch (e) {
            console.error("MongoDB revoke tokens failed:", e.message);
        }
    }
    
    // Sync with fallback JSON DB
    const users = loadUsersFromJSON();
    const jsonUser = users.find(u => u.username.toLowerCase() === user.username.toLowerCase());
    if (jsonUser) {
        jsonUser.tokens = [];
        saveUsersToJSON(users);
    }
    
    res.json({ success: true, message: "All tokens revoked successfully" });
});

// Connect Trello credentials
app.post("/api/connections/trello", authenticateUser, async (req, res) => {
    const { apiKey, token } = req.body;
    if (!apiKey || !token) {
        return res.status(400).json({ error: "apiKey and token are required" });
    }
    
    try {
        await saveConnection(req.user.username, 'trello', { apiKey, token });
        res.json({ success: true, message: "Connected to Trello successfully" });
    } catch (error) {
        console.error("Error connecting Trello:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// Disconnect a connection
app.post("/api/connections/disconnect", authenticateUser, async (req, res) => {
    const { provider } = req.body;
    if (!provider || !['github', 'gitlab', 'jira', 'trello'].includes(provider)) {
        return res.status(400).json({ error: "Invalid provider" });
    }
    
    const user = req.user;
    if (isDbConnected()) {
        try {
            const updateField = `connections.${provider}`;
            await User.updateOne(
                { _id: user._id },
                { $unset: { [updateField]: "" } }
            );
        } catch (e) {
            console.error(`MongoDB disconnect connection failed:`, e.message);
        }
    }
    
    // Sync with fallback JSON DB
    const users = loadUsersFromJSON();
    const jsonUser = users.find(u => u.username.toLowerCase() === user.username.toLowerCase());
    if (jsonUser && jsonUser.connections) {
        delete jsonUser.connections[provider];
        saveUsersToJSON(users);
    }
    
    res.json({ success: true, message: `Disconnected from ${provider}` });
});

// Test refresh token
app.get("/api/connections/test-refresh/:provider", authenticateUser, async (req, res) => {
    const { provider } = req.params;
    if (!provider || !['github', 'gitlab', 'jira', 'trello'].includes(provider)) {
        return res.status(400).json({ error: "Invalid provider" });
    }
    
    try {
        const token = await getOrRefreshToken(req.user.username, provider);
        if (!token) {
            return res.status(404).json({ error: `No active connection found for ${provider}` });
        }
        res.json({ success: true, provider, accessToken: token.substring(0, 10) + '...' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const Notification = require("./models/Notification");

// Local JSON DB fallback path for notifications
const NOTIFICATIONS_JSON_PATH = path.join(__dirname, "notifications.json");

function loadNotificationsFromJSON() {
    try {
        if (fs.existsSync(NOTIFICATIONS_JSON_PATH)) {
            const data = fs.readFileSync(NOTIFICATIONS_JSON_PATH, "utf8");
            return JSON.parse(data || "[]");
        }
    } catch (e) {
        console.error("Error reading notifications JSON fallback:", e.message);
    }
    return [];
}

function saveNotificationsToJSON(notifications) {
    try {
        fs.writeFileSync(NOTIFICATIONS_JSON_PATH, JSON.stringify(notifications, null, 2), "utf8");
    } catch (e) {
        console.error("Error writing notifications JSON fallback:", e.message);
    }
}

// Function to send Expo Push Notification
async function sendPushNotification(pushToken, title, body, dataPayload = {}) {
    if (!pushToken || !pushToken.startsWith("ExponentPushToken")) {
        console.warn(`[Push Service] Invalid or missing Expo push token: ${pushToken}`);
        return;
    }

    try {
        console.log(`[Push Service] Sending push notification to token: ${pushToken}`);
        const response = await axios.post(
            "https://exp.host/--/api/v2/push/send",
            {
                to: pushToken,
                sound: "default",
                title: title,
                body: body,
                data: dataPayload
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "accept": "application/json"
                }
            }
        );
        console.log(`[Push Service] Response:`, response.data);
    } catch (err) {
        console.error(`[Push Service] Failed to send push notification:`, err.response?.data || err.message);
    }
}

// Helper to create notification and trigger push notification
async function createAndSendNotification(userId, notificationType, title, body, provider, repoId, resourceId) {
    let savedNotification = null;
    let pushToken = "";

    // 1. Fetch user to get pushToken
    let user = null;
    if (isDbConnected()) {
        try {
            user = await User.findById(userId);
            if (user) pushToken = user.pushToken;
        } catch (err) {
            console.error("Failed to query user for notification:", err.message);
        }
    }
    if (!user) {
        const users = loadUsersFromJSON();
        user = users.find(u => u._id === userId.toString());
        if (user) pushToken = user.pushToken;
    }

    // 2. Save Notification with grouping logic to prevent spam
    let existingNotif = null;
    if (isDbConnected()) {
        try {
            existingNotif = await Notification.findOne({
                user: userId,
                provider: provider,
                repoId: repoId,
                resourceId: resourceId,
                type: notificationType,
                read: false
            });

            if (existingNotif) {
                existingNotif.title = title;
                existingNotif.body = body;
                existingNotif.createdAt = new Date();
                await existingNotif.save();
                savedNotification = existingNotif;
                console.log(`[Notification Service] Grouped & updated notification in MongoDB for user ${userId}`);
            } else {
                savedNotification = new Notification({
                    user: userId,
                    type: notificationType,
                    title,
                    body,
                    provider,
                    repoId,
                    resourceId
                });
                await savedNotification.save();
                console.log(`[Notification Service] Notification saved to MongoDB for user ${userId}`);
            }
        } catch (dbErr) {
            console.error("Failed to save/update notification in MongoDB:", dbErr.message);
        }
    }

    if (!savedNotification) {
        const notifications = loadNotificationsFromJSON();
        const existingJSONNotif = notifications.find(n => 
            n.user === userId.toString() &&
            n.provider === provider &&
            n.repoId === repoId &&
            n.resourceId === resourceId &&
            n.type === notificationType &&
            !n.read
        );

        if (existingJSONNotif) {
            existingJSONNotif.title = title;
            existingJSONNotif.body = body;
            existingJSONNotif.createdAt = new Date().toISOString();
            savedNotification = existingJSONNotif;
            console.log(`[Notification Service] Grouped & updated notification in JSON fallback for user ${userId}`);
        } else {
            savedNotification = {
                _id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
                user: userId.toString(),
                type: notificationType,
                title,
                body,
                provider,
                repoId,
                resourceId,
                read: false,
                createdAt: new Date().toISOString()
            };
            notifications.push(savedNotification);
            console.log(`[Notification Service] Notification saved to JSON database fallback for user ${userId}`);
        }
        saveNotificationsToJSON(notifications);
    }

    // 3. Send Push Notification if token exists
    if (pushToken) {
        await sendPushNotification(pushToken, title, body, {
            type: notificationType,
            provider,
            repoId,
            resourceId
        });
    }
}

// GitHub Webhook Receiver
app.post("/api/webhooks/github", async (req, res) => {
    const event = req.headers["x-github-event"];
    const payload = req.body;
    console.log(`[GitHub Webhook] Received event '${event}'`);

    // Verify signature if WEBHOOK_SECRET is set
    const signature = req.headers["x-hub-signature-256"];
    if (process.env.WEBHOOK_SECRET && signature) {
        const hmac = crypto.createHmac("sha256", process.env.WEBHOOK_SECRET);
        const digest = "sha256=" + hmac.update(JSON.stringify(payload)).digest("hex");
        if (signature !== digest) {
            console.warn("[GitHub Webhook] Signature verification failed");
            return res.status(401).send("Invalid signature");
        }
    }

    try {
        const repoFullName = payload.repository?.full_name;
        if (!repoFullName) {
            return res.send("Ignored webhook: No repository details");
        }

        // Find users tracking this repository via cached Boards
        const matchedUsers = new Set();
        if (isDbConnected()) {
            const boards = await Board.find({ id: repoFullName, provider: "github" });
            boards.forEach(b => matchedUsers.add(b.user.toString()));
        }

        // Also check if any user has this repository name in their connections or general repo list
        let allUsers = [];
        if (isDbConnected()) {
            allUsers = await User.find({});
        } else {
            allUsers = loadUsersFromJSON();
        }

        if (event === "pull_request") {
            const action = payload.action;
            const pr = payload.pull_request;
            const author = pr.user?.login;
            const prNumber = pr.number.toString();

            // Determine target title and body
            let title = "";
            let body = "";
            let type = "pr_review";

            if (action === "opened") {
                title = `New PR in ${payload.repository.name}`;
                body = `@${author} opened PR #${prNumber}: "${pr.title}"`;
            } else if (action === "review_requested") {
                const requestedReviewer = payload.requested_reviewer?.login;
                title = "PR Review Requested";
                body = `@${payload.sender?.login} requested your review on PR #${prNumber} in ${payload.repository.name}`;
                
                // Notify ONLY the requested reviewer if they are a gitCube user
                const targetUser = allUsers.find(u => u.connections?.github?.username === requestedReviewer);
                if (targetUser) {
                    await createAndSendNotification(
                        targetUser._id,
                        "pr_review",
                        title,
                        body,
                        "github",
                        repoFullName,
                        prNumber
                    );
                }
                return res.send("Review request notification handled");
            } else if (action === "closed" && pr.merged) {
                title = `PR Merged in ${payload.repository.name}`;
                body = `PR #${prNumber} was merged by @${payload.sender?.login}`;
            } else {
                return res.send(`Ignored PR action: ${action}`);
            }

            // Create notification for all users who track this repository
            for (const userId of matchedUsers) {
                // Skip sending notification to the PR author themselves
                const u = allUsers.find(usr => usr._id.toString() === userId);
                if (u && u.connections?.github?.username === author) continue;

                await createAndSendNotification(
                    userId,
                    type,
                    title,
                    body,
                    "github",
                    repoFullName,
                    prNumber
                );
            }

        } else if (event === "workflow_run") {
            const run = payload.workflow_run;
            const action = payload.action;
            if (action !== "completed") return res.send(`Ignored workflow run action: ${action}`);

            if (run.conclusion === "failure") {
                const title = `CI Build Failed - ${payload.repository.name}`;
                const body = `Workflow "${run.name}" failed on branch ${run.head_branch}`;
                const runId = run.id.toString();

                for (const userId of matchedUsers) {
                    await createAndSendNotification(
                        userId,
                        "ci_failure",
                        title,
                        body,
                        "github",
                        repoFullName,
                        runId
                    );
                }
            }
        }
        res.send("Webhook processed");
    } catch (err) {
        console.error("Error processing GitHub webhook:", err.message);
        res.status(500).send("Internal server error");
    }
});

// GitLab Webhook Receiver
app.post("/api/webhooks/gitlab", async (req, res) => {
    const event = req.headers["x-gitlab-event"];
    const payload = req.body;
    console.log(`[GitLab Webhook] Received event '${event}'`);

    const secretToken = req.headers["x-gitlab-token"];
    if (process.env.WEBHOOK_SECRET && secretToken && secretToken !== process.env.WEBHOOK_SECRET) {
        console.warn("[GitLab Webhook] Token verification failed");
        return res.status(401).send("Invalid token");
    }

    try {
        const projectId = payload.project?.id?.toString();
        const repoFullName = payload.project?.path_with_namespace;
        if (!projectId) {
            return res.send("Ignored webhook: No project details");
        }

        // Find users tracking this GitLab repository/board
        const matchedUsers = new Set();
        if (isDbConnected()) {
            const boards = await Board.find({ id: projectId, provider: "gitlab" });
            boards.forEach(b => matchedUsers.add(b.user.toString()));
        }

        let allUsers = [];
        if (isDbConnected()) {
            allUsers = await User.find({});
        } else {
            allUsers = loadUsersFromJSON();
        }

        if (event === "Merge Request Hook") {
            const attrs = payload.object_attributes;
            const action = attrs.action;
            const author = payload.user?.username;
            const iid = attrs.iid?.toString();

            let title = "";
            let body = "";

            if (action === "open" || action === "reopen") {
                title = `New MR in ${payload.project.name}`;
                body = `@${author} opened MR !${iid}: "${attrs.title}"`;
            } else if (action === "merge") {
                title = `MR Merged in ${payload.project.name}`;
                body = `MR !${iid} merged by @${author}`;
            } else if (action === "approval" || action === "approved") {
                title = `MR Approved - ${payload.project.name}`;
                body = `MR !${iid} approved by @${author}`;
            } else {
                return res.send(`Ignored MR action: ${action}`);
            }

            for (const userId of matchedUsers) {
                const u = allUsers.find(usr => usr._id.toString() === userId);
                if (u && u.connections?.gitlab?.username === author) continue;

                await createAndSendNotification(
                    userId,
                    "pr_review",
                    title,
                    body,
                    "gitlab",
                    projectId,
                    iid
                );
            }
        } else if (event === "Pipeline Hook") {
            const pipeline = payload.object_attributes;
            if (pipeline.status === "failed") {
                const title = `GitLab Pipeline Failed - ${payload.project.name}`;
                const body = `Pipeline !${pipeline.id} failed on branch ${pipeline.ref}`;
                const runId = pipeline.id?.toString();

                for (const userId of matchedUsers) {
                    await createAndSendNotification(
                        userId,
                        "ci_failure",
                        title,
                        body,
                        "gitlab",
                        projectId,
                        runId
                    );
                }
            }
        }
        res.send("Webhook processed");
    } catch (err) {
        console.error("Error processing GitLab webhook:", err.message);
        res.status(500).send("Internal server error");
    }
});

// Register client Expo push token
app.post("/api/user/push-token", authenticateUser, async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Push token is required" });
    const user = req.user;

    if (isDbConnected()) {
        try {
            await User.updateOne({ _id: user._id }, { $set: { pushToken: token } });
        } catch (e) {
            console.error("MongoDB save pushToken failed:", e.message);
        }
    }

    const users = loadUsersFromJSON();
    const jsonUser = users.find(u => u.username.toLowerCase() === user.username.toLowerCase());
    if (jsonUser) {
        jsonUser.pushToken = token;
        saveUsersToJSON(users);
    }

    res.json({ success: true, message: "Push token registered successfully" });
});

// Retrieve notifications list
app.get("/api/notifications", authenticateUser, async (req, res) => {
    const user = req.user;
    if (isDbConnected()) {
        try {
            const list = await Notification.find({ user: user._id })
                .sort({ createdAt: -1 })
                .limit(50);
            return res.json(list);
        } catch (e) {
            console.error("MongoDB find notifications failed:", e.message);
        }
    }

    // JSON fallback
    const list = loadNotificationsFromJSON();
    const userList = list
        .filter(n => n.user === user._id.toString())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 50);
    res.json(userList);
});

// Mark single notification as read
app.put("/api/notifications/:id/read", authenticateUser, async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    if (isDbConnected()) {
        try {
            const notif = await Notification.findOneAndUpdate(
                { _id: id, user: user._id },
                { $set: { read: true } },
                { new: true }
            );
            if (notif) return res.json({ success: true, notification: notif });
        } catch (e) {
            console.error("MongoDB update notification read failed:", e.message);
        }
    }

    // JSON fallback
    const list = loadNotificationsFromJSON();
    const notif = list.find(n => n._id === id && n.user === user._id.toString());
    if (notif) {
        notif.read = true;
        saveNotificationsToJSON(list);
        return res.json({ success: true, notification: notif });
    }

    res.status(404).json({ error: "Notification not found" });
});

// Mark all notifications as read
app.put("/api/notifications/read-all", authenticateUser, async (req, res) => {
    const user = req.user;

    if (isDbConnected()) {
        try {
            await Notification.updateMany(
                { user: user._id, read: false },
                { $set: { read: true } }
            );
            return res.json({ success: true });
        } catch (e) {
            console.error("MongoDB read-all failed:", e.message);
        }
    }

    // JSON fallback
    const list = loadNotificationsFromJSON();
    list.forEach(n => {
        if (n.user === user._id.toString()) {
            n.read = true;
        }
    });
    saveNotificationsToJSON(list);
    res.json({ success: true });
});

const syncQueue = require("./syncQueue");

// Mount Git & AI Repository endpoints
const gitRoutes = require("./routes/gitRoutes");
app.use("/api/git", gitRoutes(getOrRefreshToken, authenticateUser));

app.listen(PORT, '0.0.0.0',() => {
    console.log("server is running");
});

mongoose.connection.on('error', err => {
    console.error("MongoDB connection error:", err.message);
});

async function run() {
    let mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/gitcube";
    if (process.env.MONGO_URI && !process.env.MONGO_URI.startsWith("mongodb://") && !process.env.MONGO_URI.startsWith("mongodb+srv://")) {
        console.warn("WARNING: MONGO_URI does not have protocol prefix. Prepending mongodb+srv://");
        mongoUri = "mongodb+srv://" + process.env.MONGO_URI;
    }
    
    try {
        console.log(`Attempting connection to MongoDB at: ${mongoUri.replace(/:([^@]+)@/, ":****@")}`);
        await mongoose.connect(mongoUri);
        console.log("MongoDB connected successfully");
        syncQueue.startBackgroundSync();
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        syncQueue.startBackgroundSync();
    }
}
run();

module.exports = {
    getOrRefreshToken,
    getConnection
};
