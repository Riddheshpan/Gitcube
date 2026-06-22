import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, SafeAreaView, ScrollView, Pressable, StyleSheet, ActivityIndicator, Platform, RefreshControl, Image, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getToken, isLoggedIn } from '../../src/api/auth';
import * as GH from '../../src/api/github';
import * as GL from '../../src/api/gitlab';

type TabType = 'prs' | 'commits' | 'branches' | 'ci';
type PRFilterType = 'open' | 'merged' | 'closed' | 'draft' | 'all';

interface Repo {
  id: string;
  name: string;
  fullName: string;
  provider: 'github' | 'gitlab';
  ownerAvatarUrl: string | null;
}

interface Branch {
  name: string;
  isDefault: boolean;
  lastCommitSha: string;
}

interface Commit {
  sha: string;
  message: string;
  authorName: string;
  authorAvatarUrl: string | null;
  date: string;
}

interface PR {
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
  checksStatus?: 'passing' | 'failing' | 'pending' | 'none';
}

interface PipelineRun {
  id: string;
  status: 'success' | 'failed' | 'running' | 'pending';
  commitMessage: string;
  authorName: string;
  createdAt: string;
}

interface CellData {
  level: number;
  commits: number;
  prs: number;
  ci: number;
}

// Color maps for contribution grid
const DARK_CELL_COLORS: Record<number, { bg: string; border: string }> = {
  0: { bg: '#2a2a2a', border: 'transparent' },
  1: { bg: '#4a3800', border: '#6a5200' },
  2: { bg: '#7a5e00', border: '#9a7800' },
  3: { bg: '#b88a00', border: '#d4a800' },
  4: { bg: '#F5C518', border: '#F5C518' },
  5: { bg: '#FFD740', border: '#FFD740' },
};
const LIGHT_CELL_COLORS: Record<number, { bg: string; border: string }> = {
  0: { bg: '#e5e7eb', border: 'transparent' },
  1: { bg: '#fef9c3', border: '#fef08a' },
  2: { bg: '#fde68a', border: '#fcd34d' },
  3: { bg: '#fcd34d', border: '#fbbf24' },
  4: { bg: '#fbbf24', border: '#f59e0b' },
  5: { bg: '#f59e0b', border: '#d97706' },
};

const SUB_TABS: { label: string; value: TabType; icon: any }[] = [
  { label: 'PRs', value: 'prs', icon: 'git-pull-request-outline' },
  { label: 'Commits', value: 'commits', icon: 'git-commit-outline' },
  { label: 'Branches', value: 'branches', icon: 'git-branch-outline' },
  { label: 'CI Runs', value: 'ci', icon: 'play-outline' },
];

const PR_FILTERS: { label: string; value: PRFilterType }[] = [
  { label: 'Open', value: 'open' },
  { label: 'Merged', value: 'merged' },
  { label: 'Closed', value: 'closed' },
  { label: 'All', value: 'all' },
];

