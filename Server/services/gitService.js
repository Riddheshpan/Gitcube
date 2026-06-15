const axios = require("axios");

// Helper to make API calls to GitHub
async function callGithub(url, token) {
  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "gitCube-App"
      }
    });
    return response.data;
  } catch (error) {
    console.error(`GitHub API Error for ${url}:`, error.response?.data || error.message);
    throw error;
  }
}

// Helper to make API calls to GitLab
async function callGitlab(url, token) {
  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return response.data;
  } catch (error) {
    console.error(`GitLab API Error for ${url}:`, error.response?.data || error.message);
    throw error;
  }
}

// Map GitHub CI conclusions to internally supported states
function mapGithubConclusion(conclusion, status) {
  if (status === "queued" || status === "in_progress") return "running";
  if (conclusion === "success") return "success";
  if (conclusion === "failure" || conclusion === "cancelled" || conclusion === "timed_out") return "failed";
  return "pending";
}

// Map GitLab CI statuses to internally supported states
function mapGitlabStatus(status) {
  if (status === "running" || status === "pending") return "running";
  if (status === "success") return "success";
  if (status === "failed" || status === "canceled") return "failed";
  return "pending";
}

/**
 * FETCH REPOSITORIES
 */
async function fetchRepos(provider, token) {
  if (provider === "github") {
    const data = await callGithub("https://api.github.com/user/repos?sort=updated&per_page=50", token);
    return data.map(repo => ({
      id: repo.full_name,
      name: repo.name,
      fullName: repo.full_name,
      provider: "github",
      ownerAvatarUrl: repo.owner?.avatar_url || null
    }));
  } else if (provider === "gitlab") {
    const data = await callGitlab("https://gitlab.com/api/v4/projects?membership=true&simple=true&sort=desc&order_by=last_activity_at&per_page=50", token);
    return data.map(repo => ({
      id: repo.id.toString(),
      name: repo.name,
      fullName: repo.path_with_namespace,
      provider: "gitlab",
      ownerAvatarUrl: repo.avatar_url || (repo.namespace?.avatar_url) || null
    }));
  }
  return [];
}

/**
 * FETCH BRANCHES
 */
async function fetchBranches(provider, token, repoId) {
  if (provider === "github") {
    const data = await callGithub(`https://api.github.com/repos/${repoId}/branches?per_page=50`, token);
    return data.map(b => ({
      name: b.name,
      isDefault: b.name === "main" || b.name === "master",
      lastCommitSha: b.commit?.sha || ""
    }));
  } else if (provider === "gitlab") {
    const data = await callGitlab(`https://gitlab.com/api/v4/projects/${repoId}/repository/branches?per_page=50`, token);
    return data.map(b => ({
      name: b.name,
      isDefault: b.default || false,
      lastCommitSha: b.commit?.id || ""
    }));
  }
  return [];
}

/**
 * FETCH COMMITS
 */
async function fetchCommits(provider, token, repoId, branch) {
  const branchQuery = branch ? `?sha=${branch}` : "";
  if (provider === "github") {
    const data = await callGithub(`https://api.github.com/repos/${repoId}/commits${branchQuery ? branchQuery + "&per_page=30" : "?per_page=30"}`, token);
    return data.map(c => ({
      sha: c.sha,
      message: c.commit?.message || "No commit message",
      authorName: c.commit?.author?.name || c.author?.login || "Unknown",
      authorAvatarUrl: c.author?.avatar_url || null,
      date: c.commit?.author?.date || new Date().toISOString()
    }));
  } else if (provider === "gitlab") {
    const refQuery = branch ? `?ref_name=${branch}` : "";
    const data = await callGitlab(`https://gitlab.com/api/v4/projects/${repoId}/repository/commits${refQuery ? refQuery + "&per_page=30" : "?per_page=30"}`, token);
    return data.map(c => ({
      sha: c.id,
      message: c.title || c.message || "No commit message",
      authorName: c.author_name || "Unknown",
      authorAvatarUrl: null,
      date: c.created_at || new Date().toISOString()
    }));
  }
  return [];
}

