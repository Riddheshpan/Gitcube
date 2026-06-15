const express = require("express");
const router = express.Router();
const gitService = require("../services/gitService");
const aiService = require("../services/aiService");

module.exports = function(getOrRefreshToken, authenticateUser) {

  // Fetch list of repositories for connected GitHub/GitLab accounts
  router.get("/repos", authenticateUser, async (req, res) => {
    try {
      const user = req.user;
      const repos = [];

      // Fetch GitHub repos if connected
      const ghToken = await getOrRefreshToken(user.username, "github");
      if (ghToken) {
        try {
          const ghRepos = await gitService.fetchRepos("github", ghToken);
          repos.push(...ghRepos);
        } catch (err) {
          console.error("Failed to fetch GitHub repos:", err.message);
        }
      }

      // Fetch GitLab repos if connected
      const glToken = await getOrRefreshToken(user.username, "gitlab");
      if (glToken) {
        try {
          const glRepos = await gitService.fetchRepos("gitlab", glToken);
          repos.push(...glRepos);
        } catch (err) {
          console.error("Failed to fetch GitLab repos:", err.message);
        }
      }

      res.json(repos);
    } catch (error) {
      console.error("Error in /repos endpoint:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Fetch list of branches for a repo
  router.get("/branches/:provider", authenticateUser, async (req, res) => {
    const { provider } = req.params;
    const { repoId } = req.query;
    if (!repoId) return res.status(400).json({ error: "repoId is required" });

    try {
      const token = await getOrRefreshToken(req.user.username, provider);
      if (!token) return res.status(401).json({ error: `Not connected to ${provider}` });

      const branches = await gitService.fetchBranches(provider, token, repoId);
      res.json(branches);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Fetch commits for a branch/repo
  router.get("/commits/:provider", authenticateUser, async (req, res) => {
    const { provider } = req.params;
    const { repoId, branch } = req.query;
    if (!repoId) return res.status(400).json({ error: "repoId is required" });

    try {
      const token = await getOrRefreshToken(req.user.username, provider);
      if (!token) return res.status(401).json({ error: `Not connected to ${provider}` });

      const commits = await gitService.fetchCommits(provider, token, repoId, branch);
      res.json(commits);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Fetch PRs list
  router.get("/prs/:provider", authenticateUser, async (req, res) => {
    const { provider } = req.params;
    const { repoId, state } = req.query;
    if (!repoId) return res.status(400).json({ error: "repoId is required" });

    try {
      const token = await getOrRefreshToken(req.user.username, provider);
      if (!token) return res.status(401).json({ error: `Not connected to ${provider}` });

      const prs = await gitService.fetchPRs(provider, token, repoId, state || "open");
      res.json(prs);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Fetch single PR detail
  router.get("/prs/:provider/:prNumber", authenticateUser, async (req, res) => {
    const { provider, prNumber } = req.params;
    const { repoId } = req.query;
    if (!repoId) return res.status(400).json({ error: "repoId is required" });

    try {
      const token = await getOrRefreshToken(req.user.username, provider);
      if (!token) return res.status(401).json({ error: `Not connected to ${provider}` });

      const detail = await gitService.fetchPRDetail(provider, token, repoId, prNumber);
      res.json(detail);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Summarize PR Diff using Llama 3.1
  router.post("/prs/:provider/:prNumber/summarize", authenticateUser, async (req, res) => {
    const { provider, prNumber } = req.params;
    const { repoId } = req.body;
    if (!repoId) return res.status(400).json({ error: "repoId is required" });

    try {
      const token = await getOrRefreshToken(req.user.username, provider);
      if (!token) return res.status(401).json({ error: `Not connected to ${provider}` });

      // Fetch PR detail first to obtain diff patches of files
      const detail = await gitService.fetchPRDetail(provider, token, repoId, prNumber);
      if (!detail || !detail.files || detail.files.length === 0) {
        return res.json({ summary: "No file changes or diff available to summarize." });
      }

      // Combine patches of files
      const diffText = detail.files
        .map(f => `File: ${f.filename}\n${f.patch}`)
        .join("\n\n");

      const summary = await aiService.summarizeDiff(diffText);
      res.json({ summary });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Fetch CI/CD pipeline runs
  router.get("/pipelines/:provider", authenticateUser, async (req, res) => {
    const { provider } = req.params;
    const { repoId } = req.query;
    if (!repoId) return res.status(400).json({ error: "repoId is required" });

    try {
      const token = await getOrRefreshToken(req.user.username, provider);
      if (!token) return res.status(401).json({ error: `Not connected to ${provider}` });

      const runs = await gitService.fetchPipelines(provider, token, repoId);
      res.json(runs);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Fetch failed job logs
  router.get("/pipelines/:provider/:runId/logs", authenticateUser, async (req, res) => {
    const { provider, runId } = req.params;
    const { repoId } = req.query;
    if (!repoId) return res.status(400).json({ error: "repoId is required" });

    try {
      const token = await getOrRefreshToken(req.user.username, provider);
      if (!token) return res.status(401).json({ error: `Not connected to ${provider}` });

      const logData = await gitService.fetchPipelineJobsAndLogs(provider, token, repoId, runId);
      res.json(logData);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Analyze failed logs using Llama 3.1
  router.post("/pipelines/:provider/:runId/analyze", authenticateUser, async (req, res) => {
    const { provider, runId } = req.params;
    const { repoId, logs } = req.body;
    if (!repoId) return res.status(400).json({ error: "repoId is required" });

    let logContent = logs;
    try {
      const token = await getOrRefreshToken(req.user.username, provider);
      if (!token) return res.status(401).json({ error: `Not connected to ${provider}` });

      // If logs are not provided in body, fetch them from API
      if (!logContent) {
        const fetchedLogs = await gitService.fetchPipelineJobsAndLogs(provider, token, repoId, runId);
        logContent = fetchedLogs?.logs || "";
      }

      if (!logContent) {
        return res.json({ analysis: "No log output available to analyze." });
      }

      const analysis = await aiService.analyzeLogs(logContent);
      res.json({ analysis });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Approve a pull request
  router.post("/prs/:provider/:prNumber/approve", authenticateUser, async (req, res) => {
    const { provider, prNumber } = req.params;
    const { repoId } = req.body;
    if (!repoId) return res.status(400).json({ error: "repoId is required" });

    try {
      const token = await getOrRefreshToken(req.user.username, provider);
      if (!token) return res.status(401).json({ error: `Not connected to ${provider}` });

      const result = await gitService.approvePR(provider, token, repoId, prNumber);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Request changes on a pull request
  router.post("/prs/:provider/:prNumber/request-changes", authenticateUser, async (req, res) => {
    const { provider, prNumber } = req.params;
    const { repoId, comment } = req.body;
    if (!repoId) return res.status(400).json({ error: "repoId is required" });

    try {
      const token = await getOrRefreshToken(req.user.username, provider);
      if (!token) return res.status(401).json({ error: `Not connected to ${provider}` });

      const result = await gitService.requestChangesPR(provider, token, repoId, prNumber, comment);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Merge a pull request
  router.post("/prs/:provider/:prNumber/merge", authenticateUser, async (req, res) => {
    const { provider, prNumber } = req.params;
    const { repoId, mergeMethod } = req.body;
    if (!repoId) return res.status(400).json({ error: "repoId is required" });

    try {
      const token = await getOrRefreshToken(req.user.username, provider);
      if (!token) return res.status(401).json({ error: `Not connected to ${provider}` });

      const result = await gitService.mergePR(provider, token, repoId, prNumber, mergeMethod);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Re-run a failed pipeline run
  router.post("/pipelines/:provider/:runId/rerun", authenticateUser, async (req, res) => {
    const { provider, runId } = req.params;
    const { repoId } = req.body;
    if (!repoId) return res.status(400).json({ error: "repoId is required" });

    try {
      const token = await getOrRefreshToken(req.user.username, provider);
      if (!token) return res.status(401).json({ error: `Not connected to ${provider}` });

      const result = await gitService.rerunPipeline(provider, token, repoId, runId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Programmatically set up webhooks for GitHub/GitLab repository
  router.post("/webhooks/setup", authenticateUser, async (req, res) => {
    const { provider, repoId, targetUrl } = req.body;
    if (!provider || !repoId) {
      return res.status(400).json({ error: "provider and repoId are required" });
    }

    const webhookUrl = targetUrl || process.env.WEBHOOK_URL;
    if (!webhookUrl) {
      return res.status(400).json({ error: "webhookUrl is required (or set WEBHOOK_URL in .env)" });
    }

    try {
      const token = await getOrRefreshToken(req.user.username, provider);
      if (!token) return res.status(401).json({ error: `Not connected to ${provider}` });

      const secret = process.env.WEBHOOK_SECRET || "gitcube_secret";

      if (provider === "github") {
        const response = await axios.post(
          `https://api.github.com/repos/${repoId}/hooks`,
          {
            name: "web",
            active: true,
            events: ["pull_request", "workflow_run"],
            config: {
              url: `${webhookUrl}/api/webhooks/github`,
              content_type: "json",
              secret: secret
            }
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
              "User-Agent": "gitCube-App"
            }
          }
        );
        res.json({ success: true, message: "GitHub webhook created successfully", data: response.data });
      } else if (provider === "gitlab") {
        const response = await axios.post(
          `https://gitlab.com/api/v4/projects/${repoId}/hooks`,
          {
            url: `${webhookUrl}/api/webhooks/gitlab`,
            push_events: false,
            merge_requests_events: true,
            pipeline_events: true,
            token: secret
          },
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        res.json({ success: true, message: "GitLab webhook created successfully", data: response.data });
      } else {
        res.status(400).json({ error: "Unsupported webhook provider" });
      }
    } catch (error) {
      console.error("Webhook Setup Error:", error.response?.data || error.message);
      res.status(500).json({ error: error.response?.data?.message || error.message });
    }
  });

  return router;
};
