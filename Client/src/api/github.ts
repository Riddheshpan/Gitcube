/**
 * GitHub Direct API helpers — no server needed.
 * All calls go straight to api.github.com using the user's stored github_token.
 */

export const GITHUB_API = 'https://api.github.com';

function ghHeaders(token: string) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'gitCube-App',
  };
}

// ─── User / Auth ───────────────────────────────────────────────────────────

export async function getGitHubUser(token: string) {
  const res = await fetch(`${GITHUB_API}/user`, { headers: ghHeaders(token) });
  if (!res.ok) throw new Error(`GitHub user fetch failed: ${res.status}`);
  return res.json();
}

// ─── Repos ─────────────────────────────────────────────────────────────────

export interface GHRepo {
  id: string;
  name: string;
  fullName: string;
  provider: 'github';
  ownerAvatarUrl: string | null;
  private: boolean;
  defaultBranch: string;
  fullNameRaw: string; // owner/repo format for API calls
}

export async function getRepos(token: string): Promise<GHRepo[]> {
  const res = await fetch(
    `${GITHUB_API}/user/repos?affiliation=owner,collaborator&sort=updated&per_page=50`,
    { headers: ghHeaders(token) }
  );
  if (!res.ok) throw new Error(`GitHub repos fetch failed: ${res.status}`);
  const data = await res.json();
  return data.map((r: any): GHRepo => ({
    id: r.full_name,
    name: r.name,
    fullName: r.full_name,
    fullNameRaw: r.full_name,
    provider: 'github',
    ownerAvatarUrl: r.owner?.avatar_url ?? null,
    private: r.private,
    defaultBranch: r.default_branch ?? 'main',
  }));
}

// ─── Branches ──────────────────────────────────────────────────────────────

export interface GHBranch {
  name: string;
  isDefault: boolean;
  lastCommitSha: string;
}