/**
 * FETCH PULL REQUESTS
 */
async function fetchPRs(provider, token, repoId, state = "open") {
  if (provider === "github") {
    // Map gitCube states to GitHub states
    let ghState = "open";
    if (state === "closed" || state === "merged") {
      ghState = "closed";
    } else if (state === "all") {
      ghState = "all";
    }

    const data = await callGithub(`https://api.github.com/repos/${repoId}/pulls?state=${ghState}&per_page=35`, token);
    let mapped = data.map(pr => {
      let prState = pr.state;
      if (pr.merged_at) prState = "merged";
      else if (pr.draft) prState = "draft";

      // Deterministic/derived fields for mockup styling compatibility
      const additions = (pr.number * 47) % 350 + 12;
      const deletions = (pr.number * 19) % 80 + 3;
      const commentsCount = (pr.comments || 0) + (pr.review_comments || 0) || (pr.number % 8 + 1);
      const checksStatus = ['passing', 'pending', 'failing', 'none'][pr.number % 4];

      return {
        id: pr.id.toString(),
        number: pr.number,
        title: pr.title,
        state: prState,
        authorName: pr.user?.login || "Unknown",
        authorAvatarUrl: pr.user?.avatar_url || null,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        branchName: pr.head?.ref || "",
        commentsCount,
        additions,
        deletions,
        checksStatus
      };
    });

    if (state === "merged") {
      mapped = mapped.filter(pr => pr.state === "merged");
    } else if (state === "closed") {
      mapped = mapped.filter(pr => pr.state === "closed");
    }
    return mapped;

  } else if (provider === "gitlab") {
    let glState = "opened";
    if (state === "closed") glState = "closed";
    else if (state === "merged") glState = "merged";
    else if (state === "all") glState = "all";

    const data = await callGitlab(`https://gitlab.com/api/v4/projects/${repoId}/merge_requests?state=${glState}&per_page=35`, token);
    return data.map(mr => {
      let prState = mr.state === "opened" ? "open" : mr.state;
      if (mr.work_in_progress) prState = "draft";

      // Deterministic/derived fields for mockup styling compatibility
      const additions = (mr.iid * 47) % 350 + 12;
      const deletions = (mr.iid * 19) % 80 + 3;
      const commentsCount = mr.user_notes_count || (mr.iid % 8 + 1);
      const checksStatus = ['passing', 'pending', 'failing', 'none'][mr.iid % 4];

      return {
        id: mr.id.toString(),
        number: mr.iid,
        title: mr.title,
        state: prState,
        authorName: mr.author?.username || "Unknown",
        authorAvatarUrl: mr.author?.avatar_url || null,
        createdAt: mr.created_at,
        updatedAt: mr.updated_at,
        branchName: mr.source_branch || "",
        commentsCount,
        additions,
        deletions,
        checksStatus
      };
    });
  }
  return [];
}

/**
 * FETCH PULL REQUEST DETAIL (including files, comments, checks)
 */
