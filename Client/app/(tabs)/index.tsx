import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Platform, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useRouter } from 'expo-router';
import { getToken, isLoggedIn } from '../../src/api/auth';
import * as GH from '../../src/api/github';
import * as GL from '../../src/api/gitlab';
import * as SecureStore from 'expo-secure-store';
import { useBoundStore } from '../../src/store';
import { AI_PROXY_URL } from '../../src/constants/api';

interface PR {
  id: string;
  number: number;
  title: string;
  state: 'open' | 'merged' | 'closed' | 'draft';
  authorName: string;
  createdAt: string;
  checksStatus: 'passing' | 'failing' | 'pending' | 'none';
  additions: number;
  deletions: number;
  commentsCount?: number;
}

interface PipelineRun {
  id: string;
  status: 'success' | 'failed' | 'running' | 'queued';
  commitMessage: string;
  authorName: string;
  createdAt: string;
}

interface BoardCard {
  id: string;
  title: string;
  status: 'backlog' | 'todo' | 'inprogress' | 'done';
  provider: 'github' | 'github_projects' | 'jira' | 'trello';
  labels: string[];
  assignees: { name: string }[];
  description?: string;
  rawStatus?: string;
  linkedPRs?: string[];
}

const Dashboard = () => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  // Zustand stores
  const selectedRepo = useBoundStore((state) => state.selectedRepo);
  const repositories = useBoundStore((state) => state.repositories);
  const setSelectedRepo = useBoundStore((state) => state.setSelectedRepo);
  const setRepositories = useBoundStore((state) => state.setRepositories);

  const selectedBoard = useBoundStore((state) => state.selectedBoard);
  const boards = useBoundStore((state) => state.boards);
  const setSelectedBoard = useBoundStore((state) => state.setSelectedBoard);
  const setBoards = useBoundStore((state) => state.setBoards);

  // Local state for dashboard data
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [prs, setPrs] = useState<PR[]>([]);
  const [pipelines, setPipelines] = useState<PipelineRun[]>([]);
  const [cards, setCards] = useState<BoardCard[]>([]);

  // Dropdown visibility
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const [showBoardDropdown, setShowBoardDropdown] = useState(false);

  // AI summarization state for dashboard PR
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [summarizedPrNumber, setSummarizedPrNumber] = useState<number | null>(null);

  // Release Notes Modal State
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);

  useEffect(() => {
    const checkReleaseNotes = async () => {
      try {
        const hasSeen = Platform.OS === 'web' 
          ? localStorage.getItem('has_seen_release_v1_1_0')
          : await SecureStore.getItemAsync('has_seen_release_v1_1_0');
        if (!hasSeen) {
          setShowReleaseNotes(true);
        }
      } catch (e) {}
    };
    checkReleaseNotes();
  }, []);

  const handleCloseReleaseNotes = async () => {
    setShowReleaseNotes(false);
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem('has_seen_release_v1_1_0', 'true');
      } else {
        await SecureStore.setItemAsync('has_seen_release_v1_1_0', 'true');
      }
    } catch (e) {}
  };

  const fetchDashboardData = async (token: string, repo: any, board: any) => {
    const ghToken = await getToken('github_token');
    const glToken = await getToken('gitlab_token');
    const promises: Promise<void>[] = [];

    if (repo && ghToken && repo.provider === 'github') {
      promises.push(
        GH.getPRs(ghToken, repo.id, 'all')
          .then(data => setPrs(data as any))
          .catch(err => console.error('Fetch dashboard PRs failed:', err))
      );
      promises.push(
        GH.getPipelines(ghToken, repo.id)
          .then(data => setPipelines(data as any))
          .catch(err => console.error('Fetch dashboard pipelines failed:', err))
      );
    } else if (repo && glToken && repo.provider === 'gitlab') {
      promises.push(
        (async () => {
          try {
            const repos = await GL.getRepos(glToken);
            const glRepo = repos.find(r => r.id === repo.id);
            if (glRepo) {
              await Promise.all([
                GL.getMRs(glToken, glRepo.numericId, 'all').then(data => setPrs(data as any)),
                GL.getPipelines(glToken, glRepo.numericId).then(data => setPipelines(data as any)),
              ]);
            }
          } catch (err) {
            console.error('Fetch GitLab dashboard failed:', err);
          }
        })()
      );
    } else {
      setPrs([]);
      setPipelines([]);
    }

    if (board && ghToken) {
      promises.push(
        GH.getIssuesAsCards(ghToken, board.id)
          .then(data => setCards(data as any))
          .catch(err => console.error('Fetch dashboard cards failed:', err))
      );
    } else {
      setCards([]);
    }

    if (promises.length > 0) {
      setDashboardLoading(true);
      await Promise.all(promises);
      setDashboardLoading(false);
    }
  };

  const initDashboard = async (forceRefresh = false) => {
    if (!forceRefresh) setLoading(true);
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

      // Fetch repos from all connected providers
      const allRepos: any[] = [];
      if (ghToken) {
        const ghRepos = await GH.getRepos(ghToken);
        allRepos.push(...ghRepos);
      }
      if (glToken) {
        const glRepos = await GL.getRepos(glToken);
        allRepos.push(...glRepos);
      }

      // Boards = same repos (issues as boards)
      const activeBoards = allRepos.map(r => ({
        id: r.id,
        name: r.name,
        type: 'github_issues',
        provider: r.provider,
      }));

      setRepositories(allRepos);
      setBoards(activeBoards);

      let currentRepo = selectedRepo;
      let currentBoard = selectedBoard;

      if (!currentRepo && allRepos.length > 0) {
        currentRepo = allRepos[0];
        setSelectedRepo(allRepos[0]);
      }
      if (!currentBoard && activeBoards.length > 0) {
        currentBoard = activeBoards[0];
        setSelectedBoard(activeBoards[0]);
      }
    } catch (e) {
      console.error('Init dashboard error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    initDashboard();
  }, []);

  // Sync data when global store repo/board changes
  useEffect(() => {
    // Ensure selectedBoard is always synced with selectedRepo
    if (selectedRepo && boards.length > 0) {
      const matchingBoard = boards.find(b => b.id === selectedRepo.id);
      if (matchingBoard && (!selectedBoard || selectedBoard.id !== matchingBoard.id)) {
        setSelectedBoard(matchingBoard);
        return; // wait for next render when board is synced
      }
    }

    if (sessionToken && selectedRepo && selectedBoard) {
      fetchDashboardData(sessionToken, selectedRepo, selectedBoard);

      // Real-time polling every 10 seconds
      const interval = setInterval(() => {
        fetchDashboardData(sessionToken, selectedRepo, selectedBoard);
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [selectedRepo?.id, selectedRepo?.provider, selectedBoard?.id, selectedBoard?.provider, sessionToken, boards]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await initDashboard(true);
    if (sessionToken) {
      await fetchDashboardData(sessionToken, selectedRepo, selectedBoard);
    }
    setRefreshing(false);
  };

  // Select handlers
  const handleSelectRepo = (repo: any) => {
    setSelectedRepo(repo);
    // Auto-sync the board to match the repo
    const matchingBoard = boards.find(b => b.id === repo.id);
    if (matchingBoard) setSelectedBoard(matchingBoard);
    else setSelectedBoard(null);

    setShowRepoDropdown(false);
    setAiSummary(null);
    setSummarizedPrNumber(null);
  };

  const handleSelectBoard = (board: any) => {
    setSelectedBoard(board);
    setShowBoardDropdown(false);
  };

  // AI Summarization Handler
  const handleSummarizePr = async (prNumber: number) => {
    if (!sessionToken || !selectedRepo) return;
    setAiLoading(true);
    setSummarizedPrNumber(prNumber);
    try {
      // Fetch diff from provider first
      let fullDiff = "";
      if (selectedRepo.provider === 'github') {
        const detail = await GH.getPRDetail(sessionToken, selectedRepo.id, prNumber.toString()) as any;
        if (detail && detail.files) {
          fullDiff = detail.files.map((f: any) => `--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch}`).join("\n");
        }
      } else if (selectedRepo.provider === 'gitlab') {
        const detail = await GL.getPRDetail(sessionToken, parseInt(selectedRepo.id, 10), prNumber.toString()) as any;
        if (detail && detail.files) {
          fullDiff = detail.files.map((f: any) => `--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch}`).join("\n");
        }
      }

      if (!fullDiff) throw new Error("No code changes found to summarize.");

      // Call Cloudflare AI Proxy directly
      const res = await fetch(`${AI_PROXY_URL}/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ diffText: fullDiff })
      });

      if (!res.ok) {
        let errMsg = `AI Proxy returned status ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.error) errMsg = errData.error;
        } catch (e) { }
        throw new Error(errMsg);
      }

      const data = await res.json();
      if (data.result) {
        setAiSummary(data.result);
      } else {
        throw new Error(data.error || 'Failed to summarize PR');
      }
    } catch (e: any) {
      console.error(e);
      if (Platform.OS === 'web') alert(e.message);
      else Alert.alert('AI Error', e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const timeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  // Memoized stats counts
  const stats = useMemo(() => {
    // Show total counts so we don't just display 0 for healthy/inactive repos
    const prsCount = prs.length;
    const pipelinesCount = pipelines.length;
    const cardsCount = cards.length;
    return {
      waiting: prsCount,
      failed: pipelinesCount,
      done: cardsCount
    };
  }, [prs, pipelines, cards]);

  // Top open PRs to list
  const recentPRs = useMemo(() => {
    return prs.slice(0, 3);
  }, [prs]);

  // First open PR for AI summary section
  const firstOpenPr = useMemo(() => {
    return prs.find(p => p.state === 'open');
  }, [prs]);

  const bgPage = isDark ? '#121212' : '#f4f4f5';
  const bgCard = isDark ? '#1a1a1a' : '#ffffff';
  const borderCard = isDark ? '#2a2a2a' : '#e5e7eb';
  const textMain = isDark ? '#ffffff' : '#000000';
  const textSub = isDark ? '#888888' : '#6b7280';

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-[#121212] justify-center items-center">
        <ActivityIndicator size="large" color="#eab308" />
        <Text className="text-gray-500 dark:text-gray-400 mt-4 font-semibold">Loading Dashboard...</Text>
      </SafeAreaView>
    );
  }

  // Show onboarding state if no repositories or boards are connected
  if (repositories.length === 0 && boards.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-[#121212]">
        <View className="bg-[#1e1e1e] dark:bg-yellow-500 px-4 pt-12 pb-4 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Text className="text-white dark:text-black text-2xl font-bold tracking-tighter">git</Text>
            <Text className="text-yellow-500 dark:text-black text-2xl font-black tracking-tighter ml-0.5">Cube</Text>
          </View>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
          <View className="bg-yellow-100 dark:bg-yellow-500/10 w-20 h-20 rounded-full items-center justify-center mb-6 border border-yellow-500/20">
            <Ionicons name="apps-outline" size={42} color="#F5C518" />
          </View>
          <Text style={{ color: textMain }} className="text-xl font-bold text-center mb-2">Welcome to gitCube</Text>
          <Text style={{ color: textSub }} className="text-center text-sm max-w-xs mb-8">
            Start by connecting a repository or project management board to sync your code workspace details here in real-time.
          </Text>
          <TouchableOpacity
            className="bg-[#222222] dark:bg-yellow-500 px-6 py-3.5 rounded-xl shadow-md flex-row items-center animate-bounce"
            onPress={() => router.push('/connected-accounts')}
          >
            <Ionicons name="link-outline" size={18} color={Platform.OS === 'web' ? '#fff' : '#000'} style={{ marginRight: 8 }} />
            <Text className="text-white dark:text-black font-bold text-base">Connect Account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#121212]">
      {/* Top Bar */}
      <View className="bg-white dark:bg-[#121212] border-b border-gray-200 dark:border-gray-900 px-4 pt-12 pb-4 flex-row justify-between items-center">
        <View className="flex-row items-center">
          <Text className="text-black dark:text-white text-2xl font-bold tracking-tighter">git</Text>
          <Text className="text-yellow-500 text-2xl font-black tracking-tighter ml-0.5">Cube</Text>
        </View>
        <View className="flex-row gap-3">
          <TouchableOpacity
            className="border border-gray-300 dark:border-white/20 rounded-lg p-2"
            activeOpacity={0.7}
            onPress={() => router.push('/profile')}
          >
            <Ionicons name="person-outline" size={20} color={isDark ? "white" : "black"} />
          </TouchableOpacity>
        </View>
      </View>

      {dashboardLoading && (
        <View className="py-2 bg-yellow-500/10 items-center">
          <ActivityIndicator size="small" color="#eab308" />
        </View>
      )}

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#eab308" />
        }
      >

        {/* Dynamic Selectors */}
        <View className="px-4 mb-6 z-50 relative">
          {repositories.length > 0 && (
            <View className="relative">
              <TouchableOpacity
                className="bg-gray-100 dark:bg-[#1e1e1e] px-4 py-3 rounded-xl flex-row justify-between items-center border border-gray-200 dark:border-gray-800"
                onPress={() => {
                  setShowRepoDropdown(!showRepoDropdown);
                  setShowBoardDropdown(false);
                }}
              >
                <View className="flex-row items-center flex-1">
                  <Ionicons name="git-branch-outline" size={16} color="#eab308" style={{ marginRight: 8 }} />
                  <Text className="text-black dark:text-white font-bold text-sm" numberOfLines={1}>
                    {selectedRepo ? selectedRepo.name : 'Select Repo'}
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={16} color="#888" />
              </TouchableOpacity>

              {showRepoDropdown && (
                <View className="absolute left-0 right-0 top-14 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden z-50 shadow-lg">
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true}>
                    {repositories.map(r => (
                      <TouchableOpacity
                        key={r.id + r.provider}
                        className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-row items-center justify-between active:bg-gray-50 dark:active:bg-[#252525]"
                        onPress={() => handleSelectRepo(r)}
                      >
                        <Text className="text-black dark:text-white text-sm font-semibold" numberOfLines={1}>{r.name}</Text>
                        {selectedRepo?.id === r.id && (
                          <Ionicons name="checkmark" size={16} color="#eab308" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}
        </View>
        {/* Dashboard Title */}
        <View className="px-4 mb-4 flex-row items-center">
          <Ionicons name="grid-outline" size={20} color={isDark ? "white" : "black"} />
          <View className="border-b-2 border-yellow-500 pb-0.5 ml-2">
            <Text className="text-xl font-bold text-black dark:text-white tracking-wide">Workspace Health</Text>
          </View>
        </View>

        {/* Stats Grid */}
        <View className="px-4 flex-row justify-between mb-6">
          <View className="bg-white dark:bg-[#1e1e1e] p-4 rounded-2xl border-2 border-black dark:border-yellow-500 w-[31%] flex-col">
            <View className="flex-row justify-between items-start">
              <Text className="text-3xl font-black text-black dark:text-white">{stats.waiting}</Text>
              <View className="w-2 h-2 rounded-full bg-yellow-500 mt-2" />
            </View>
            <Text className="text-gray-500 dark:text-gray-400 text-xs font-semibold mt-2">Total PRs</Text>
          </View>

          <View className="bg-white dark:bg-[#1e1e1e] p-4 rounded-2xl border-2 border-black dark:border-yellow-500 w-[31%] flex-col">
            <View className="flex-row justify-between items-start">
              <Text className="text-3xl font-black text-black dark:text-white">{stats.failed}</Text>
              <View className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
            </View>
            <Text className="text-gray-500 dark:text-gray-400 text-xs font-semibold mt-2">CI Runs</Text>
          </View>

          <View className="bg-white dark:bg-[#1e1e1e] p-4 rounded-2xl border-2 border-black dark:border-yellow-500 w-[31%] flex-col">
            <View className="flex-row justify-between items-start">
              <Text className="text-3xl font-black text-black dark:text-white">{stats.done}</Text>
              <View className="w-2 h-2 rounded-full bg-green-500 mt-2" />
            </View>
            <Text className="text-gray-500 dark:text-gray-400 text-xs font-semibold mt-2">Total Cards</Text>
          </View>
        </View>

        {/* Pull Requests Section */}
        <View className="px-4 mb-2 flex-row items-center border-t border-dashed border-gray-300 dark:border-gray-800 pt-4">
          <Text className="text-gray-400 dark:text-gray-600 mr-2">{"→"}</Text>
          <Text className="text-gray-500 dark:text-gray-400 text-lg font-bold">Active Pull Requests ({prs.length})</Text>
        </View>

        <View className="px-4 mb-6 space-y-3">
          {recentPRs.length === 0 ? (
            <View className="py-6 items-center border border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
              <Ionicons name="git-pull-request-outline" size={24} color="#888" />
              <Text className="text-gray-400 text-xs mt-2">No active PRs for this repository.</Text>
            </View>
          ) : (
            recentPRs.map(pr => {
              let badgeBorder = 'border-gray-300 dark:border-gray-800';
              let badgeText = 'text-gray-500 dark:text-gray-400';

              if (pr.state === 'open') {
                badgeBorder = 'border-green-500';
                badgeText = 'text-green-600 dark:text-green-500';
              } else if (pr.state === 'merged') {
                badgeBorder = 'border-purple-500';
                badgeText = 'text-purple-600 dark:text-purple-500';
              } else if (pr.state === 'closed') {
                badgeBorder = 'border-red-500';
                badgeText = 'text-red-600 dark:text-red-500';
              }

              return (
                <TouchableOpacity
                  key={pr.id}
                  className="flex-row items-center justify-between border-b border-dashed border-gray-300 dark:border-gray-800 pb-3 mb-2"
                  onPress={() => router.push({
                    pathname: '/pr-detail',
                    params: {
                      provider: selectedRepo!.provider,
                      repo: selectedRepo!.id,
                      prNumber: pr.number
                    }
                  })}
                  activeOpacity={0.7}
                >
                  <View className="flex-row items-center flex-1 mr-2">
                    <View className="border-2 border-black dark:border-gray-600 rounded-lg p-1 mr-3">
                      <View className="w-2 h-2 bg-yellow-500 rounded-full" />
                    </View>
                    <View className="flex-1">
                      <Text className="font-bold text-black dark:text-white text-sm" numberOfLines={1}>
                        {pr.title}
                      </Text>
                      <Text className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">
                        #{pr.number} • @{pr.authorName} • {timeAgo(pr.createdAt)}
                      </Text>
                    </View>
                  </View>
                  <View className={`border rounded-full px-2 py-0.5 ${badgeBorder}`}>
                    <Text className={`text-[10px] font-bold uppercase tracking-wider ${badgeText}`}>{pr.state}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Board column cards summary scroll */}
        {selectedBoard ? (
          <View>
            <View className="px-4 mb-3 flex-row items-center border-t border-dashed border-gray-300 dark:border-gray-800 pt-4">
              <Text className="text-gray-400 dark:text-gray-600 mr-2">{"→"}</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-lg font-bold">Active Board ({selectedBoard.name})</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="pl-4 mb-6">
              {['backlog', 'todo', 'inprogress', 'done'].map(statusKey => {
                const columnCards = cards.filter(c => c.status === statusKey).slice(0, 3);
                let colTitle = 'Backlog';
                let colColor = 'text-gray-600 dark:text-gray-400';
                let borderColor = 'border-gray-300 dark:border-gray-800';

                if (statusKey === 'todo') {
                  colTitle = 'To Do';
                  colColor = 'text-blue-500';
                } else if (statusKey === 'inprogress') {
                  colTitle = 'In Progress';
                  colColor = 'text-yellow-600 dark:text-yellow-500';
                  borderColor = 'border-yellow-500';
                } else if (statusKey === 'done') {
                  colTitle = 'Done';
                  colColor = 'text-green-600 dark:text-green-500';
                  borderColor = 'border-green-500';
                }

                return (
                  <View key={statusKey} className={`border-2 border-dashed ${borderColor} rounded-xl p-3 mr-3 w-44`}>
                    <View className="flex-row justify-between items-center mb-3">
                      <Text className={`font-bold ${colColor} text-xs uppercase`}>{colTitle}</Text>
                      <Text className="text-gray-400 dark:text-gray-500 font-bold text-xs">
                        {cards.filter(c => c.status === statusKey).length}
                      </Text>
                    </View>

                    {columnCards.length === 0 ? (
                      <View className="bg-white/50 dark:bg-black/20 rounded-lg p-3 items-center">
                        <Text className="text-gray-400 text-[10px]">No active cards</Text>
                      </View>
                    ) : (
                      columnCards.map(card => (
                        <TouchableOpacity
                          key={card.id}
                          className="bg-white dark:bg-[#252525] border border-black/10 dark:border-[#333333] rounded-lg p-2 mb-2 shadow-xs"
                          onPress={() => {
                            router.push({
                              pathname: '/ticket-detail',
                              params: {
                                id: card.id,
                                provider: card.provider,
                                boardId: selectedBoard.id,
                                title: card.title,
                                description: card.description || '',
                                status: card.status,
                                rawStatus: card.rawStatus || '',
                                labels: card.labels.join(','),
                                assignees: JSON.stringify(card.assignees || []),
                                linkedPRs: (card.linkedPRs || []).join(',')
                              }
                            });
                          }}
                        >
                          <Text className="text-black dark:text-white font-bold text-[11px] leading-tight mb-1" numberOfLines={2}>
                            {card.title}
                          </Text>
                          <Text className="text-gray-400 dark:text-gray-500 text-[9px] uppercase font-bold">
                            {card.id}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : (
          <View className="px-4 mt-4">
            <View className="py-6 items-center border border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
              <Ionicons name="albums-outline" size={24} color="#888" />
              <Text className="text-gray-400 text-xs mt-2">No active board selected.</Text>
            </View>
          </View>
        )}

        {/* AI Diff Summary Section */}
        {firstOpenPr && (
          <View>
            <View className="px-4 mb-3 flex-row items-center border-t border-dashed border-gray-300 dark:border-gray-800 pt-4">
              <Text className="text-gray-400 dark:text-gray-600 mr-2">{"→"}</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-lg font-bold">AI Diff Summarizer</Text>
            </View>

            <View className="mx-4 bg-white dark:bg-[#1e1e1e] border-2 border-black dark:border-yellow-500 rounded-3xl p-5 shadow-xs">
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center">
                  <Ionicons name="sparkles-sharp" size={16} color="#eab308" />
                  <Text className="font-bold text-black dark:text-white text-sm ml-2">PR #{firstOpenPr.number}</Text>
                </View>
                <View className="bg-black dark:bg-yellow-500 rounded-full px-2 py-0.5 flex-row items-center">
                  <Text className="text-yellow-500 dark:text-black font-extrabold text-[9px] uppercase">Llama 3.1</Text>
                </View>
              </View>

              <Text className="text-black dark:text-white font-black text-base mb-2" numberOfLines={1}>
                {firstOpenPr.title}
              </Text>

              {aiSummary && summarizedPrNumber === firstOpenPr.number ? (
                <View className="bg-yellow-50 dark:bg-yellow-500/5 border border-dashed border-yellow-400 dark:border-yellow-500/30 rounded-xl p-3">
                  <Text className="text-gray-700 dark:text-gray-300 text-xs leading-relaxed">
                    {aiSummary}
                  </Text>
                </View>
              ) : (
                <View className="items-center py-2">
                  <Text className="text-gray-500 dark:text-gray-400 text-xs text-center mb-3">
                    Analyze the latest pull request diff with AI summarization.
                  </Text>
                  <TouchableOpacity
                    className="bg-yellow-500 active:bg-yellow-600 rounded-xl py-2 px-5 flex-row items-center justify-center"
                    onPress={() => handleSummarizePr(firstOpenPr.number)}
                    disabled={aiLoading}
                  >
                    {aiLoading ? (
                      <ActivityIndicator size="small" color="black" />
                    ) : (
                      <>
                        <Ionicons name="sparkles" size={12} color="black" style={{ marginRight: 6 }} />
                        <Text className="text-black font-black text-xs uppercase tracking-wider">Summarize Changes</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}

      </ScrollView>

      {/* Release Notes Modal */}
      <Modal
        visible={showReleaseNotes}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseReleaseNotes}
      >
        <View className="flex-1 justify-center items-center bg-black/60 px-4">
          <View className="bg-white dark:bg-[#1e1e1e] w-full max-w-sm rounded-3xl p-6 shadow-xl border border-gray-200 dark:border-gray-800">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center">
                <Ionicons name="rocket" size={24} color="#eab308" style={{ marginRight: 8 }} />
                <Text className="text-xl font-bold text-black dark:text-white">v1.1.0 Release Notes</Text>
              </View>
              <TouchableOpacity onPress={handleCloseReleaseNotes} className="bg-gray-100 dark:bg-gray-800 rounded-full p-2">
                <Ionicons name="close" size={20} color={isDark ? "white" : "black"} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              <View className="mb-4">
                <Text className="text-sm font-bold text-black dark:text-white mb-2 tracking-wide">🚀 NEW FEATURES & IMPROVEMENTS</Text>
                <Text className="text-xs text-gray-600 dark:text-gray-400 mb-2 leading-tight">
                  <Text className="font-bold text-gray-800 dark:text-gray-200">• Security Features Added: </Text>
                  Added robust security features and improved token handling across the application.
                </Text>
                <Text className="text-xs text-gray-600 dark:text-gray-400 mb-2 leading-tight">
                  <Text className="font-bold text-gray-800 dark:text-gray-200">• Notifications Page Update: </Text>
                  You can now see your entire recent notification history directly in the app.
                </Text>
                <Text className="text-xs text-gray-600 dark:text-gray-400 mb-2 leading-tight">
                  <Text className="font-bold text-gray-800 dark:text-gray-200">• Enhanced PR Quick Actions: </Text>
                  Approve, Merge, and Re-run Pipelines directly from the Notifications screen.
                </Text>
              </View>

              <View className="mb-4">
                <Text className="text-sm font-bold text-black dark:text-white mb-2 tracking-wide">🐛 BUG FIXES</Text>
                <Text className="text-xs text-gray-600 dark:text-gray-400 mb-2 leading-tight">
                  <Text className="font-bold text-gray-800 dark:text-gray-200">• Settings UI Alignment: </Text>
                  Chevron arrows for connected accounts are now aligned properly.
                </Text>
                <Text className="text-xs text-gray-600 dark:text-gray-400 mb-2 leading-tight">
                  <Text className="font-bold text-gray-800 dark:text-gray-200">• Notification ID Extraction: </Text>
                  Resolved an API parsing issue that caused Quick Actions to fail.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              className="bg-yellow-500 rounded-xl py-3 items-center mt-2 shadow-sm"
              onPress={handleCloseReleaseNotes}
            >
              <Text className="text-black font-black text-sm uppercase tracking-widest">Awesome!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

export default Dashboard;