const mongoose = require("mongoose");
const boardNormalizer = require("./boardNormalizer");
const Board = require("./models/Board");
const Card = require("./models/Card");

// Synchronizes cards for a single board
async function syncBoardCards(board, user) {
    const { getOrRefreshToken, getConnection } = require("./server"); // Import helpers here to avoid premature loading
    
    console.log(`[Sync Worker] Starting sync for board: ${board.name} (${board.provider})`);
    let freshCards = null;
    let fetchError = null;

    try {
        if (board.provider === 'jira') {
            const token = await getOrRefreshToken(user.username, 'jira');
            if (token) {
                freshCards = await boardNormalizer.fetchJiraCards(token, board.id);
            } else {
                throw new Error("No active Jira connection");
            }
        } else if (board.provider === 'github') {
            const token = await getOrRefreshToken(user.username, 'github');
            if (token) {
                freshCards = await boardNormalizer.fetchGithubCards(token, board.id);
            } else {
                throw new Error("No active GitHub connection");
            }
        } else if (board.provider === 'github_projects') {
            const token = await getOrRefreshToken(user.username, 'github');
            if (token) {
                freshCards = await boardNormalizer.fetchGithubProjectsV2Cards(token, board.id);
            } else {
                throw new Error("No active GitHub connection");
            }
        } else if (board.provider === 'trello') {
            const trelloConn = await getConnection(user.username, 'trello');
            if (trelloConn && trelloConn.apiKey && trelloConn.token) {
                freshCards = await boardNormalizer.fetchTrelloCards(trelloConn.apiKey, trelloConn.token, board.id);
            } else {
                throw new Error("No Trello credentials set");
            }
        }
    } catch (err) {
        console.error(`[Sync Worker] Failed to fetch cards for board ${board.id}:`, err.message);
        fetchError = err.message;
    }

    if (freshCards) {
        try {
            // Update MongoDB cache
            for (const c of freshCards) {
                await Card.findOneAndUpdate(
                    { id: c.id, boardId: board.id, provider: board.provider },
                    { ...c, boardId: board.id, provider: board.provider, updatedAt: new Date() },
                    { upsert: true, new: true }
                );
            }
            // Delete deleted cards
            const freshCardIds = freshCards.map(c => c.id);
            await Card.deleteMany({
                boardId: board.id,
                provider: board.provider,
                id: { $nin: freshCardIds }
            });
            // Update board sync state
            await Board.updateOne(
                { _id: board._id },
                { $set: { lastSynced: new Date(), syncError: null } }
            );
            console.log(`[Sync Worker] Completed sync for board: ${board.name}`);
        } catch (dbErr) {
            console.error(`[Sync Worker] Database cache update failed for board ${board.id}:`, dbErr.message);
        }
    } else if (fetchError) {
        try {
            await Board.updateOne(
                { _id: board._id },
                { $set: { syncError: fetchError } }
            );
        } catch (dbErr) {
            console.error(`[Sync Worker] Failed to save syncError to Board ${board.id}:`, dbErr.message);
        }
    }
}

// Scans all users and schedules sync for their active boards
async function runAllSyncs() {
    console.log("[Sync Runner] Starting sync sweep for all users...");
    try {
        const User = mongoose.model("User");
        const users = await User.find({});
        for (const user of users) {
            const boards = await Board.find({ user: user._id });
            for (const board of boards) {
                await syncBoardCards(board, user);
            }
        }
    } catch (error) {
        console.error("[Sync Runner] Error during sync sweep:", error.message);
    }
    console.log("[Sync Runner] Sync sweep complete.");
}

function startBackgroundSync() {
    // Check if we can use BullMQ/Redis
    let useBullMQ = false;
    let QueueClass, WorkerClass;
    
    try {
        QueueClass = require("bullmq").Queue;
        WorkerClass = require("bullmq").Worker;
        useBullMQ = true;
    } catch (e) {
        console.log("[Sync Queue] BullMQ not installed, falling back to setInterval timer sync.");
    }

    if (useBullMQ) {
        const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
        console.log(`[Sync Queue] Attempting BullMQ sync initialization with Redis: ${redisUrl}`);
        
        try {
            const syncQueue = new QueueClass("BoardSync", {
                connection: { url: redisUrl }
            });

            // Start a worker to process sync jobs
            const worker = new WorkerClass("BoardSync", async (job) => {
                await runAllSyncs();
            }, {
                connection: { url: redisUrl }
            });

            worker.on("failed", (job, err) => {
                console.error(`[Sync Queue] Job ${job.id} failed:`, err.message);
            });

            worker.on("completed", (job) => {
                console.log(`[Sync Queue] Job ${job.id} completed successfully.`);
            });

            // Add repeatable job to run every 10 minutes
            syncQueue.add("periodic-sync", {}, {
                repeat: {
                    every: 10 * 60 * 1000 // 10 minutes
                }
            }).then(() => {
                console.log("[Sync Queue] BullMQ periodic board sync job added (every 10 minutes).");
            }).catch(err => {
                console.error("[Sync Queue] Failed to add BullMQ job:", err.message);
                console.log("[Sync Queue] Falling back to setInterval timer sync due to Queue error.");
                setupTimerSync();
            });

        } catch (err) {
            console.error("[Sync Queue] Redis connection or Queue error:", err.message);
            console.log("[Sync Queue] Falling back to setInterval timer sync.");
            setupTimerSync();
        }
    } else {
        setupTimerSync();
    }
}

function setupTimerSync() {
    // Run once immediately on start
    setTimeout(() => {
        runAllSyncs();
    }, 5000);

    // Set up polling interval every 10 minutes
    const intervalMs = 10 * 60 * 1000;
    setInterval(() => {
        runAllSyncs();
    }, intervalMs);
    console.log(`[Sync Queue] Interval timer board sync enabled (runs every 10 minutes).`);
}

module.exports = {
    startBackgroundSync
};