export async function getBranches(token: string, fullName: string, defaultBranch = 'main'): Promise<GHBranch[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${fullName}/branches?per_page=50`,
    { headers: ghHeaders(token) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((b: any): GHBranch => ({
    name: b.name,
    isDefault: b.name === defaultBranch,
    lastCommitSha: b.commit?.sha ?? '',
  }));
}

// ─── Commits ───────────────────────────────────────────────────────────────

export interface GHCommit {
  sha: string;
  message: string;
  authorName: string;
  authorAvatarUrl: string | null;
  date: string;
}

export async function getCommits(token: string, fullName: string, branch?: string): Promise<GHCommit[]> {
  const branchParam = branch ? `&sha=${encodeURIComponent(branch)}` : '';
  const res = await fetch(
    `${GITHUB_API}/repos/${fullName}/commits?per_page=30${branchParam}`,
    { headers: ghHeaders(token) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((c: any): GHCommit => ({
    sha: c.sha,
    message: c.commit?.message?.split('\n')[0] ?? '',
    authorName: c.commit?.author?.name ?? c.author?.login ?? 'Unknown',
    authorAvatarUrl: c.author?.avatar_url ?? null,
    date: c.commit?.author?.date ?? '',
  }));
}

// ─── Pull Requests ─────────────────────────────────────────────────────────

export interface GHPR {
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
  additions?: number;
  deletions?: number;
  checksStatus: 'passing' | 'failing' | 'pending' | 'none';
}

export async function getPRs(token: string, fullName: string, state: 'open' | 'closed' | 'all' = 'all'): Promise<GHPR[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${fullName}/pulls?state=${state}&per_page=30&sort=updated`,
    { headers: ghHeaders(token) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((pr: any): GHPR => ({
    id: pr.id.toString(),
    number: pr.number,
    title: pr.title,
    state: pr.draft ? 'draft' : pr.merged_at ? 'merged' : pr.state === 'closed' ? 'closed' : 'open',
    authorName: pr.user?.login ?? 'Unknown',
    authorAvatarUrl: pr.user?.avatar_url ?? null,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    branchName: pr.head?.ref,
    commentsCount: pr.comments ?? 0,
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    checksStatus: 'none',
  }));
}

export interface GHPRDetail extends GHPR {
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

export async function getPRDetail(token: string, fullName: string, prNumber: string): Promise<GHPRDetail | null> {
  // 1. Fetch details
  const prRes = await fetch(`${GITHUB_API}/repos/${fullName}/pulls/${prNumber}`, { headers: ghHeaders(token) });
  if (!prRes.ok) return null;
  const pr = await prRes.json();

  // 2. Fetch files
  let files = [];
  try {
    const filesRes = await fetch(`${GITHUB_API}/repos/${fullName}/pulls/${prNumber}/files`, { headers: ghHeaders(token) });
    if (filesRes.ok) files = await filesRes.json();
  } catch (e) {
    console.warn("Failed to fetch PR files", e);
  }

  // 3. Fetch reviews & comments
  let comments: GHPRDetail['comments'] = [];
  try {
    const issueCommentsRes = await fetch(`${GITHUB_API}/repos/${fullName}/issues/${prNumber}/comments`, { headers: ghHeaders(token) });
    const prCommentsRes = await fetch(`${GITHUB_API}/repos/${fullName}/pulls/${prNumber}/comments`, { headers: ghHeaders(token) });
    
    const issueComments = issueCommentsRes.ok ? await issueCommentsRes.json() : [];
    const prComments = prCommentsRes.ok ? await prCommentsRes.json() : [];
    
    comments = [...issueComments, ...prComments].map((c: any) => ({
      id: c.id.toString(),
      authorName: c.user?.login ?? "Unknown",
      authorAvatarUrl: c.user?.avatar_url ?? null,
      body: c.body,
      createdAt: c.created_at
    }));
    comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch (e) {
    console.warn("Failed to fetch PR comments", e);
  }

  // 4. Fetch checks status
  let checksStatus: GHPRDetail['checksStatus'] = "none";
  try {
    const statusesRes = await fetch(`${GITHUB_API}/repos/${fullName}/commits/${pr.head?.sha}/status`, { headers: ghHeaders(token) });
    const checkRunsRes = await fetch(`${GITHUB_API}/repos/${fullName}/commits/${pr.head?.sha}/check-runs`, { headers: ghHeaders(token) });
    
    const statuses = statusesRes.ok ? await statusesRes.json() : { state: 'unknown' };
    const checkRuns = checkRunsRes.ok ? await checkRunsRes.json() : { check_runs: [], total_count: 0 };
    
    const hasFailure = (statuses.state === "failure") || checkRuns.check_runs?.some((cr: any) => cr.conclusion === "failure");
    const hasPending = (statuses.state === "pending") || checkRuns.check_runs?.some((cr: any) => cr.status === "in_progress" || cr.status === "queued");
    const hasSuccess = (statuses.state === "success") || (checkRuns.total_count > 0 && checkRuns.check_runs?.every((cr: any) => cr.conclusion === "success" || cr.conclusion === "skipped"));

    if (hasFailure) checksStatus = "failing";
    else if (hasPending) checksStatus = "pending";
    else if (hasSuccess) checksStatus = "passing";
  } catch (e) {
    console.warn("Failed to fetch PR checks", e);
  }

  return {
    id: pr.id.toString(),
    number: pr.number,
    title: pr.title,
    body: pr.body || "No description provided.",
    state: pr.draft ? 'draft' : pr.merged_at ? 'merged' : pr.state === 'closed' ? 'closed' : 'open',
    authorName: pr.user?.login || "Unknown",
    authorAvatarUrl: pr.user?.avatar_url || null,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    checksStatus,
    reviewers: (pr.requested_reviewers || []).map((r: any) => ({
      username: r.login,
      state: "PENDING"
    })),
    comments,
    files: files.map((f: any) => ({
      filename: f.filename,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch || ""
    }))
  };
}

export async function approvePR(token: string, fullName: string, prNumber: string) {
  const res = await fetch(`${GITHUB_API}/repos/${fullName}/pulls/${prNumber}/reviews`, {
    method: 'POST',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'APPROVE', body: 'Approved via gitCube standalone' })
  });
  if (!res.ok) throw new Error(`Approve failed: ${res.status}`);
}

export async function requestChangesPR(token: string, fullName: string, prNumber: string, comment: string) {
  const res = await fetch(`${GITHUB_API}/repos/${fullName}/pulls/${prNumber}/reviews`, {
    method: 'POST',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'REQUEST_CHANGES', body: comment || 'Changes requested via gitCube standalone' })
  });
  if (!res.ok) throw new Error(`Request changes failed: ${res.status}`);
}

