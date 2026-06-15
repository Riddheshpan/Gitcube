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
      id: i.id.toString(),
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

function mapIssueStatus(labels: any[]): GHCard['status'] {
  const names = labels.map((l: any) => l.name?.toLowerCase() ?? '');
  if (names.some(n => n.includes('in progress') || n.includes('wip'))) return 'inprogress';
  if (names.some(n => n.includes('done') || n.includes('complete'))) return 'done';
  if (names.some(n => n.includes('todo') || n.includes('to do') || n.includes('ready'))) return 'todo';
  return 'backlog';
}