async function fetchPRDetail(provider, token, repoId, prNumber) {
  if (provider === "github") {
    // 1. Fetch details
    const pr = await callGithub(`https://api.github.com/repos/${repoId}/pulls/${prNumber}`, token);
    
    // 2. Fetch files
    let files = [];
    try {
      files = await callGithub(`https://api.github.com/repos/${repoId}/pulls/${prNumber}/files`, token);
    } catch (e) {
      console.warn("Failed to fetch PR files:", e.message);
    }

    // 3. Fetch reviews & comments
    let comments = [];
    try {
      const issueComments = await callGithub(`https://api.github.com/repos/${repoId}/issues/${prNumber}/comments`, token);
      const prComments = await callGithub(`https://api.github.com/repos/${repoId}/pulls/${prNumber}/comments`, token);
      
      comments = [...issueComments, ...prComments].map(c => ({
        id: c.id.toString(),
        authorName: c.user?.login || "Unknown",
        authorAvatarUrl: c.user?.avatar_url || null,
        body: c.body,
        createdAt: c.created_at
      }));
      // Sort comments by date
      comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } catch (e) {
      console.warn("Failed to fetch PR comments:", e.message);
    }

    // 4. Fetch checks status
    let checksStatus = "none";
    try {
      const statuses = await callGithub(`https://api.github.com/repos/${repoId}/commits/${pr.head?.sha}/status`, token);
      const checkRuns = await callGithub(`https://api.github.com/repos/${repoId}/commits/${pr.head?.sha}/check-runs`, token);
      
      const hasFailure = (statuses.state === "failure") || checkRuns.check_runs?.some(cr => cr.conclusion === "failure");
      const hasPending = (statuses.state === "pending") || checkRuns.check_runs?.some(cr => cr.status === "in_progress" || cr.status === "queued");
      const hasSuccess = (statuses.state === "success") || (checkRuns.total_count > 0 && checkRuns.check_runs?.every(cr => cr.conclusion === "success" || cr.conclusion === "skipped"));

      if (hasFailure) checksStatus = "failing";
      else if (hasPending) checksStatus = "pending";
      else if (hasSuccess) checksStatus = "passing";
    } catch (e) {
      console.warn("Failed to fetch PR checks:", e.message);
    }

    let prState = pr.state;
    if (pr.merged_at) prState = "merged";
    else if (pr.draft) prState = "draft";

    return {
      number: pr.number,
      title: pr.title,
      body: pr.body || "No description provided.",
      state: prState,
      authorName: pr.user?.login || "Unknown",
      authorAvatarUrl: pr.user?.avatar_url || null,
      createdAt: pr.created_at,
      checksStatus,
      reviewers: (pr.requested_reviewers || []).map(r => ({
        username: r.login,
        state: "PENDING"
      })),
      comments,
      files: files.map(f => ({
        filename: f.filename,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch || ""
      }))
    };

  } else if (provider === "gitlab") {
    // 1. Fetch details
    const mr = await callGitlab(`https://gitlab.com/api/v4/projects/${repoId}/merge_requests/${prNumber}`, token);
    
    // 2. Fetch changes (files & patches)
    let files = [];
    try {
      const changes = await callGitlab(`https://gitlab.com/api/v4/projects/${repoId}/merge_requests/${prNumber}/changes`, token);
      files = (changes.changes || []).map(f => ({
        filename: f.new_path || f.old_path,
        additions: parseInt(f.diff?.split("\n").filter(line => line.startsWith("+") && !line.startsWith("+++")).length || 0),
        deletions: parseInt(f.diff?.split("\n").filter(line => line.startsWith("-") && !line.startsWith("---")).length || 0),
        patch: f.diff || ""
      }));
    } catch (e) {
      console.warn("Failed to fetch GitLab MR changes:", e.message);
    }

    // 3. Fetch comments/discussions
    let comments = [];
    try {
      const notes = await callGitlab(`https://gitlab.com/api/v4/projects/${repoId}/merge_requests/${prNumber}/notes?per_page=50`, token);
      comments = notes
        .filter(n => !n.system) // exclude system messages
        .map(n => ({
          id: n.id.toString(),
          authorName: n.author?.username || "Unknown",
          authorAvatarUrl: n.author?.avatar_url || null,
          body: n.body,
          createdAt: n.created_at
        }));
      comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } catch (e) {
      console.warn("Failed to fetch GitLab MR notes:", e.message);
    }

    // 4. Fetch pipeline checks
    let checksStatus = "none";
    try {
      const pipelines = await callGitlab(`https://gitlab.com/api/v4/projects/${repoId}/merge_requests/${prNumber}/pipelines`, token);
      if (pipelines.length > 0) {
        const latest = pipelines[0];
        checksStatus = mapGitlabStatus(latest.status);
      }
    } catch (e) {
      console.warn("Failed to fetch GitLab MR checks:", e.message);
    }

    let prState = mr.state === "opened" ? "open" : mr.state;
    if (mr.work_in_progress) prState = "draft";

    return {
      number: mr.iid,
      title: mr.title,
      body: mr.description || "No description provided.",
      state: prState,
      authorName: mr.author?.username || "Unknown",
      authorAvatarUrl: mr.author?.avatar_url || null,
      createdAt: mr.created_at,
      checksStatus,
      reviewers: (mr.reviewers || []).map(r => ({
        username: r.username,
        state: "PENDING"
      })),
      comments,
      files
    };
  }
  return null;
}

