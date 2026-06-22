import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useRouter, useFocusEffect } from 'expo-router';
import { getToken, isLoggedIn } from '../../src/api/auth';
import * as GH from '../../src/api/github';

interface Board {
  id: string;
  name: string;
  type: string;
  provider: 'github' | 'github_projects' | 'jira' | 'trello';
  projectId?: string;
  lastSynced?: string;
  syncError?: string;
}

interface CardAssignee {
  name: string;
  avatarUrl: string | null;
}

interface BoardCard {
  id: string;
  title: string;
  description: string;
  status: 'backlog' | 'todo' | 'inprogress' | 'done';
  rawStatus: string;
  provider: 'github' | 'github_projects' | 'jira' | 'trello';
  labels: string[];
  assignees: CardAssignee[];
  updatedAt: string;
  linkedPRs?: string[];
}

const COLUMNS = [
  { key: 'backlog', label: 'Backlog', icon: 'list-outline', color: '#6b7280' },
  { key: 'todo', label: 'To Do', icon: 'ellipse-outline', color: '#3b82f6' },
  { key: 'inprogress', label: 'In Progress', icon: 'play-circle-outline', color: '#ca8a04' },
  { key: 'done', label: 'Done', icon: 'checkmark-circle-outline', color: '#10b981' }
];