export default function ReposScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  // Auth / Session state
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Repos & Selection states
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);

  // Active view states
  const [activeSubTab, setActiveSubTab] = useState<TabType>('prs');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [prFilter, setPrFilter] = useState<PRFilterType>('open');

  // API response lists
  const [branches, setBranches] = useState<Branch[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [prs, setPrs] = useState<PR[]>([]);
  const [pipelines, setPipelines] = useState<PipelineRun[]>([]);

  // Sub-tab loading states
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [prsLoading, setPrsLoading] = useState(false);
  const [pipelinesLoading, setPipelinesLoading] = useState(false);

  // Redesign PR page state & helper functions
  const [searchQuery, setSearchQuery] = useState('');

  const prCounts = useMemo(() => {
    const counts = { open: 0, merged: 0, closed: 0, draft: 0 };
    if (!prs) return counts;
    prs.forEach(p => {
      if (p.state === 'open') counts.open++;
      else if (p.state === 'merged') counts.merged++;
      else if (p.state === 'closed') counts.closed++;
      else if (p.state === 'draft') counts.draft++;
    });
    return counts;
  }, [prs]);

  const filteredPRs = useMemo(() => {
    if (!prs) return [];
    let filtered = prs;

    if (prFilter === 'open') {
      filtered = filtered.filter(p => p.state === 'open');
    } else if (prFilter === 'merged') {
      filtered = filtered.filter(p => p.state === 'merged');
    } else if (prFilter === 'closed') {
      filtered = filtered.filter(p => p.state === 'closed');
    } else if (prFilter === 'draft') {
      filtered = filtered.filter(p => p.state === 'draft');
    }

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.title.toLowerCase().includes(q) || 
        (p.branchName && p.branchName.toLowerCase().includes(q)) ||
        p.number.toString().includes(q)
      );
    }

    return filtered;
  }, [prs, prFilter, searchQuery]);

  const groupedPRs = useMemo(() => {
    const recent: PR[] = [];
    const earlier: PR[] = [];
    
    const now = new Date().getTime();
    const fortyEightHours = 48 * 60 * 60 * 1000;
    
    filteredPRs.forEach(pr => {
      const createdTime = new Date(pr.createdAt).getTime();
      if (now - createdTime < fortyEightHours) {
        recent.push(pr);
      } else {
        earlier.push(pr);
      }
    });
    
    return { recent, earlier };
  }, [filteredPRs]);

  const timeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) {
      return `${Math.max(1, diffMins)}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  };

  const renderAvatarStack = (authorName: string, id: string) => {
    const initials: string[] = [];
    const getInitials = (name: string) => {
      const parts = name.split(/[\s_\-\/]+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    };
    
    initials.push(getInitials(authorName));
    
    const contributors = ['AH', 'AJ', 'RD', 'PK', 'SM', 'TL'];
    const count = (parseInt(id.replace(/\D/g, '')) || 0) % 3 + 1;
    
    for (let i = 1; i < count; i++) {
      const nextInitial = contributors[(parseInt(id.replace(/\D/g, '')) + i) % contributors.length];
      if (!initials.includes(nextInitial)) {
        initials.push(nextInitial);
      }
    }
    
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {initials.map((init, idx) => (
          <View 
            key={idx} 
            style={[
              ss.avatarStackCircle, 
              { 
                marginLeft: idx > 0 ? -8 : 0, 
                zIndex: 10 - idx,
                borderColor: isDark ? '#1a1a1a' : '#ffffff',
                borderWidth: 1.5,
              }
            ]}
          >
            <Text style={ss.avatarStackText}>{init}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderPRCard = (pr: PR) => {
    let badgeColor = '#9ca3af';
    let badgeBg = isDark ? 'rgba(156,163,175,0.1)' : '#f3f4f6';
    let badgeLabel = pr.state as string;

    if (pr.checksStatus === 'failing' && pr.state === 'open') {
      badgeColor = '#ef4444';
      badgeBg = isDark ? 'rgba(239,68,68,0.1)' : '#fee2e2';
      badgeLabel = 'failed';
    } else if (pr.state === 'open') {
      badgeColor = '#22c55e';
      badgeBg = isDark ? 'rgba(34,197,94,0.1)' : '#f0fdf4';
    } else if (pr.state === 'merged') {
      badgeColor = '#a855f7';
      badgeBg = isDark ? 'rgba(168,85,247,0.1)' : '#faf5ff';
    } else if (pr.state === 'draft') {
      badgeColor = '#9ca3af';
      badgeBg = isDark ? 'rgba(156,163,175,0.1)' : '#f3f4f6';
    } else if (pr.state === 'closed') {
      badgeColor = '#ef4444';
      badgeBg = isDark ? 'rgba(239,68,68,0.1)' : '#fee2e2';
    }

    let ciText = 'no checks';
    let ciColor = textSub;
    let ciIcon = 'ellipse-outline';
    
    if (pr.checksStatus === 'passing') {
      ciText = 'CI passed';
      ciColor = '#22c55e';
      ciIcon = 'checkmark-circle-outline';
    } else if (pr.checksStatus === 'failing') {
      ciText = 'CI failing';
      ciColor = '#ef4444';
      ciIcon = 'close-circle-outline';
    } else if (pr.checksStatus === 'pending') {
      ciText = 'pending';
      ciColor = '#eab308';
      ciIcon = 'time-outline';
    }

    return (
      <Pressable
        key={pr.id}
        style={({ pressed }) => [ss.listItemCard, { backgroundColor: isDark ? '#1a1a1a' : '#ffffff', borderColor: isDark ? '#252525' : '#e5e7eb', opacity: pressed ? 0.95 : 1 }]}
        onPress={() => router.push({
          pathname: '/pr-detail',
          params: {
            provider: selectedRepo!.provider,
            repo: selectedRepo!.id,
            prNumber: pr.number
          }
        })}
      >
        <View style={ss.listItemHeader}>
          <Text style={[ss.listItemTitle, { color: isDark ? '#f0f0f0' : '#111111' }]} numberOfLines={2}>
            {pr.title}
          </Text>
          <View style={[ss.stateBadge, { borderColor: badgeColor, backgroundColor: badgeBg }]}>
            <Text style={[ss.stateBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
          </View>
        </View>

        <View style={ss.listItemMiddle}>
          {pr.branchName ? (
            <View style={ss.branchBadge}>
              <Ionicons name="git-branch-outline" size={11} color="#d4a500" />
              <Text style={ss.branchBadgeText} numberOfLines={1}>{pr.branchName}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="time-outline" size={12} color={textSub} />
            <Text style={ss.timeText}>{timeAgo(pr.createdAt)}</Text>
          </View>
          <View style={ss.commentsContainer}>
            <Ionicons name="chatbubble-outline" size={12} color={textSub} />
            <Text style={ss.commentsText}>{pr.commentsCount || 0}</Text>
          </View>
          <Text style={{ color: isDark ? '#888' : '#6b7280', fontSize: 11 }}>#{pr.number}</Text>
        </View>

        <View style={[ss.listItemBottom, { borderTopColor: isDark ? '#242424' : '#f0f0f0' }]}>
          {renderAvatarStack(pr.authorName, pr.id)}

          <View style={[ss.diffStats, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }]}>
            <Text style={ss.additionsText}>+{pr.additions || 0}</Text>
            <Text style={{ color: isDark ? '#888' : '#6b7280', fontSize: 12, fontWeight: '700' }}>/</Text>
            <Text style={ss.deletionsText}>-{pr.deletions || 0}</Text>
          </View>

          {pr.checksStatus && pr.checksStatus !== 'none' ? (
            <View style={[ss.ciContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }]}>
              <Ionicons name={ciIcon as any} size={13} color={ciColor} />
              <Text style={[ss.ciText, { color: ciColor }]}>{ciText}</Text>
            </View>
          ) : (
            <View style={[ss.ciContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }]}>
              <Ionicons name="ellipse-outline" size={12} color={textSub} />
              <Text style={[ss.ciText, { color: textSub }]}>no CI</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  // Contribution Calendar states (Welcome Dashboard view)
  const [selectedCell, setSelectedCell] = useState<{ col: number; row: number } | null>(null);
  const COLS = 13;
  const ROWS = 7;
  const months = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

  const gridData = useMemo(() => {
    const data: CellData[][] = [];
    let seed = 42;
    const random = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };
    for (let c = 0; c < COLS; c++) {
      const col: CellData[] = [];
      for (let r = 0; r < ROWS; r++) {
        const rand = random();
        let level = 0, commitsCount = 0, prsCount = 0, ciCount = 0;
        if (rand < 0.12) { level = 0; }
        else if (rand < 0.30) { level = 1; commitsCount = Math.floor(random() * 2) + 1; ciCount = random() > 0.7 ? 1 : 0; }
        else if (rand < 0.55) { level = 2; commitsCount = Math.floor(random() * 3) + 2; prsCount = random() > 0.6 ? 1 : 0; ciCount = random() > 0.5 ? 1 : 0; }
        else if (rand < 0.75) { level = 3; commitsCount = Math.floor(random() * 4) + 4; prsCount = random() > 0.4 ? 1 : 0; ciCount = random() > 0.4 ? 1 : 0; }
        else if (rand < 0.90) { level = 4; commitsCount = Math.floor(random() * 5) + 7; prsCount = random() > 0.3 ? 1 : 0; ciCount = random() > 0.3 ? 1 : 0; }
        else { level = 5; commitsCount = Math.floor(random() * 6) + 12; prsCount = 1; ciCount = random() > 0.5 ? 1 : 0; }
        col.push({ level, commits: commitsCount, prs: prsCount, ci: ciCount });
      }
      data.push(col);
    }
    return data;
  }, []);

  const getCellColor = (lv: number) =>
    isDark ? DARK_CELL_COLORS[lv] ?? DARK_CELL_COLORS[0] : LIGHT_CELL_COLORS[lv] ?? LIGHT_CELL_COLORS[0];

  const selectedCellDetails = useMemo(() => {
    if (!selectedCell) return null;
    const { col, row } = selectedCell;
    const cell = gridData[col][row];
    return {
      date: `${months[col]} ${row * 4 + 3}, 2025`,
      commits: cell.commits,
      prs: cell.prs,
      ci: cell.ci,
    };
  }, [selectedCell, gridData]);

  // Auth initiation — check for github/gitlab token directly
  useEffect(() => {
    const initSession = async () => {
      try {
        const loggedIn = await isLoggedIn();
        if (!loggedIn) {
          router.replace('/login');
          return;
        }
        const ghToken = await getToken('github_token');
        const glToken = await getToken('gitlab_token');
        const activeToken = ghToken || glToken || '';
        setSessionToken(activeToken);
        fetchRepos(activeToken);
      } catch (e) {
        console.error('Session init error:', e);
        setLoading(false);
      }
    };
    initSession();
  }, []);

  // Fetch connected accounts/repos (direct API)
  const fetchRepos = async (token: string | null) => {
    setLoading(true);
    try {
      const ghToken = await getToken('github_token');
      const glToken = await getToken('gitlab_token');
      const allRepos: Repo[] = [];
      if (ghToken) {
        const ghRepos = await GH.getRepos(ghToken);
        allRepos.push(...ghRepos);
      }
      if (glToken) {
        const glRepos = await GL.getRepos(glToken);
        allRepos.push(...glRepos);
      }
      setRepos(allRepos);
    } catch (e) {
      console.error('Fetch repos error:', e);
      setRepos([]);
    } finally {
      setLoading(false);
    }
  };

  // Main refresh handler
  const handleRefresh = async () => {
    if (!sessionToken) return;
    setRefreshing(true);
    if (selectedRepo) {
      await refreshRepoData(selectedRepo);
    } else {
      await fetchRepos(sessionToken);
    }
    setRefreshing(false);
  };

  const refreshRepoData = async (repo: Repo) => {
    if (!sessionToken) return;
    if (activeSubTab === 'prs') {
      await fetchPRs(sessionToken, repo);
    } else if (activeSubTab === 'commits') {
      await fetchCommits(sessionToken, repo, selectedBranch);
    } else if (activeSubTab === 'branches') {
      await fetchBranches(sessionToken, repo);
    } else if (activeSubTab === 'ci') {
      await fetchPipelines(sessionToken, repo);
    }
  };

  // Fetch subtab content when repo or tab changes
  useEffect(() => {
    if (!sessionToken || !selectedRepo) return;
    refreshRepoData(selectedRepo);
  }, [selectedRepo, activeSubTab, selectedBranch]);

  // Fetch Branches (direct API)
  const fetchBranches = async (token: string, repo: Repo) => {
    setBranchesLoading(true);
    try {
      let branchList: Branch[] = [];
      if (repo.provider === 'github') {
        const ghToken = await getToken('github_token');
        if (ghToken) branchList = await GH.getBranches(ghToken, repo.fullName, (repo as any).defaultBranch);
      } else if (repo.provider === 'gitlab') {
        const glToken = await getToken('gitlab_token');
        if (glToken) {
          const glRepos = await GL.getRepos(glToken);
          const glRepo = glRepos.find(r => r.id === repo.id);
          if (glRepo) branchList = await GL.getBranches(glToken, glRepo.numericId, glRepo.defaultBranch);
        }
      }
      setBranches(branchList);
      if (branchList.length > 0 && !selectedBranch) {
        const defaultB = branchList.find(b => b.isDefault) || branchList[0];
        setSelectedBranch(defaultB.name);
      }
    } catch (e) {
      console.error('Fetch branches error:', e);
      setBranches([]);
    } finally {
      setBranchesLoading(false);
    }
  };

  // Fetch Commits (direct API)
  const fetchCommits = async (token: string, repo: Repo, branchName: string) => {
    setCommitsLoading(true);
    try {
      let commits: Commit[] = [];
      if (repo.provider === 'github') {
        const ghToken = await getToken('github_token');
        if (ghToken) commits = await GH.getCommits(ghToken, repo.fullName, branchName || undefined);
      } else if (repo.provider === 'gitlab') {
        const glToken = await getToken('gitlab_token');
        if (glToken) {
          const glRepos = await GL.getRepos(glToken);
          const glRepo = glRepos.find(r => r.id === repo.id);
          if (glRepo) commits = await GL.getCommits(glToken, glRepo.numericId, branchName || undefined);
        }
      }
      setCommits(commits);
    } catch (e) {
      console.error('Fetch commits error:', e);
      setCommits([]);
    } finally {
      setCommitsLoading(false);
    }
  };

  // Fetch PRs (direct API)
  const fetchPRs = async (token: string, repo: Repo) => {
    setPrsLoading(true);
    try {
      let prs: PR[] = [];
      if (repo.provider === 'github') {
        const ghToken = await getToken('github_token');
        if (ghToken) prs = await GH.getPRs(ghToken, repo.fullName, 'all');
      } else if (repo.provider === 'gitlab') {
        const glToken = await getToken('gitlab_token');
        if (glToken) {
          const glRepos = await GL.getRepos(glToken);
          const glRepo = glRepos.find(r => r.id === repo.id);
          if (glRepo) prs = (await GL.getMRs(glToken, glRepo.numericId, 'all')) as any;
        }
      }
      setPrs(prs);
    } catch (e) {
      console.error('Fetch PRs error:', e);
      setPrs([]);
    } finally {
      setPrsLoading(false);
    }
  };

  // Fetch Pipelines (direct API)
  const fetchPipelines = async (token: string, repo: Repo) => {
    setPipelinesLoading(true);
    try {
      let pipelines: PipelineRun[] = [];
      if (repo.provider === 'github') {
        const ghToken = await getToken('github_token');
        if (ghToken) pipelines = await GH.getPipelines(ghToken, repo.fullName);
      } else if (repo.provider === 'gitlab') {
        const glToken = await getToken('gitlab_token');
        if (glToken) {
          const glRepos = await GL.getRepos(glToken);
          const glRepo = glRepos.find(r => r.id === repo.id);
          if (glRepo) pipelines = await GL.getPipelines(glToken, glRepo.numericId) as any;
        }
      }
      setPipelines(pipelines);
    } catch (e) {
      console.error('Fetch pipelines error:', e);
      setPipelines([]);
    } finally {
      setPipelinesLoading(false);
    }
  };

  // Selection handlers
  const handleSelectRepo = (repo: Repo) => {
    setSelectedRepo(repo);
    setShowRepoDropdown(false);
    setSelectedBranch('');
    setBranches([]);
    setCommits([]);
    setPrs([]);
    setPipelines([]);
    fetchBranches(sessionToken ?? '', repo);
  };

  const handleSelectBranch = (branchName: string) => {
    setSelectedBranch(branchName);
    setShowBranchDropdown(false);
  };

  // Rendering styling constants
  const headerIconColor = isDark ? 'white' : 'black';
  const bgCard = isDark ? '#1a1a1a' : '#ffffff';
  const bgPage = isDark ? '#121212' : '#f4f4f5';
  const borderCard = isDark ? '#2a2a2a' : '#e5e7eb';
  const textMain = isDark ? '#ffffff' : '#000000';
  const textSub = isDark ? '#888888' : '#6b7280';

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bgPage, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#F5C518" />
        <Text style={{ color: textSub, marginTop: 12, fontWeight: 'bold' }}>Loading repositories...</Text>
      </SafeAreaView>
    );
  }

  // Render Onboarding UI if user has no connected accounts
  if (repos.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bgPage }}>
        {/* Header Bar */}
        <View style={[ss.header, { backgroundColor: bgCard, borderBottomColor: borderCard }]}>
          <View style={ss.row}>
            <Text style={[ss.brandGit, { color: textMain }]}>git</Text>
            <Text style={ss.brandCube}>Cube</Text>
          </View>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: isDark ? 'rgba(245,197,24,0.12)' : '#fef9c3', width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 24, borderWidth: 1.5, borderColor: isDark ? 'rgba(245,197,24,0.25)' : '#fcd34d' }}>
            <Ionicons name="git-branch-outline" size={42} color="#F5C518" />
          </View>
          <Text style={{ color: textMain, fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 10, letterSpacing: -0.5 }}>No Repository Connections</Text>
          <Text style={{ color: textSub, textAlign: 'center', fontSize: 14, maxWidth: 300, marginBottom: 36, lineHeight: 22 }}>
            Connect your GitHub or GitLab accounts to start browsing pull requests, commits, and pipelines.
          </Text>

          {/* Provider shortcuts */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16, width: '100%', maxWidth: 320 }}>
            <Pressable
              style={({ pressed }) => [{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
                borderWidth: 1.5, borderColor: isDark ? '#333' : '#e5e7eb',
                borderRadius: 14, paddingVertical: 14, gap: 8,
                opacity: pressed ? 0.8 : 1,
              }]}
              onPress={() => router.push('/connected-accounts')}
            >
              <Ionicons name="logo-github" size={20} color={isDark ? '#fff' : '#111'} />
              <Text style={{ color: isDark ? '#fff' : '#111', fontWeight: '700', fontSize: 14 }}>GitHub</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
                borderWidth: 1.5, borderColor: isDark ? '#333' : '#e5e7eb',
                borderRadius: 14, paddingVertical: 14, gap: 8,
                opacity: pressed ? 0.8 : 1,
              }]}
              onPress={() => router.push('/connected-accounts')}
            >
              <Ionicons name="logo-gitlab" size={20} color="#fc6d26" />
              <Text style={{ color: isDark ? '#fff' : '#111', fontWeight: '700', fontSize: 14 }}>GitLab</Text>
            </Pressable>
          </View>

          <Pressable 
            style={({ pressed }) => [ss.button, { backgroundColor: '#F5C518', opacity: pressed ? 0.8 : 1, width: '100%', maxWidth: 320, justifyContent: 'center' }]}
            onPress={() => router.push('/connected-accounts')}
          >
            <Ionicons name="add-circle-outline" size={18} color="#111" style={{ marginRight: 8 }} />
            <Text style={{ color: '#111', fontWeight: 'bold', fontSize: 15 }}>Connect an Account</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bgPage }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header with Repo Picker (Matching Boards style) */}
      <View className="bg-white dark:bg-[#1a1a1a] px-4 pt-12 pb-4 border-b border-black/10 dark:border-yellow-500/10">
        <View className="flex-row justify-between items-center">
          <TouchableOpacity 
            className="flex-row items-center bg-gray-100 dark:bg-[#262626] px-4 py-2.5 rounded-xl border border-black/5 dark:border-white/10"
            onPress={() => setShowRepoDropdown(!showRepoDropdown)}
          >
            <Ionicons 
              name={selectedRepo?.provider === 'gitlab' ? 'logo-gitlab' : 'git-branch'} 
              size={18} 
              color={selectedRepo?.provider === 'gitlab' ? '#fc6d26' : (isDark ? '#fff' : '#000')} 
              style={{ marginRight: 8 }} 
            />
            <Text className="text-black dark:text-white font-bold text-sm max-w-[200px]" numberOfLines={1}>
              {selectedRepo?.name || 'Select Repository'}
            </Text>
            <Ionicons name="chevron-down" size={14} color="#888" style={{ marginLeft: 8 }} />
          </TouchableOpacity>

          <TouchableOpacity 
            className="p-2.5 bg-gray-100 dark:bg-[#2d2d2d] rounded-xl border border-black/5 dark:border-transparent"
            onPress={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#888" />
            ) : (
              <Ionicons name="refresh" size={18} className="text-black dark:text-white" color={isDark ? '#fff' : '#000'} />
            )}
          </TouchableOpacity>
        </View>

        {/* Repo Selection Dropdown List */}
        {showRepoDropdown && (
          <View className="bg-white dark:bg-[#2d2d2d] mt-2 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 shadow-sm">
            {selectedRepo && (
              <TouchableOpacity
                className="px-4 py-3 flex-row items-center border-b border-black/5 dark:border-white/5 active:bg-gray-50 dark:active:bg-[#333333]"
                onPress={() => {
                  setSelectedRepo(null);
                  setShowRepoDropdown(false);
                }}
              >
                <Ionicons name="home-outline" size={16} color="#888" style={{ marginRight: 10 }} />
                <View className="flex-1">
                  <Text className="text-black dark:text-white font-semibold text-sm">Dashboard</Text>
                  <Text className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Go to welcome screen</Text>
                </View>
              </TouchableOpacity>
            )}
            
            {repos.map(r => (
              <TouchableOpacity 
                key={r.id + r.provider}
                className="px-4 py-3 flex-row items-center border-b border-black/5 dark:border-white/5 active:bg-gray-50 dark:active:bg-[#333333]"
                onPress={() => handleSelectRepo(r)}
              >
                <Ionicons 
                  name={r.provider === 'gitlab' ? 'logo-gitlab' : 'logo-github'} 
                  size={16} 
                  color={r.provider === 'gitlab' ? '#fc6d26' : (isDark ? '#fff' : '#000')} 
                  style={{ marginRight: 10 }} 
                />
                <View className="flex-1">
                  <Text className="text-black dark:text-white font-semibold text-sm">{r.name}</Text>
                  <Text className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{r.fullName}</Text>
                </View>
                {selectedRepo?.id === r.id && selectedRepo?.provider === r.provider && (
                  <Ionicons name="checkmark" size={16} color="#eab308" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Main View Area */}
      {!selectedRepo ? (
        /* ==================== DASHBOARD WELCOME VIEW ==================== */
        <ScrollView 
          className="flex-1 bg-white dark:bg-[#121212]"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#eab308" />
          }
        >
          <View className="mb-6 mt-3 flex-row items-center">
            <Ionicons name="git-network-outline" size={24} color={isDark ? "white" : "black"} />
            <View className="border-b-4 border-yellow-500 pb-1 ml-3 flex-1">
              <Text className="text-2xl font-black text-black dark:text-white tracking-tighter">Connected Workspaces</Text>
            </View>
          </View>

          <Text className="text-gray-500 dark:text-gray-400 text-sm font-semibold mb-6">
            Select a repository below to inspect pull requests, branch history, and CI pipelines.
          </Text>

          {repos.length === 0 ? (
            <View className="py-10 items-center border-2 border-dashed border-gray-300 dark:border-gray-800 rounded-3xl bg-gray-50 dark:bg-[#1a1a1a]">
              <Ionicons name="git-compare-outline" size={48} color="#888" className="mb-4" />
              <Text className="text-black dark:text-white text-lg font-bold mb-2">No Repositories</Text>
              <Text className="text-gray-400 text-center px-8 text-sm">
                Connect your GitHub or GitLab accounts in the settings to get started.
              </Text>
            </View>
          ) : (
            <View>
              {repos.map((repo) => (
                <TouchableOpacity
                  key={repo.id + repo.provider}
                  className="bg-white dark:bg-[#1e1e1e] border-2 border-black dark:border-yellow-500 rounded-3xl p-4 mb-4 shadow-xs flex-row items-center"
                  onPress={() => handleSelectRepo(repo)}
                  activeOpacity={0.7}
                >
                  <View className="border-2 border-black dark:border-gray-600 rounded-2xl w-14 h-14 items-center justify-center mr-4 bg-gray-50 dark:bg-[#1a1a1a]">
                    <Ionicons name={repo.provider === 'github' ? 'logo-github' : 'logo-gitlab'} size={28} color={isDark ? "#fff" : "#000"} />
                  </View>
                  <View className="flex-1 mr-2">
                    <Text className="text-black dark:text-white text-lg font-black tracking-tight mb-1">{repo.name}</Text>
                    <Text className="text-gray-500 dark:text-gray-400 text-xs font-semibold" numberOfLines={1}>{repo.fullName}</Text>
                  </View>
                  <View className="bg-yellow-500 rounded-full w-8 h-8 items-center justify-center border-2 border-black">
                    <Ionicons name="arrow-forward" size={16} color="black" />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        /* ==================== REPOSITORY SELECTED VIEW ==================== */
        <View style={{ flex: 1 }}>
          {/* Subtab Button Switcher */}
          <View style={[ss.subtabContainer, { backgroundColor: bgCard, borderBottomColor: borderCard }]}>
            {SUB_TABS.map(tab => {
              const isActive = activeSubTab === tab.value;
              return (
                <Pressable
                  key={tab.value}
                  style={({ pressed }) => [
                    ss.subtabButton,
                    isActive && ss.subtabButtonActive,
                    { opacity: pressed ? 0.7 : 1 }
                  ]}
                  onPress={() => {
                    setActiveSubTab(tab.value);
                    setShowBranchDropdown(false);
                  }}
                >
                  <Ionicons 
                    name={tab.icon} 
                    size={20} 
                    color={isActive ? '#F5C518' : textSub} 
                    style={{ marginBottom: 4 }} 
                  />
                  <Text style={[ss.subtabButtonText, { color: isActive ? '#F5C518' : textSub }]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Subtab Content Scroll */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#F5C518" />
            }
          >
            {/* -------------------- 1. PULL REQUESTS TAB -------------------- */}
            {activeSubTab === 'prs' && (
              <View>
                {/* GitHub-style Segmented Filter Tab Bar */}
                <View style={[ss.filterTabBar, { backgroundColor: isDark ? '#1a1a1a' : '#f9f9f9', borderColor: isDark ? '#2a2a2a' : '#e5e7eb' }]}>
                  {[
                    { label: 'Open', value: 'open', count: prCounts.open, icon: 'git-pull-request-outline', activeColor: '#22c55e' },
                    { label: 'Merged', value: 'merged', count: prCounts.merged, icon: 'git-merge-outline', activeColor: '#a855f7' },
                    { label: 'Closed', value: 'closed', count: prCounts.closed, icon: 'close-circle-outline', activeColor: '#ef4444' },
                    { label: 'Draft', value: 'draft', count: prCounts.draft, icon: 'document-outline', activeColor: '#9ca3af' },
                  ].map((f, idx) => {
                    const isTabActive = prFilter === f.value;
                    return (
                      <Pressable
                        key={f.value}
                        style={[ss.filterTab, isTabActive && [ss.filterTabActive, { borderBottomColor: f.activeColor }]]}
                        onPress={() => setPrFilter(f.value as PRFilterType)}
                      >
                        <Ionicons
                          name={f.icon as any}
                          size={13}
                          color={isTabActive ? f.activeColor : textSub}
                          style={{ marginRight: 5 }}
                        />
                        <Text style={[ss.filterTabText, { color: isTabActive ? textMain : textSub, fontWeight: isTabActive ? '700' : '500' }]}>
                          {f.label}
                        </Text>
                        {f.count > 0 && (
                          <View style={[ss.filterTabBadge, { backgroundColor: isTabActive ? (isDark ? '#2a2a2a' : '#e5e7eb') : 'transparent', borderColor: isDark ? '#333' : '#e5e7eb' }]}>
                            <Text style={[ss.filterTabBadgeText, { color: isTabActive ? textMain : textSub }]}>
                              {f.count}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                {/* Search Row */}
                <View style={ss.searchRow}>
                  <View style={[ss.searchInputContainer, { backgroundColor: isDark ? '#1a1a1a' : '#fff', borderColor: isDark ? '#2a2a2a' : '#e5e7eb' }]}>
                    <Ionicons name="search" size={15} color={textSub} />
                    <TextInput
                      style={[ss.searchInput, { color: textMain }]}
                      placeholder="Search pull requests..."
                      placeholderTextColor={textSub}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {searchQuery.length > 0 && (
                      <Pressable onPress={() => setSearchQuery('')}>
                        <Ionicons name="close-circle" size={16} color={textSub} />
                      </Pressable>
                    )}
                  </View>
                  <Pressable style={({ pressed }) => [ss.searchActionBtn, { backgroundColor: isDark ? '#1a1a1a' : '#fff', borderColor: isDark ? '#2a2a2a' : '#e5e7eb' }, pressed && { opacity: 0.7 }]}>
                    <Ionicons name="swap-vertical" size={16} color={textMain} />
                  </Pressable>
                  <Pressable style={({ pressed }) => [ss.searchActionBtn, { backgroundColor: isDark ? '#1a1a1a' : '#fff', borderColor: isDark ? '#2a2a2a' : '#e5e7eb' }, pressed && { opacity: 0.7 }]}>
                    <Ionicons name="funnel-outline" size={16} color={textMain} />
                  </Pressable>
                </View>

                {/* PR List */}
                {prsLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                    <ActivityIndicator size="large" color="#F5C518" />
                    <Text style={{ color: textSub, marginTop: 12, fontSize: 13 }}>Loading pull requests...</Text>
                  </View>
                ) : filteredPRs.length === 0 ? (
                  <View style={ss.emptyState}>
                    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: isDark ? '#1a1a1a' : '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: isDark ? '#2a2a2a' : '#e5e7eb' }}>
                      <Ionicons name="git-pull-request-outline" size={28} color={textSub} />
                    </View>
                    <Text style={{ color: textMain, fontSize: 15, fontWeight: '700', marginBottom: 6 }}>No pull requests found</Text>
                    <Text style={{ color: textSub, fontSize: 13, textAlign: 'center' }}>Try changing the filter or search query.</Text>
                  </View>
                ) : (
                  <View>
                    {/* RECENT Section */}
                    {groupedPRs.recent.length > 0 && (
                      <View style={{ marginBottom: 16 }}>
                        <Text style={[ss.sectionHeading, { color: textSub }]}>Recent</Text>
                        {groupedPRs.recent.map(pr => renderPRCard(pr))}
                      </View>
                    )}

                    {/* EARLIER Section */}
                    {groupedPRs.earlier.length > 0 && (
                      <View>
                        <Text style={[ss.sectionHeading, { color: textSub }]}>Earlier</Text>
                        {groupedPRs.earlier.map(pr => renderPRCard(pr))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* -------------------- 2. COMMITS TAB -------------------- */}
            {activeSubTab === 'commits' && (
              <View>
                {/* Branch selector for commits */}
                {branches.length > 0 && (
                  <View style={{ marginBottom: 16, zIndex: 10 }}>
                    <Pressable
                      style={({ pressed }) => [ss.dropdownTrigger, { width: 160, alignSelf: 'flex-start', backgroundColor: isDark ? '#1a1a1a' : '#fff', borderColor: borderCard, opacity: pressed ? 0.9 : 1 }]}
                      onPress={() => setShowBranchDropdown(!showBranchDropdown)}
                    >
                      <Ionicons name="git-branch-outline" size={14} color="#F5C518" style={{ marginRight: 6 }} />
                      <Text style={{ color: textMain, fontSize: 12, fontWeight: 'bold', maxWidth: 100 }} numberOfLines={1}>
                        {selectedBranch || 'Select Branch'}
                      </Text>
                      <Ionicons name="chevron-down" size={10} color={textSub} style={{ marginLeft: 6 }} />
                    </Pressable>
                    {showBranchDropdown && (
                      <View style={[ss.dropdownList, { width: 180, top: 38, zIndex: 20, backgroundColor: bgCard, borderColor: borderCard }]}>
                        <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true}>
                          {branches.map(b => (
                            <Pressable
                              key={b.name}
                              style={[ss.dropdownItem, { borderBottomColor: isDark ? '#222' : '#f3f4f6' }]}
                              onPress={() => handleSelectBranch(b.name)}
                            >
                              <Text style={{ color: textMain, fontSize: 13, fontWeight: selectedBranch === b.name ? 'bold' : 'normal' }}>
                                {b.name} {b.isDefault && '(default)'}
                              </Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}

                {/* Commits List */}
                {commitsLoading ? (
                  <ActivityIndicator size="large" color="#F5C518" style={{ marginTop: 40 }} />
                ) : commits.length === 0 ? (
                  <View style={ss.emptyState}>
                    <Ionicons name="git-commit-outline" size={32} color={textSub} />
                    <Text style={{ color: textSub, fontSize: 13, marginTop: 8 }}>No commits found on branch {selectedBranch}.</Text>
                  </View>
                ) : (
                  commits.map(c => (
                    <View key={c.sha} style={[ss.listItemCard, { backgroundColor: bgCard, borderColor: borderCard }]}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={[ss.listItemTitle, { color: textMain, fontSize: 14 }]} numberOfLines={2}>
                          {c.message}
                        </Text>
                        <View style={[ss.row, { marginTop: 8 }]}>
                          {c.authorAvatarUrl ? (
                            <Image source={{ uri: c.authorAvatarUrl }} style={ss.avatarMicro} />
                          ) : (
                            <View style={[ss.avatarMicroFallback, { backgroundColor: '#555' }]}>
                              <Text style={ss.avatarMicroFallbackText}>{c.authorName.charAt(0).toUpperCase()}</Text>
                            </View>
                          )}
                          <Text style={{ color: textSub, fontSize: 11, marginLeft: 6 }}>
                            @{c.authorName} committed {new Date(c.date).toLocaleDateString()}
                          </Text>
                        </View>
                      </View>
                      <View style={{ backgroundColor: isDark ? '#2a2a2a' : '#f3f4f6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                        <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 10, color: textSub, fontWeight: 'bold' }}>
                          {c.sha.substring(0, 7)}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* -------------------- 3. BRANCHES TAB -------------------- */}
            {activeSubTab === 'branches' && (
              <View>
                {branchesLoading ? (
                  <ActivityIndicator size="large" color="#F5C518" style={{ marginTop: 40 }} />
                ) : branches.length === 0 ? (
                  <View style={ss.emptyState}>
                    <Ionicons name="git-branch-outline" size={32} color={textSub} />
                    <Text style={{ color: textSub, fontSize: 13, marginTop: 8 }}>No branches found.</Text>
                  </View>
                ) : (
                  branches.map(b => (
                    <Pressable
                      key={b.name}
                      style={({ pressed }) => [
                        ss.listItemCard,
                        {
                          backgroundColor: bgCard,
                          borderColor: selectedBranch === b.name ? '#F5C518' : borderCard,
                          opacity: pressed ? 0.9 : 1
                        }
                      ]}
                      onPress={() => {
                        setSelectedBranch(b.name);
                        setActiveSubTab('commits'); // switch to commits tab
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={ss.row}>
                          <Ionicons name="git-branch-outline" size={14} color="#F5C518" style={{ marginRight: 6 }} />
                          <Text style={{ color: textMain, fontWeight: 'bold', fontSize: 14 }}>{b.name}</Text>
                          {b.isDefault && (
                            <View style={[ss.badge, { borderColor: '#eab308', backgroundColor: 'rgba(234,179,8,0.1)', marginLeft: 8, paddingVertical: 1 }]}>
                              <Text style={{ color: '#eab308', fontSize: 8, fontWeight: 'bold' }}>default</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ color: textSub, fontSize: 11, marginTop: 6 }}>
                          Last commit: {b.lastCommitSha.substring(0, 7)}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward-outline" size={16} color={textSub} />
                    </Pressable>
                  ))
                )}
              </View>
            )}

            {/* -------------------- 4. CI RUNS TAB -------------------- */}
            {activeSubTab === 'ci' && (
              <View>
                {pipelinesLoading ? (
                  <ActivityIndicator size="large" color="#F5C518" style={{ marginTop: 40 }} />
                ) : pipelines.length === 0 ? (
                  <View style={ss.emptyState}>
                    <Ionicons name="play-outline" size={32} color={textSub} />
                    <Text style={{ color: textSub, fontSize: 13, marginTop: 8 }}>No pipeline runs found.</Text>
                  </View>
                ) : (
                  pipelines.map(run => {
                    let statusColor = '#9ca3af';
                    let statusIcon = 'ellipse-outline';
                    let statusBg = isDark ? 'rgba(156,163,175,0.1)' : '#f3f4f6';

                    if (run.status === 'success') {
                      statusColor = '#22c55e';
                      statusIcon = 'checkmark-circle-outline';
                      statusBg = isDark ? 'rgba(34,197,94,0.1)' : '#f0fdf4';
                    } else if (run.status === 'failed') {
                      statusColor = '#f87171';
                      statusIcon = 'close-circle-outline';
                      statusBg = isDark ? 'rgba(248,113,113,0.1)' : '#fee2e2';
                    } else if (run.status === 'running') {
                      statusColor = '#3b82f6';
                      statusIcon = 'sync-outline';
                      statusBg = isDark ? 'rgba(59,130,246,0.1)' : '#eff6ff';
                    }

                    return (
                      <Pressable
                        key={run.id}
                        style={({ pressed }) => [ss.listItemCard, { backgroundColor: bgCard, borderColor: borderCard, opacity: pressed ? 0.9 : 1 }]}
                        onPress={() => router.push({
                          pathname: '/pipeline-detail',
                          params: {
                            provider: selectedRepo.provider,
                            repo: selectedRepo.id,
                            runId: run.id
                          }
                        })}
                      >
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[ss.listItemTitle, { color: textMain }]} numberOfLines={1}>
                            {run.commitMessage}
                          </Text>
                          <Text style={{ color: textSub, fontSize: 11, marginTop: 6 }}>
                            Run #{run.id} • Triggered by @{run.authorName} • {new Date(run.createdAt).toLocaleDateString()}
                          </Text>
                        </View>
                        <View style={[ss.badge, { borderColor: statusColor, backgroundColor: statusBg, flexDirection: 'row', alignItems: 'center' }]}>
                          <Ionicons name={statusIcon as any} size={10} color={statusColor} style={{ marginRight: 4 }} />
                          <Text style={[ss.badgeText, { color: statusColor }]}>{run.status}</Text>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </View>
            )}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  // ── Header / Branding ──────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerSelector: {
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 0,
    zIndex: 100,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 18,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarSquare: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F5C518',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSquareText: {
    color: '#111111',
    fontWeight: '900',
    fontSize: 18,
  },
  repoInfo: {
    flex: 1,
    marginLeft: 12,
  },
  repoName: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: -0.3,
  },
  repoSubtitle: {
    color: '#666666',
    fontSize: 12,
    marginTop: 3,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandGit: { fontSize: 22, fontWeight: 'bold', letterSpacing: -0.5 },
  brandCube: { fontSize: 22, fontWeight: '900', color: '#F5C518', letterSpacing: -0.5, marginLeft: 2 },
  iconBtn: { borderWidth: 1, borderRadius: 8, padding: 8, alignItems: 'center', justifyContent: 'center' },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  // ── Dashboard Cards ────────────────────────────────────────────────────────
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  bigNumber: { fontSize: 32, fontWeight: '900', color: '#F5C518' },
  smallLabel: { fontSize: 11, fontWeight: 'bold', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', letterSpacing: 0.5 },
  monthLabel: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', width: '7.2%', textAlign: 'center' },
  gridCol: { width: '7.2%', alignItems: 'center' },
  tooltip: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },

  // ── Repo Dropdown ──────────────────────────────────────────────────────────
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '80%',
  },
  dropdownTriggerText: {
    fontSize: 13,
    fontWeight: 'bold',
    maxWidth: 160,
  },
  dropdownList: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderWidth: 1,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 999,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  avatarMini: {
    width: 30,
    height: 30,
    borderRadius: 8,
  },
  avatarMiniFallback: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMiniFallbackText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // ── Sub-tabs (PRs / Commits / Branches / CI) ───────────────────────────────
  subtabContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    paddingVertical: 6,
  },
  subtabButton: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  subtabButtonActive: {
    borderBottomWidth: 0,
  },
  subtabButtonText: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 5,
    letterSpacing: 0.3,
  },

  // ── PR Filter Tab Bar (GitHub-style underline) ─────────────────────────────
  filterTabBar: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 16,
    overflow: 'hidden',
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
    gap: 4,
  },
  filterTabActive: {
    borderBottomWidth: 2.5,
  },
  filterTabText: {
    fontSize: 12,
  },
  filterTabBadge: {
    borderWidth: 1,
    borderRadius: 99,
    minWidth: 20,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterTabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // ── Search Row ─────────────────────────────────────────────────────────────
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    height: '100%',
  },
  searchActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Section Headings ───────────────────────────────────────────────────────
  sectionHeading: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: 8,
  },

  // ── PR Card ────────────────────────────────────────────────────────────────
  listItemCard: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#252525',
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  listItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  listItemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#f0f0f0',
    lineHeight: 21,
    marginRight: 10,
  },
  stateBadge: {
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listItemMiddle: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 10,
  },
  branchBadge: {
    backgroundColor: 'rgba(234,179,8,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.25)',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  branchBadgeText: {
    color: '#d4a500',
    fontSize: 11,
    fontWeight: '700',
  },
  timeText: {
    color: '#777777',
    fontSize: 11,
  },
  commentsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  commentsText: {
    color: '#777777',
    fontSize: 11,
  },
  listItemBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#242424',
  },
  avatarStackCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2e2e2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarStackText: {
    color: '#cccccc',
    fontSize: 8,
    fontWeight: '800',
  },
  diffStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  additionsText: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '700',
  },
  deletionsText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '700',
  },
  ciContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  ciText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Shared Badges ──────────────────────────────────────────────────────────
  badge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },

  // ── Commit / CI List ───────────────────────────────────────────────────────
  avatarMicro: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  avatarMicroFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMicroFallbackText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: 'bold',
  },

  // ── Empty / Loading States ─────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    paddingHorizontal: 24,
  },

  // ── Legacy/unused (kept to avoid TS errors if referenced elsewhere) ─────────
  filtersRow: { flexDirection: 'row', marginBottom: 16 },
  filterPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, marginRight: 8 },
  filterPillActive: { backgroundColor: '#F5C518', borderColor: '#F5C518' },
  filterPillInactive: { backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' },
  filterPillTextActive: { color: '#111', fontWeight: '700', fontSize: 13, marginRight: 5 },
  filterPillTextInactive: { color: '#666', fontWeight: '600', fontSize: 13, marginRight: 5 },
  filterPillBadgeActive: { backgroundColor: 'rgba(0,0,0,0.12)', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  filterPillBadgeInactive: { backgroundColor: '#262626', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  filterPillBadgeTextActive: { color: '#111', fontSize: 9, fontWeight: '700' },
  filterPillBadgeTextInactive: { color: '#666', fontSize: 9, fontWeight: '700' },
});