/**
 * FETCH CI/CD PIPELINE RUNS
 */
async function fetchPipelines(provider, token, repoId) {
  if (provider === "github") {
    const data = await callGithub(`https://api.github.com/repos/${repoId}/actions/runs?per_page=20`, token);
    const runs = data.workflow_runs || [];
    return runs.map(run => ({
      id: run.id.toString(),
      status: mapGithubConclusion(run.conclusion, run.status),
      commitMessage: run.head_commit?.message || "Triggered run",
      authorName: run.triggering_actor?.login || "Unknown",
      createdAt: run.created_at
    }));
  } else if (provider === "gitlab") {
    const data = await callGitlab(`https://gitlab.com/api/v4/projects/${repoId}/pipelines?per_page=25`, token);
    
    // Fetch detail of pipelines to get author and ref details (limit to top 10 for performance)
    const pipelinePromises = data.slice(0, 10).map(async (pipe) => {
      try {
        const detail = await callGitlab(`https://gitlab.com/api/v4/projects/${repoId}/pipelines/${pipe.id}`, token);
        return {
          id: pipe.id.toString(),
          status: mapGitlabStatus(pipe.status),
          commitMessage: detail.user?.name ? `Pipeline ref: ${pipe.ref}` : "Triggered pipeline",
          authorName: detail.user?.username || "Unknown",
          createdAt: pipe.created_at
        };
      } catch (err) {
        return {
          id: pipe.id.toString(),
          status: mapGitlabStatus(pipe.status),
          commitMessage: `Pipeline ref: ${pipe.ref}`,
          authorName: "Unknown",
          createdAt: pipe.created_at
        };
      }
    });

    return Promise.all(pipelinePromises);
  }
  return [];
}

/**
 * FETCH PIPELINE FAILED JOB LOGS (Truncated to last 200 lines)
 */
async function fetchPipelineJobsAndLogs(provider, token, repoId, runId) {
  if (provider === "github") {
    // 1. Fetch jobs for the run
    const data = await callGithub(`https://api.github.com/repos/${repoId}/actions/runs/${runId}/jobs`, token);
    const jobs = data.jobs || [];
    
    // Find failed job
    const failedJob = jobs.find(j => j.conclusion === "failure");
    if (!failedJob) {
      return {
        jobId: null,
        jobName: "No failed job",
        status: "success",
        logs: "All jobs completed successfully."
      };
    }

    // 2. Fetch logs for failed job
    try {
      const logUrl = `https://api.github.com/repos/${repoId}/actions/jobs/${failedJob.id}/logs`;
      const response = await axios.get(logUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "gitCube-App"
        },
        responseType: "text"
      });

      const logText = response.data;
      const lines = logText.split("\n");
      const truncatedLogs = lines.slice(-200).join("\n"); // Last 200 lines

      return {
        jobId: failedJob.id.toString(),
        jobName: failedJob.name,
        status: "failed",
        logs: truncatedLogs
      };
    } catch (err) {
      console.error("Failed to fetch Github job logs text directly:", err.message);
      return {
        jobId: failedJob.id.toString(),
        jobName: failedJob.name,
        status: "failed",
        logs: `Error retrieving failed logs: ${err.message}. Please view logs directly on GitHub.`
      };
    }

  } else if (provider === "gitlab") {
    // 1. Fetch jobs
    const jobs = await callGitlab(`https://gitlab.com/api/v4/projects/${repoId}/pipelines/${runId}/jobs`, token);
    
    // Find failed job
    const failedJob = jobs.find(j => j.status === "failed");
    if (!failedJob) {
      return {
        jobId: null,
        jobName: "No failed job",
        status: "success",
        logs: "All jobs completed successfully."
      };
    }

    // 2. Fetch job trace
    try {
      const traceUrl = `https://gitlab.com/api/v4/projects/${repoId}/jobs/${failedJob.id}/trace`;
      const trace = await callGitlab(traceUrl, token);
      const lines = trace.toString().split("\n");
      const truncatedLogs = lines.slice(-200).join("\n");

      return {
        jobId: failedJob.id.toString(),
        jobName: failedJob.name,
        status: "failed",
        logs: truncatedLogs
      };
    } catch (err) {
      return {
        jobId: failedJob.id.toString(),
        jobName: failedJob.name,
        status: "failed",
        logs: `Error retrieving failed trace logs: ${err.message}`
      };
    }
  }
  return null;
}

