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
    id: i.id.toString(),
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

function mapLabelStatus(labels: string[]): GLCard['status'] {
  const names = labels.map(l => l.toLowerCase());
  if (names.some(n => n.includes('in progress') || n.includes('wip'))) return 'inprogress';
  if (names.some(n => n.includes('done') || n.includes('complete'))) return 'done';
  if (names.some(n => n.includes('todo') || n.includes('to do'))) return 'todo';
  return 'backlog';
}