export default function BoardsScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [showBoardDropdown, setShowBoardDropdown] = useState(false);
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<string>('');

  useEffect(() => {
    const initSession = async () => {
      try {
        const loggedIn = await isLoggedIn();
        if (!loggedIn) {
          router.replace('/login');
          return;
        }
        const ghToken = await getToken('github_token');
        setSessionToken(ghToken);
        fetchBoards(ghToken);
      } catch (e) {
        console.error('Session init error:', e);
        setLoading(false);
      }
    };
    initSession();
  }, []);

  const fetchBoards = async (token: string | null) => {
    setLoading(true);
    try {
      const ghToken = await getToken('github_token');
      if (!ghToken) { setLoading(false); return; }
      // Get repos, then create a board entry per repo
      const repos = await GH.getRepos(ghToken);
      const boardList = repos.map(r => ({
        id: r.fullNameRaw,
        name: r.name,
        type: 'github_issues',
        provider: 'github' as const,
      }));
      setBoards(boardList);
      if (boardList.length > 0) {
        setSelectedBoard(boardList[0]);
        fetchCards(ghToken, boardList[0]);
      } else {
        setLoading(false);
      }
    } catch (e) {
      console.error('Fetch boards error:', e);
      setLoading(false);
    }
  };

  const fetchCards = async (token: string | null, board: Board) => {
    setCardsLoading(true);
    try {
      const ghToken = await getToken('github_token');
      if (!ghToken) { setCardsLoading(false); setLoading(false); return; }
      const cardList = await GH.getIssuesAsCards(ghToken, board.id);
      setCards(cardList as any);
      setLastSynced(new Date().toLocaleTimeString());
    } catch (e) {
      console.error('Fetch cards error:', e);
      setCards([]);
    } finally {
      setCardsLoading(false);
      setLoading(false);
    }
  };

  // Auto-refresh cards when screen comes back into focus
  useFocusEffect(
    useCallback(() => {
      if (sessionToken && selectedBoard) {
        fetchCards(sessionToken, selectedBoard);
      }
    }, [sessionToken, selectedBoard?.id])
  );

  const handleSelectBoard = (board: Board) => {
    setSelectedBoard(board);
    setShowBoardDropdown(false);
    if (sessionToken) {
      fetchCards(sessionToken, board);
    }
  };

  const handleMoveCard = async (card: BoardCard, targetStatus: 'backlog' | 'todo' | 'inprogress' | 'done') => {
    if (!sessionToken || !selectedBoard) return;
    setMoveLoading(true);
    setSelectedCard(null);

    // Optimistic UI update
    const previousCards = [...cards];
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: targetStatus } : c));

    try {
      const ghToken = await getToken('github_token');
      if (!ghToken) throw new Error('No GitHub token');

      // Map status to a GitHub label and update the issue labels directly
      const statusLabelMap: Record<string, string> = {
        backlog: 'backlog',
        todo: 'todo',
        inprogress: 'in progress',
        done: 'done',
      };
      const newLabel = statusLabelMap[targetStatus];
      const issueNumber = card.id; // GitHub issue id

      // Find the issue number from the repo board
      // GitHub Issues API: PATCH /repos/{owner}/{repo}/issues/{issue_number}
      // We use labels to track status — add the new status label
      await fetch(`https://api.github.com/repos/${selectedBoard.id}/issues/${issueNumber}/labels`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ghToken}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'gitCube-App',
        },
        body: JSON.stringify({ labels: [newLabel] }),
      });
    } catch (e: any) {
      console.error('Move card error:', e);
      // Revert optimistic update on failure
      setCards(previousCards);
      if (Platform.OS === 'web') {
        alert(e.message || 'Failed to move card');
      } else {
        Alert.alert('Error', e.message || 'Failed to move card');
      }
    } finally {
      setMoveLoading(false);
    }
  };


  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-[#121212] justify-center items-center">
        <ActivityIndicator size="large" color="#ca8a04" />
        <Text className="text-gray-500 dark:text-gray-400 mt-4 font-semibold">Loading boards...</Text>
      </SafeAreaView>
    );
  }

  // Render when no boards/connections exist
  if (boards.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-[#121212]">
        <View className="bg-[#1e1e1e] dark:bg-yellow-500 px-4 pt-12 pb-4 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Text className="text-white dark:text-black text-2xl font-bold tracking-tighter">git</Text>
            <Text className="text-yellow-500 dark:text-black text-2xl font-black tracking-tighter ml-0.5">Cube</Text>
          </View>
        </View>
        <View className="flex-1 justify-center items-center px-6">
          <View className="bg-yellow-100 dark:bg-yellow-500/10 w-20 h-20 rounded-full items-center justify-center mb-6">
            <Ionicons name="link-outline" size={40} color="#ca8a04" />
          </View>
          <Text className="text-black dark:text-white text-xl font-bold text-center mb-2">No Active Connections</Text>
          <Text className="text-gray-500 dark:text-gray-400 text-center text-sm max-w-xs mb-8">
            Connect your GitHub or Jira accounts in settings to start syncing project boards.
          </Text>
          <TouchableOpacity 
            className="bg-[#222222] dark:bg-yellow-500 px-6 py-3.5 rounded-xl shadow-md flex-row items-center"
            onPress={() => router.push('/connected-accounts')}
          >
            <Ionicons name="settings-outline" size={18} color={Platform.OS === 'web' ? '#fff' : '#000'} style={{ marginRight: 8 }} />
            <Text className="text-white dark:text-black font-bold text-base">Configure Connections</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#eeeeee] dark:bg-[#121212]">
      {/* Header with Board Picker */}
      <View className="bg-white dark:bg-[#1a1a1a] px-4 pt-12 pb-4 border-b border-black/10 dark:border-yellow-500/10">
        <View className="flex-row justify-between items-center">
          <TouchableOpacity 
            className="flex-row items-center bg-gray-100 dark:bg-[#262626] px-4 py-2.5 rounded-xl border border-black/5 dark:border-white/10"
            onPress={() => setShowBoardDropdown(!showBoardDropdown)}
          >
            <Ionicons 
              name={
                selectedBoard?.provider === 'jira' ? 'layers' :
                selectedBoard?.provider === 'trello' ? 'apps-outline' :
                selectedBoard?.provider === 'github_projects' ? 'logo-github' : 'logo-github'
              } 
              size={18} 
              color={
                selectedBoard?.provider === 'jira' ? '#3b82f6' :
                selectedBoard?.provider === 'trello' ? '#00aecc' :
                selectedBoard?.provider === 'github_projects' ? '#8b5cf6' : 
                (Platform.OS === 'web' ? 'inherit' : undefined) // fallback
              } 
              style={{ marginRight: 8 }} 
            />
            <Text className="text-black dark:text-white font-bold text-sm max-w-[200px]" numberOfLines={1}>
              {selectedBoard?.name}
            </Text>
            <Ionicons name="chevron-down" size={14} color="#888" style={{ marginLeft: 8 }} />
          </TouchableOpacity>

          <TouchableOpacity 
            className="p-2.5 bg-gray-100 dark:bg-[#2d2d2d] rounded-xl border border-black/5 dark:border-transparent"
            onPress={() => selectedBoard && sessionToken && fetchCards(sessionToken, selectedBoard)}
            disabled={cardsLoading}
          >
            {cardsLoading ? (
              <ActivityIndicator size="small" color="#888" />
            ) : (
              <Ionicons name="refresh" size={18} color={isDark ? '#fff' : '#000'} />
            )}
          </TouchableOpacity>
        </View>

        {/* Board Selection Dropdown List */}
        {showBoardDropdown && (
          <View className="bg-white dark:bg-[#2d2d2d] mt-2 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 shadow-sm">
            {boards.map(b => (
              <TouchableOpacity 
                key={b.id + b.provider}
                className="px-4 py-3 flex-row items-center border-b border-black/5 dark:border-white/5 active:bg-gray-50 dark:active:bg-[#333333]"
                onPress={() => handleSelectBoard(b)}
              >
                <Ionicons 
                  name={
                    b.provider === 'jira' ? 'layers' :
                    b.provider === 'trello' ? 'apps-outline' :
                    b.provider === 'github_projects' ? 'logo-github' : 'logo-github'
                  } 
                  size={16} 
                  color={
                    b.provider === 'jira' ? '#3b82f6' :
                    b.provider === 'trello' ? '#00aecc' :
                    b.provider === 'github_projects' ? '#8b5cf6' : 
                    (Platform.OS === 'web' ? 'inherit' : undefined)
                  } 
                  style={{ marginRight: 10 }} 
                />
                <View className="flex-1">
                  <Text className="text-black dark:text-white font-semibold text-sm">{b.name}</Text>
                  <Text className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{b.provider.toUpperCase()} Board</Text>
                </View>
                {selectedBoard?.id === b.id && selectedBoard?.provider === b.provider && (
                  <Ionicons name="checkmark" size={16} color="#eab308" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Kanban Board Container */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={Platform.OS === 'web'}
        className="flex-1 py-4 px-2"
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        {COLUMNS.map(column => {
          const columnCards = cards.filter(c => c.status === column.key);
          
          return (
            <View key={column.key} className="w-[280px] bg-white dark:bg-[#1a1a1a] rounded-[24px] border-2 border-black/5 dark:border-yellow-500/5 p-4 mx-2 flex-1 shadow-sm">
              {/* Column Title */}
              <View className="flex-row justify-between items-center mb-4 pb-2 border-b border-gray-100 dark:border-gray-800">
                <View className="flex-row items-center">
                  <Ionicons name={column.icon as any} size={18} color={column.color} style={{ marginRight: 6 }} />
                  <Text className="text-black dark:text-white font-bold text-base">{column.label}</Text>
                </View>
                <View className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                  <Text className="text-gray-500 dark:text-gray-400 text-xs font-bold">{columnCards.length}</Text>
                </View>
              </View>

              {/* Column Cards (Vertical List) */}
              <ScrollView 
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 10 }}
              >
                {columnCards.length === 0 ? (
                  <View className="py-8 justify-center items-center border border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
                    <Ionicons name="file-tray-outline" size={24} color="#888" />
                    <Text className="text-gray-400 text-xs mt-2">No tickets</Text>
                  </View>
                ) : (
                  columnCards.map(card => (
                    <TouchableOpacity 
                      key={card.id}
                      className="bg-[#f9f9f9] dark:bg-[#252525] border-2 border-black/5 dark:border-white/5 rounded-xl p-4 mb-3 active:scale-[0.98] transition-transform shadow-xs"
                      onPress={() => {
                        router.push({
                          pathname: '/ticket-detail',
                          params: {
                            id: card.id,
                            provider: card.provider,
                            boardId: selectedBoard?.id || '',
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
                      <View className="flex-row justify-between items-start mb-2">
                        <Text className="bg-yellow-100 dark:bg-yellow-500/20 text-[#ca8a04] dark:text-[#eab308] text-2xs uppercase font-extrabold px-1.5 py-0.5 rounded">
                          {card.id}
                        </Text>
                        <Ionicons 
                          name={
                            card.provider === 'jira' ? 'layers' :
                            card.provider === 'trello' ? 'apps-outline' :
                            'logo-github'
                          } 
                          size={12} 
                          color={
                            card.provider === 'jira' ? '#3b82f6' :
                            card.provider === 'trello' ? '#00aecc' :
                            card.provider === 'github_projects' ? '#8b5cf6' : '#888'
                          } 
                        />
                      </View>
                      <Text className="text-black dark:text-white font-bold text-sm leading-tight mb-2" numberOfLines={2}>
                        {card.title}
                      </Text>

                      {/* Display Labels */}
                      {card.labels.length > 0 && (
                        <View className="flex-row flex-wrap mb-3 gap-1">
                          {card.labels.slice(0, 3).map((l, index) => (
                            <View key={index} className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                              <Text className="text-gray-500 dark:text-gray-400 text-[10px] font-semibold">{l}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Display Assignees */}
                      {card.assignees.length > 0 && (
                        <View className="flex-row items-center mt-1">
                          <View className="bg-yellow-500/20 w-5 h-5 rounded-full items-center justify-center mr-1.5 border border-yellow-500/10">
                            <Ionicons name="person" size={10} color="#ca8a04" />
                          </View>
                          <Text className="text-gray-500 dark:text-gray-400 text-xs font-medium" numberOfLines={1}>
                            {card.assignees[0].name}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>

      {/* Sync Status Footer */}
      {selectedBoard && (
        <View className="bg-white dark:bg-[#1a1a1a] py-2.5 px-4 flex-row justify-between items-center border-t border-black/10 dark:border-white/10">
          <View className="flex-row items-center">
            {selectedBoard.syncError ? (
              <>
                <Ionicons name="warning-outline" size={14} color="#f87171" style={{ marginRight: 6 }} />
                <Text className="text-red-500 dark:text-red-400 text-2xs font-semibold max-w-[200px]" numberOfLines={1}>
                  Error: {selectedBoard.syncError}
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={14} color="#10b981" style={{ marginRight: 6 }} />
                <Text className="text-gray-500 dark:text-gray-400 text-2xs">
                  Synced: {selectedBoard.lastSynced ? new Date(selectedBoard.lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : lastSynced || 'Never'}
                </Text>
              </>
            )}
          </View>
          <Text className="text-yellow-600 dark:text-yellow-500 text-2xs uppercase font-extrabold tracking-widest">
            {selectedBoard.syncError ? 'Sync Stalled' : 'Live Sync Connected'}
          </Text>
        </View>
      )}

      {/* Global Move Loading Overlay */}
      {moveLoading && (
        <View className="absolute inset-0 bg-black/30 justify-center items-center z-50">
          <ActivityIndicator size="large" color="#ca8a04" />
        </View>
      )}
    </SafeAreaView>
  );
}