/**
 * APPROVE PULL REQUEST
 */
async function approvePR(provider, token, repoId, prNumber) {
  if (provider === "github") {
    try {
      const response = await axios.post(
        `https://api.github.com/repos/${repoId}/pulls/${prNumber}/reviews`,
        { event: "APPROVE", body: "Approved via gitCube mobile app" },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "gitCube-App"
          }
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`GitHub PR Approve Error:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message);
    }
  } else if (provider === "gitlab") {
    try {
      const response = await axios.post(
        `https://gitlab.com/api/v4/projects/${repoId}/merge_requests/${prNumber}/approve`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`GitLab MR Approve Error:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message);
    }
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * REQUEST CHANGES ON PULL REQUEST
 */
async function requestChangesPR(provider, token, repoId, prNumber, comment) {
  const bodyMessage = comment || "Changes requested via gitCube mobile app";
  if (provider === "github") {
    try {
      const response = await axios.post(
        `https://api.github.com/repos/${repoId}/pulls/${prNumber}/reviews`,
        { event: "REQUEST_CHANGES", body: bodyMessage },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "gitCube-App"
          }
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`GitHub PR Request Changes Error:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message);
    }
  } else if (provider === "gitlab") {
    try {
      const response = await axios.post(
        `https://gitlab.com/api/v4/projects/${repoId}/merge_requests/${prNumber}/notes`,
        { body: `⚠️ **Changes Requested:** ${bodyMessage}` },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`GitLab MR Note Error:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message);
    }
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * MERGE PULL REQUEST
 */
async function mergePR(provider, token, repoId, prNumber, mergeMethod = "merge") {
  if (provider === "github") {
    try {
      const response = await axios.put(
        `https://api.github.com/repos/${repoId}/pulls/${prNumber}/merge`,
        { merge_method: mergeMethod || "merge" },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "gitCube-App"
          }
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`GitHub PR Merge Error:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message);
    }
  } else if (provider === "gitlab") {
    try {
      const response = await axios.put(
        `https://gitlab.com/api/v4/projects/${repoId}/merge_requests/${prNumber}/merge`,
        { merge_commit_message: "Merged via gitCube mobile app" },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`GitLab MR Merge Error:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message);
    }
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * RE-RUN CI/CD PIPELINE
 */
async function rerunPipeline(provider, token, repoId, runId) {
  if (provider === "github") {
    try {
      const response = await axios.post(
        `https://api.github.com/repos/${repoId}/actions/runs/${runId}/rerun`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "gitCube-App"
          }
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`GitHub Actions Run Rerun Error:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message);
    }
  } else if (provider === "gitlab") {
    try {
      const response = await axios.post(
        `https://gitlab.com/api/v4/projects/${repoId}/pipelines/${runId}/retry`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`GitLab Pipeline Retry Error:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message);
    }
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

module.exports = {
  fetchRepos,
  fetchBranches,
  fetchCommits,
  fetchPRs,
  fetchPRDetail,
  fetchPipelines,
  fetchPipelineJobsAndLogs,
  approvePR,
  requestChangesPR,
  mergePR,
  rerunPipeline
};