export async function mergePR(token: string, fullName: string, prNumber: string, mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge') {
  const res = await fetch(`${GITHUB_API}/repos/${fullName}/pulls/${prNumber}/merge`, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ merge_method: mergeMethod })
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Merge failed: ${res.status}`);
  }
}

// ─── CI / Actions Runs ──────────────────────────────────────────────────────

export interface GHPipeline {
  id: string;
  status: 'success' | 'failed' | 'running' | 'pending';
  commitMessage: string;
  authorName: string;
  createdAt: string;
}

export async function getPipelines(token: string, fullName: string): Promise<GHPipeline[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${fullName}/actions/runs?per_page=20`,
    { headers: ghHeaders(token) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const runs: any[] = data.workflow_runs ?? [];
  return runs.map((r: any): GHPipeline => ({
    id: r.id.toString(),
    status: mapRunStatus(r.conclusion, r.status),
    commitMessage: r.head_commit?.message?.split('\n')[0] ?? '',
    authorName: r.actor?.login ?? 'Unknown',
    createdAt: r.created_at,
  }));
}

function mapRunStatus(conclusion: string | null, status: string): GHPipeline['status'] {
  if (status === 'in_progress' || status === 'queued') return conclusion === null ? (status === 'queued' ? 'pending' : 'running') : 'running';
  if (conclusion === 'success') return 'success';
  if (conclusion === 'failure' || conclusion === 'cancelled') return 'failed';
  if (status === 'queued') return 'pending';
  return 'pending';
}

export async function getPipelineLogs(token: string, fullName: string, runId: string) {
  // 1. Fetch jobs
  const jobsRes = await fetch(`${GITHUB_API}/repos/${fullName}/actions/runs/${runId}/jobs`, { headers: ghHeaders(token) });
  if (!jobsRes.ok) throw new Error('Failed to fetch jobs');
  const jobsData = await jobsRes.json();
  const jobs = jobsData.jobs || [];

  const failedJob = jobs.find((j: any) => j.conclusion === "failure");
  if (!failedJob) {
    return {
      jobId: null,
      jobName: "No failed job",
      status: "success" as const,
      logs: "All jobs completed successfully."
    };
  }

  try {
    const logRes = await fetch(`${GITHUB_API}/repos/${fullName}/actions/jobs/${failedJob.id}/logs`, {
      headers: { ...ghHeaders(token), 'Accept': 'application/vnd.github+json' }
    });
    const logText = await logRes.text();
    const lines = logText.split('\n');
    const truncatedLogs = lines.slice(-200).join('\n');
    
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
      logs: `Error retrieving failed logs: ${err.message}. Please view logs directly on GitHub.`
    };
  }
}

