/**
 * GitLab Direct API helpers — no server needed.
 * All calls go straight to gitlab.com/api/v4 using the user's stored gitlab_token.
 */

export const GITLAB_API = 'https://gitlab.com/api/v4';

function glHeaders(token: string) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ─── User ──────────────────────────────────────────────────────────────────

export async function getGitLabUser(token: string) {
  const res = await fetch(`${GITLAB_API}/user`, { headers: glHeaders(token) });
  if (!res.ok) throw new Error(`GitLab user fetch failed: ${res.status}`);
  return res.json();
}

// ─── Repos / Projects ──────────────────────────────────────────────────────

export interface GLRepo {
  id: string;
  name: string;
  fullName: string;
  provider: 'gitlab';
  ownerAvatarUrl: string | null;
  private: boolean;
  defaultBranch: string;
  numericId: number; // GitLab uses numeric IDs for API calls
}

export async function getRepos(token: string): Promise<GLRepo[]> {
  const res = await fetch(
    `${GITLAB_API}/projects?membership=true&order_by=last_activity_at&per_page=50`,
    { headers: glHeaders(token) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((p: any): GLRepo => ({
    id: p.path_with_namespace,
    name: p.name,
    fullName: p.path_with_namespace,
    provider: 'gitlab',
    ownerAvatarUrl: p.avatar_url ?? p.namespace?.avatar_url ?? null,
    private: p.visibility === 'private',
    defaultBranch: p.default_branch ?? 'main',
    numericId: p.id,
  }));
}

// ─── Branches ──────────────────────────────────────────────────────────────

export interface GLBranch {
  name: string;
  isDefault: boolean;
  lastCommitSha: string;
}

export async function getBranches(token: string, projectId: number, defaultBranch = 'main'): Promise<GLBranch[]> {
  const res = await fetch(
    `${GITLAB_API}/projects/${projectId}/repository/branches?per_page=50`,
    { headers: glHeaders(token) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((b: any): GLBranch => ({
    name: b.name,
    isDefault: b.name === defaultBranch,
    lastCommitSha: b.commit?.id ?? '',
  }));
}

// ─── Commits ───────────────────────────────────────────────────────────────

export interface GLCommit {
  sha: string;
  message: string;
  authorName: string;
  authorAvatarUrl: string | null;
  date: string;
}

export async function getCommits(token: string, projectId: number, branch?: string): Promise<GLCommit[]> {
  const branchParam = branch ? `&ref_name=${encodeURIComponent(branch)}` : '';
  const res = await fetch(
    `${GITLAB_API}/projects/${projectId}/repository/commits?per_page=30${branchParam}`,
    { headers: glHeaders(token) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((c: any): GLCommit => ({
    sha: c.id,
    message: c.title ?? c.message?.split('\n')[0] ?? '',
    authorName: c.author_name ?? 'Unknown',
    authorAvatarUrl: null, // GitLab doesn't return avatar in commit list
    date: c.created_at,
  }));
}

// ─── Merge Requests (= PRs) ────────────────────────────────────────────────

export interface GLMR {
  id: string;
  number: number;
  title: string;
  state: 'open' | 'merged' | 'closed' | 'draft';
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  branchName?: string;
  commentsCount?: number;
  checksStatus: 'passing' | 'failing' | 'pending' | 'none';
}

export async function getMRs(token: string, projectId: number, state: 'opened' | 'closed' | 'merged' | 'all' = 'all'): Promise<GLMR[]> {
  const stateParam = state === 'all' ? '' : `&state=${state}`;
  const res = await fetch(
    `${GITLAB_API}/projects/${projectId}/merge_requests?per_page=30&order_by=updated_at${stateParam}`,
    { headers: glHeaders(token) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((mr: any): GLMR => ({
    id: mr.id.toString(),
    number: mr.iid,
    title: mr.title,
    state: mr.draft ? 'draft' : mr.state === 'merged' ? 'merged' : mr.state === 'closed' ? 'closed' : 'open',
    authorName: mr.author?.username ?? 'Unknown',
    authorAvatarUrl: mr.author?.avatar_url ?? null,
    createdAt: mr.created_at,
    updatedAt: mr.updated_at,
    branchName: mr.source_branch,
    commentsCount: mr.user_notes_count ?? 0,
    checksStatus: 'none',
  }));
}

export interface GLMRDetail extends GLMR {
  body: string;
  reviewers: { username: string; state: string }[];
  comments: {
    id: string;
    authorName: string;
    authorAvatarUrl: string | null;
    body: string;
    createdAt: string;
  }[];
  files: {
    filename: string;
    additions: number;
    deletions: number;
    patch: string;
  }[];
}

export async function getPRDetail(token: string, projectId: number, prNumber: string): Promise<GLMRDetail | null> {
  // 1. Fetch details
  const mrRes = await fetch(`${GITLAB_API}/projects/${projectId}/merge_requests/${prNumber}`, { headers: glHeaders(token) });
  if (!mrRes.ok) return null;
  const mr = await mrRes.json();

  // 2. Fetch changes (files & patches)
  let files = [];
  try {
    const changesRes = await fetch(`${GITLAB_API}/projects/${projectId}/merge_requests/${prNumber}/changes`, { headers: glHeaders(token) });
    if (changesRes.ok) {
      const changes = await changesRes.json();
      files = (changes.changes || []).map((f: any) => ({
        filename: f.new_path || f.old_path,
        additions: parseInt(f.diff?.split("\n").filter((line: string) => line.startsWith("+") && !line.startsWith("+++")).length || 0),
        deletions: parseInt(f.diff?.split("\n").filter((line: string) => line.startsWith("-") && !line.startsWith("---")).length || 0),
        patch: f.diff || ""
      }));
    }
  } catch (e) {
    console.warn("Failed to fetch GitLab MR changes", e);
  }

  // 3. Fetch comments/discussions
  let comments: GLMRDetail['comments'] = [];
  try {
    const notesRes = await fetch(`${GITLAB_API}/projects/${projectId}/merge_requests/${prNumber}/notes?per_page=50`, { headers: glHeaders(token) });
    if (notesRes.ok) {
      const notes = await notesRes.json();
      comments = notes
        .filter((n: any) => !n.system) // exclude system messages
        .map((n: any) => ({
          id: n.id.toString(),
          authorName: n.author?.username || "Unknown",
          authorAvatarUrl: n.author?.avatar_url || null,
          body: n.body,
          createdAt: n.created_at
        }));
      comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
  } catch (e) {
    console.warn("Failed to fetch GitLab MR notes", e);
  }

  // 4. Fetch pipeline checks
  let checksStatus: GLMRDetail['checksStatus'] = "none";
  try {
    const pipelinesRes = await fetch(`${GITLAB_API}/projects/${projectId}/merge_requests/${prNumber}/pipelines`, { headers: glHeaders(token) });
    if (pipelinesRes.ok) {
      const pipelines = await pipelinesRes.json();
      if (pipelines.length > 0) {
        const latest = pipelines[0];
        if (latest.status === 'success') checksStatus = 'passing';
        else if (latest.status === 'failed' || latest.status === 'canceled') checksStatus = 'failing';
        else if (latest.status === 'running' || latest.status === 'pending') checksStatus = 'pending';
      }
    }
  } catch (e) {
    console.warn("Failed to fetch GitLab MR checks", e);
  }

  return {
    id: mr.id.toString(),
    number: mr.iid,
    title: mr.title,
    body: mr.description || "No description provided.",
    state: mr.draft ? 'draft' : mr.state === 'merged' ? 'merged' : mr.state === 'closed' ? 'closed' : 'open',
    authorName: mr.author?.username || "Unknown",
    authorAvatarUrl: mr.author?.avatar_url || null,
    createdAt: mr.created_at,
    updatedAt: mr.updated_at,
    branchName: mr.source_branch,
    checksStatus,
    reviewers: (mr.reviewers || []).map((r: any) => ({
      username: r.username,
      state: "PENDING"
    })),
    comments,
    files
  };
}

export async function approvePR(token: string, projectId: number, prNumber: string) {
  const res = await fetch(`${GITLAB_API}/projects/${projectId}/merge_requests/${prNumber}/approve`, {
    method: 'POST',
    headers: glHeaders(token)
  });
  if (!res.ok) throw new Error(`Approve failed: ${res.status}`);
}

export async function requestChangesPR(token: string, projectId: number, prNumber: string, comment: string) {
  const res = await fetch(`${GITLAB_API}/projects/${projectId}/merge_requests/${prNumber}/notes`, {
    method: 'POST',
    headers: glHeaders(token),
    body: JSON.stringify({ body: `⚠️ **Changes Requested:** ${comment}` })
  });
  if (!res.ok) throw new Error(`Request changes failed: ${res.status}`);
}

export async function mergePR(token: string, projectId: number, prNumber: string, mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge') {
  const res = await fetch(`${GITLAB_API}/projects/${projectId}/merge_requests/${prNumber}/merge`, {
    method: 'PUT',
    headers: glHeaders(token),
    body: JSON.stringify({ merge_commit_message: "Merged via gitCube standalone app" })
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Merge failed: ${res.status}`);
  }
}

// ─── Pipelines ─────────────────────────────────────────────────────────────

export interface GLPipeline {
  id: string;
  status: 'success' | 'failed' | 'running' | 'pending';
  commitMessage: string;
  authorName: string;
  createdAt: string;
}

export async function getPipelines(token: string, projectId: number): Promise<GLPipeline[]> {
  const res = await fetch(
    `${GITLAB_API}/projects/${projectId}/pipelines?per_page=20`,
    { headers: glHeaders(token) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((p: any): GLPipeline => ({
    id: p.id.toString(),
    status: mapPipelineStatus(p.status),
    commitMessage: p.ref ?? '',
    authorName: p.user?.username ?? 'Unknown',
    createdAt: p.created_at,
  }));
}

function mapPipelineStatus(status: string): GLPipeline['status'] {
  if (status === 'success') return 'success';
  if (status === 'failed' || status === 'canceled') return 'failed';
  if (status === 'running') return 'running';
  return 'pending';
}

export async function getPipelineLogs(token: string, projectId: number, runId: string) {
  // 1. Fetch jobs
  const jobsRes = await fetch(`${GITLAB_API}/projects/${projectId}/pipelines/${runId}/jobs`, { headers: glHeaders(token) });
  if (!jobsRes.ok) throw new Error('Failed to fetch jobs');
  const jobs = await jobsRes.json();
  
  // Find failed job
  const failedJob = jobs.find((j: any) => j.status === "failed");
  if (!failedJob) {
    return {
      jobId: null,
      jobName: "No failed job",
      status: "success" as const,
      logs: "All jobs completed successfully."
    };
  }

  // 2. Fetch job trace
  try {
    const traceRes = await fetch(`${GITLAB_API}/projects/${projectId}/jobs/${failedJob.id}/trace`, { headers: glHeaders(token) });
    const traceText = await traceRes.text();
    const lines = traceText.split("\n");
    const truncatedLogs = lines.slice(-200).join("\n");

    return {
      jobId: failedJob.id.toString(),
      jobName: failedJob.name,
      status: "failed" as const,
      logs: truncatedLogs
    };
  } catch (err: any) {
    return {
      jobId: failedJob.id.toString(),
      jobName: failedJob.name,
      status: "failed" as const,
      logs: `Error retrieving failed trace logs: ${err.message}`
    };
  }
}

export async function rerunPipeline(token: string, projectId: number, runId: string) {
  const res = await fetch(`${GITLAB_API}/projects/${projectId}/pipelines/${runId}/retry`, {
    method: 'POST',
    headers: glHeaders(token)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Failed to retry pipeline: ${res.status}`);
  }
}

// ─── Issues as Board ───────────────────────────────────────────────────────

export interface GLCard {
  id: string;
  title: string;
  description: string;
  status: 'backlog' | 'todo' | 'inprogress' | 'done';
  rawStatus: string;
  provider: 'gitlab';
  labels: string[];
  assignees: { name: string; avatarUrl: string | null }[];
  updatedAt: string;
}

export async function getIssuesAsCards(token: string, projectId: number): Promise<GLCard[]> {
  const res = await fetch(
    `${GITLAB_API}/projects/${projectId}/issues?state=opened&per_page=50`,
    { headers: glHeaders(token) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((i: any): GLCard => ({
    id: i.iid.toString(),
    title: i.title,
    description: i.description ?? '',
    status: mapLabelStatus(i.labels),
    rawStatus: i.state,
    provider: 'gitlab',
    labels: i.labels ?? [],
    assignees: (i.assignees ?? []).map((a: any) => ({ name: a.username, avatarUrl: a.avatar_url })),
    updatedAt: i.updated_at,
  }));
}

export async function moveGitLabIssue(token: string, projectId: number, issueIid: string, targetStatus: 'backlog' | 'todo' | 'inprogress' | 'done') {
  const getRes = await fetch(`${GITLAB_API}/projects/${projectId}/issues/${issueIid}`, { headers: glHeaders(token) });
  if (!getRes.ok) throw new Error('Failed to fetch issue labels');
  const issue = await getRes.json();
  
  const existingLabels = (issue.labels ?? [])
    .filter((n: string) => !['backlog', 'todo', 'to do', 'in progress', 'inprogress', 'wip', 'done', 'complete'].includes(n.toLowerCase()));

  if (targetStatus === 'todo') existingLabels.push('todo');
  else if (targetStatus === 'inprogress') existingLabels.push('in progress');
  else if (targetStatus === 'done') existingLabels.push('done');

  const putRes = await fetch(`${GITLAB_API}/projects/${projectId}/issues/${issueIid}`, {
    method: 'PUT',
    headers: glHeaders(token),
    body: JSON.stringify({ labels: existingLabels.join(',') })
  });

  if (!putRes.ok) {
    throw new Error(`Failed to move GitLab issue: ${putRes.status}`);
  }
}

function mapLabelStatus(labels: string[]): GLCard['status'] {
  const names = labels.map(l => l.toLowerCase());
  if (names.some(n => n.includes('in progress') || n.includes('wip'))) return 'inprogress';
  if (names.some(n => n.includes('done') || n.includes('complete'))) return 'done';
  if (names.some(n => n.includes('todo') || n.includes('to do'))) return 'todo';
  return 'backlog';
}