export async function rerunPipeline(token: string, fullName: string, runId: string) {
  const res = await fetch(`${GITHUB_API}/repos/${fullName}/actions/runs/${runId}/rerun`, {
    method: 'POST',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Failed to re-run pipeline: ${res.status}`);
  }
}

// ─── Notifications ──────────────────────────────────────────────────────────

export interface GHNotification {
  _id: string;
  type: 'pr_review' | 'ci_failure' | 'merge_conflict' | 'mention' | 'other';
  title: string;
  body: string;
  read: boolean;
  provider: 'github';
  repoId?: string;
  resourceId?: string;
  createdAt: string;
}

export async function getNotifications(token: string): Promise<GHNotification[]> {
  const res = await fetch(
    `${GITHUB_API}/notifications?all=false&per_page=50`,
    { headers: ghHeaders(token) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((n: any): GHNotification => ({
    _id: n.id,
    type: mapNotifType(n.reason, n.subject?.type),
    title: n.subject?.title ?? n.repository?.full_name ?? 'Notification',
    body: `${n.repository?.full_name ?? ''} — ${n.reason}`,
    read: n.unread === false,
    provider: 'github',
    repoId: n.repository?.full_name,
    resourceId: n.subject?.url,
    createdAt: n.updated_at,
  }));
}

export async function markNotificationRead(token: string, threadId: string): Promise<void> {
  await fetch(`${GITHUB_API}/notifications/threads/${threadId}`, {
    method: 'PATCH',
    headers: ghHeaders(token),
  });
}

export async function markAllNotificationsRead(token: string): Promise<void> {
  await fetch(`${GITHUB_API}/notifications`, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ last_read_at: new Date().toISOString() }),
  });
}

function mapNotifType(reason: string, subjectType: string): GHNotification['type'] {
  if (reason === 'review_requested' || reason === 'comment') return 'pr_review';
  if (reason === 'mention') return 'mention';
  if (reason === 'ci_activity') return 'ci_failure';
  return 'other';
}

// ─── GitHub Issues as Board Cards ───────────────────────────────────────────

export interface GHBoard {
  id: string;
  name: string;
  type: string;
  provider: 'github';
  lastSynced?: string;
}

export interface GHCard {
  id: string;
  title: string;
  description: string;
  status: 'backlog' | 'todo' | 'inprogress' | 'done';
  rawStatus: string;
  provider: 'github';
  labels: string[];
  assignees: { name: string; avatarUrl: string | null }[];
  updatedAt: string;
  linkedPRs?: string[];
}

export async function getBoardsFromRepos(token: string, repos: GHRepo[]): Promise<GHBoard[]> {
  return repos.map(r => ({
    id: r.fullNameRaw,
    name: r.name,
    type: 'github_issues',
    provider: 'github',
  }));
}

export async function getIssuesAsCards(token: string, fullName: string): Promise<GHCard[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${fullName}/issues?state=open&per_page=50`,
    { headers: ghHeaders(token) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data
    .filter((i: any) => !i.pull_request) // exclude PRs from issues list
    .map((i: any): GHCard => ({
      id: i.number.toString(),
      title: i.title,
      description: i.body ?? '',
      status: mapIssueStatus(i.labels),
      rawStatus: i.state,
      provider: 'github',
      labels: (i.labels ?? []).map((l: any) => l.name),
      assignees: (i.assignees ?? []).map((a: any) => ({ name: a.login, avatarUrl: a.avatar_url })),
      updatedAt: i.updated_at,
    }));
}

export async function moveGitHubIssue(token: string, fullName: string, issueNumber: string, targetStatus: 'backlog' | 'todo' | 'inprogress' | 'done') {
  // Fetch current labels to preserve non-status labels
  const getRes = await fetch(`${GITHUB_API}/repos/${fullName}/issues/${issueNumber}`, { headers: ghHeaders(token) });
  if (!getRes.ok) throw new Error('Failed to fetch issue labels');
  const issue = await getRes.json();
  const existingLabels = (issue.labels ?? [])
    .map((l: any) => l.name)
    .filter((n: string) => !['backlog', 'todo', 'to do', 'ready', 'in progress', 'inprogress', 'wip', 'done', 'complete'].includes(n.toLowerCase()));

  if (targetStatus === 'todo') existingLabels.push('todo');
  else if (targetStatus === 'inprogress') existingLabels.push('in progress');
  else if (targetStatus === 'done') existingLabels.push('done');

  const patchRes = await fetch(`${GITHUB_API}/repos/${fullName}/issues/${issueNumber}`, {
    method: 'PATCH',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ labels: existingLabels })
  });

  if (!patchRes.ok) {
    throw new Error(`Failed to move issue: ${patchRes.status}`);
  }
}

function mapIssueStatus(labels: any[]): GHCard['status'] {
  const names = labels.map((l: any) => l.name?.toLowerCase() ?? '');
  if (names.some(n => n.includes('in progress') || n.includes('wip'))) return 'inprogress';
  if (names.some(n => n.includes('done') || n.includes('complete'))) return 'done';
  if (names.some(n => n.includes('todo') || n.includes('to do') || n.includes('ready'))) return 'todo';
  return 'backlog';
}
