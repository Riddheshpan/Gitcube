import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Alert, Image, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { getApiUrl } from '../src/constants/api';

interface FileChange {
  filename: string;
  additions: number;
  deletions: number;
  patch: string;
}

interface Comment {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
}

interface PRDetail {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'merged' | 'closed' | 'draft';
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  checksStatus: 'passing' | 'failing' | 'pending' | 'none';
  reviewers: { username: string; state: string }[];
  comments: Comment[];
  files: FileChange[];
}

export default function PRDetailScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const params = useLocalSearchParams();

  const provider = params.provider as string;
  const repo = params.repo as string;
  const prNumber = params.prNumber as string;

  // Session & Data States
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pr, setPr] = useState<PRDetail | null>(null);

  // AI Summary States
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // File diff expansion state
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initSession = async () => {
      try {
        const token = Platform.OS === 'web'
          ? localStorage.getItem('user_token')
          : await SecureStore.getItemAsync('user_token');
        
        if (!token) {
          router.replace('/login');
          return;
        }
        setSessionToken(token);
        fetchPRDetail(token);
      } catch (e) {
        console.error('Session init error:', e);
        setLoading(false);
      }
    };
    initSession();
  }, []);

  // Quick Actions
  const [actionLoading, setActionLoading] = useState(false);
  const [showChangesInput, setShowChangesInput] = useState(false);
  const [changesComment, setChangesComment] = useState('');

  const handleApprove = async () => {
    const approve = () => {
      setActionLoading(true);
      fetch(getApiUrl(`/api/git/prs/${provider}/${prNumber}/approve`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ repoId: repo })
      })
      .then(res => res.json().then(data => ({ status: res.status, data })))
      .then(({ status, data }) => {
        if (status === 200 && data.success) {
          if (Platform.OS === 'web') alert('PR Approved successfully!');
          else Alert.alert('Success', 'PR Approved successfully!');
          if (sessionToken) fetchPRDetail(sessionToken);
        } else {
          throw new Error(data.error || 'Approval failed');
        }
      })
      .catch(e => {
        console.error(e);
        if (Platform.OS === 'web') alert(`Failed to approve PR: ${e.message}`);
        else Alert.alert('Error', `Failed to approve PR: ${e.message}`);
      })
      .finally(() => setActionLoading(false));
    };

    if (Platform.OS === 'web') {
      if (confirm("Are you sure you want to approve this Pull Request?")) {
        approve();
      }
    } else {
      Alert.alert(
        'Approve PR',
        'Are you sure you want to approve this Pull Request?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Approve', onPress: approve }
        ]
      );
    }
  };

  const handleRequestChanges = async (comment: string) => {
    if (!comment.trim()) {
      if (Platform.OS === 'web') alert('Review feedback comment cannot be empty.');
      else Alert.alert('Error', 'Review feedback comment cannot be empty.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(getApiUrl(`/api/git/prs/${provider}/${prNumber}/request-changes`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ repoId: repo, comment })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (Platform.OS === 'web') alert('Changes requested successfully.');
        else Alert.alert('Success', 'Changes requested successfully.');
        if (sessionToken) fetchPRDetail(sessionToken);
      } else {
        throw new Error(data.error || 'Action failed');
      }
    } catch (e: any) {
      console.error(e);
      if (Platform.OS === 'web') alert(`Failed to submit request: ${e.message}`);
      else Alert.alert('Error', `Failed to submit request: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMergePrompt = () => {
    const merge = (method: 'merge' | 'squash' | 'rebase') => {
      setActionLoading(true);
      fetch(getApiUrl(`/api/git/prs/${provider}/${prNumber}/merge`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ repoId: repo, mergeMethod: method })
      })
      .then(res => res.json().then(data => ({ status: res.status, data })))
      .then(({ status, data }) => {
        if (status === 200 && data.success) {
          if (Platform.OS === 'web') alert('PR merged successfully!');
          else Alert.alert('Success', 'PR merged successfully!');
          if (sessionToken) fetchPRDetail(sessionToken);
        } else {
          throw new Error(data.error || 'Merge failed');
        }
      })
      .catch(e => {
        console.error(e);
        if (Platform.OS === 'web') alert(`Failed to merge PR: ${e.message}`);
        else Alert.alert('Error', `Failed to merge PR: ${e.message}`);
      })
      .finally(() => setActionLoading(false));
    };

    if (provider === 'gitlab') {
      if (Platform.OS === 'web') {
        if (confirm("Merge this Merge Request?")) merge('merge');
      } else {
        Alert.alert('Merge MR', 'Are you sure you want to merge this GitLab Merge Request?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Merge', onPress: () => merge('merge') }
        ]);
      }
      return;
    }

    if (Platform.OS === 'web') {
      const option = prompt("Select merge method:\n1. Create Merge Commit\n2. Squash and Merge\n3. Rebase and Merge");
      if (option === '1') merge('merge');
      else if (option === '2') merge('squash');
      else if (option === '3') merge('rebase');
    } else {
      Alert.alert(
        'Merge Pull Request',
        'Choose merge strategy:',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Merge Commit', onPress: () => merge('merge') },
          { text: 'Squash & Merge', onPress: () => merge('squash') },
          { text: 'Rebase & Merge', onPress: () => merge('rebase') }
        ]
      );
    }
  };

  const fetchPRDetail = async (token: string) => {
    setLoading(true);
    try {
      const encodedRepo = encodeURIComponent(repo);
      const res = await fetch(getApiUrl(`/api/git/prs/${provider}/${prNumber}?repoId=${encodedRepo}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.status === 200) {
        setPr(data);
      } else {
        throw new Error(data.error || 'Failed to fetch PR details');
      }
    } catch (e: any) {
      console.error(e);
      if (Platform.OS === 'web') {
        alert(e.message);
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSummarizeDiff = async () => {
    if (!sessionToken || !pr) return;
    setAiLoading(true);
    try {
      const encodedRepo = encodeURIComponent(repo);
      const res = await fetch(getApiUrl(`/api/git/prs/${provider}/${prNumber}/summarize`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ repoId: repo })
      });
      const data = await res.json();
      if (res.status === 200) {
        setAiSummary(data.summary);
      } else {
        throw new Error(data.error || 'Failed to generate AI summary');
      }
    } catch (e: any) {
      console.error(e);
      if (Platform.OS === 'web') {
        alert(e.message);
      } else {
        Alert.alert('AI Error', e.message);
      }
    } finally {
      setAiLoading(false);
    }
  };

  const toggleExpandFile = (filename: string) => {
    setExpandedFiles(prev => ({
      ...prev,
      [filename]: !prev[filename]
    }));
  };

  const renderDiffLines = (patch: string) => {
    if (!patch) {
      return (
        <Text className="text-gray-500 dark:text-gray-400 italic text-xs p-3">
          No diff content available.
        </Text>
      );
    }
    const lines = patch.split('\n');
    return lines.map((line, idx) => {
      let lineBg = 'transparent';
      let lineTextColor = isDark ? '#ccc' : '#333';

      if (line.startsWith('+') && !line.startsWith('+++')) {
        lineBg = isDark ? 'rgba(34, 197, 94, 0.15)' : '#e6ffed';
        lineTextColor = '#22c55e';
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        lineBg = isDark ? 'rgba(239, 68, 68, 0.15)' : '#ffeef0';
        lineTextColor = '#f43f5e';
      } else if (line.startsWith('@@')) {
        lineBg = isDark ? 'rgba(59, 130, 246, 0.1)' : '#f1f8ff';
        lineTextColor = '#3b82f6';
      }

      return (
        <View key={idx} style={{ backgroundColor: lineBg }} className="px-3 py-0.5">
          <Text style={{ color: lineTextColor }} className="font-mono text-[11px] leading-4" numberOfLines={1}>
            {line}
          </Text>
        </View>
      );
    });
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-[#f4f4f5] dark:bg-[#121212] justify-center items-center">
        <ActivityIndicator size="large" color="#eab308" />
        <Text className="text-gray-500 dark:text-gray-400 mt-4 font-semibold">Loading PR details...</Text>
      </SafeAreaView>
    );
  }

  if (!pr) {
    return (
      <SafeAreaView className="flex-1 bg-[#f4f4f5] dark:bg-[#121212] justify-center items-center px-4">
        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" className="mb-2" />
        <Text className="text-black dark:text-white font-bold text-base">Failed to load PR detail.</Text>
        <TouchableOpacity 
          className="mt-4 px-5 py-2.5 bg-yellow-500 rounded-xl"
          onPress={() => router.back()}
        >
          <Text className="text-black font-bold">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // PR state badge config
  let stateBadgeClasses = 'border-gray-300 bg-gray-100 text-gray-500 dark:border-gray-800 dark:bg-gray-800/20 dark:text-gray-400';
  if (pr.state === 'open') {
    stateBadgeClasses = 'border-green-500 bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-500';
  } else if (pr.state === 'merged') {
    stateBadgeClasses = 'border-purple-500 bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400';
  } else if (pr.state === 'draft') {
    stateBadgeClasses = 'border-gray-400 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800/20 dark:text-gray-400';
  } else if (pr.state === 'closed') {
    stateBadgeClasses = 'border-red-500 bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-500';
  }

  // Checks status badge config
  let checksBadgeClasses = '';
  let checksTextClasses = '';
  let checksIcon = 'ellipse-outline';
  let checksIconColor = '#9ca3af';
  if (pr.checksStatus === 'passing') {
    checksBadgeClasses = 'border-green-500/30 bg-green-500/5';
    checksTextClasses = 'text-green-600 dark:text-green-500';
    checksIcon = 'checkmark-circle-outline';
    checksIconColor = '#22c55e';
  } else if (pr.checksStatus === 'failing') {
    checksBadgeClasses = 'border-red-500/20 bg-red-500/5';
    checksTextClasses = 'text-red-500';
    checksIcon = 'close-circle-outline';
    checksIconColor = '#ef4444';
  } else if (pr.checksStatus === 'pending') {
    checksBadgeClasses = 'border-blue-500/20 bg-blue-500/5';
    checksTextClasses = 'text-blue-500';
    checksIcon = 'sync-outline';
    checksIconColor = '#3b82f6';
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f4f4f5] dark:bg-[#121212]">
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header Bar */}
      <View className="bg-white dark:bg-[#121212] border-b border-gray-100 dark:border-gray-900 px-4 pt-12 pb-4 flex-row justify-between items-center">
        <View className="flex-row items-center flex-1 mr-4">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <Ionicons name="arrow-back-outline" size={24} color={isDark ? 'white' : 'black'} />
          </TouchableOpacity>
          <Text className="text-black dark:text-white text-xl font-extrabold tracking-tight" numberOfLines={1}>
            PR #{pr.number} Details
          </Text>
        </View>
        <TouchableOpacity
          className="border border-gray-200 dark:border-white/10 rounded-lg p-2 bg-gray-50 dark:bg-transparent"
          onPress={() => sessionToken && fetchPRDetail(sessionToken)}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh" size={18} color={isDark ? 'white' : 'black'} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title & Author */}
        <Text className="text-black dark:text-white text-2xl font-black tracking-tight">{pr.title}</Text>
        
        <View className="flex-row items-center flex-wrap mt-3 mb-5">
          <View className={`border rounded-full px-3 py-1 ${stateBadgeClasses}`}>
            <Text className="text-[10px] font-black uppercase tracking-wider">{pr.state}</Text>
          </View>
          {pr.checksStatus !== 'none' && (
            <View className={`border rounded-full px-3 py-1.5 ml-2 flex-row items-center ${checksBadgeClasses}`}>
              <Ionicons name={checksIcon as any} size={12} color={checksIconColor} style={{ marginRight: 4 }} />
              <Text className={`text-[10px] font-black uppercase tracking-wider ${checksTextClasses}`}>checks {pr.checksStatus}</Text>
            </View>
          )}
          <Text className="text-gray-500 dark:text-gray-400 text-xs font-semibold ml-3">
            by @{pr.authorName}
          </Text>
        </View>

        {/* PR Description Card */}
        <View className="bg-white dark:bg-[#1e1e1e] rounded-3xl p-6 border-2 border-black/5 dark:border-white/5 shadow-xs mb-4">
          <Text className="text-gray-400 dark:text-gray-500 text-[10px] font-black uppercase tracking-wider mb-2">Description</Text>
          <Text className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{pr.body || 'No description provided.'}</Text>
        </View>

        {/* AI DIFF SUMMARY CARD */}
        <View className="border-2 border-dashed border-yellow-500/40 bg-yellow-500/5 dark:border-yellow-500/30 rounded-3xl p-6 mb-4">
          <View className="flex-row justify-between items-center mb-4">
            <View className="flex-row items-center">
              <Ionicons name="sparkles-sharp" size={18} color="#ca8a04" />
              <Text className="text-yellow-800 dark:text-yellow-500 text-base font-extrabold ml-2">AI Diff Summary</Text>
            </View>
            <View className="bg-yellow-500/10 px-2 py-0.5 rounded-full">
              <Text className="text-[10px] text-yellow-700 dark:text-yellow-500 font-black uppercase tracking-wider">Llama 3.1</Text>
            </View>
          </View>

          {aiSummary ? (
            <View>
              <Text className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{aiSummary}</Text>
              <TouchableOpacity 
                className="flex-row items-center mt-4 border border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 rounded-lg self-start active:bg-yellow-500/20"
                onPress={handleSummarizeDiff}
                disabled={aiLoading}
                activeOpacity={0.7}
              >
                {aiLoading ? (
                  <ActivityIndicator size="small" color="#ca8a04" />
                ) : (
                  <>
                    <Ionicons name="refresh-outline" size={14} color="#ca8a04" style={{ marginRight: 4 }} />
                    <Text className="text-[#ca8a04] dark:text-yellow-500 text-xs font-black uppercase tracking-wider">Re-run analysis</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View className="items-center py-2">
              <Text className="text-gray-500 dark:text-gray-400 text-xs text-center mb-4 leading-relaxed">
                Generate a bulleted summary of all file changes in this PR using AI.
              </Text>
              <TouchableOpacity
                className="bg-yellow-500 active:bg-yellow-600 rounded-xl py-3 px-6 flex-row items-center justify-center shadow-xs"
                onPress={handleSummarizeDiff}
                disabled={aiLoading}
                activeOpacity={0.8}
              >
                {aiLoading ? (
                  <ActivityIndicator size="small" color="black" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={16} color="black" style={{ marginRight: 6 }} />
                    <Text className="text-black font-black text-sm uppercase tracking-wider">Summarize Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Reviewers List */}
        {pr.reviewers.length > 0 && (
          <View className="bg-white dark:bg-[#1e1e1e] rounded-3xl p-6 border-2 border-black/5 dark:border-white/5 shadow-xs mb-4">
            <Text className="text-gray-400 dark:text-gray-500 text-[10px] font-black uppercase tracking-wider mb-3">Reviewers</Text>
            <View className="flex-row flex-wrap gap-2">
              {pr.reviewers.map((r, i) => (
                <View key={i} className="flex-row items-center border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-transparent rounded-xl px-3 py-1.5">
                  <Ionicons name="person-outline" size={12} color={isDark ? '#888' : '#6b7280'} style={{ marginRight: 6 }} />
                  <Text className="text-gray-700 dark:text-gray-300 text-xs font-bold">@{r.username}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Files List / Diff panels */}
        <Text className="text-gray-400 dark:text-gray-500 text-xs font-black tracking-widest mt-6 mb-3 uppercase">Files Changed ({pr.files.length})</Text>
        
        {pr.files.length === 0 ? (
          <View className="bg-white dark:bg-[#1e1e1e] rounded-3xl p-6 border-2 border-black/5 dark:border-white/5 shadow-xs mb-4 items-center">
            <Text className="text-gray-400 dark:text-gray-500 text-xs">No file changes details fetched.</Text>
          </View>
        ) : (
          pr.files.map(f => {
            const isExpanded = !!expandedFiles[f.filename];
            return (
              <View key={f.filename} className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-800/80 rounded-2xl mb-3 overflow-hidden shadow-xs">
                {/* File Header Tab */}
                <TouchableOpacity
                  className="flex-row justify-between items-center px-4 py-3.5 bg-gray-50/50 dark:bg-transparent"
                  onPress={() => toggleExpandFile(f.filename)}
                  activeOpacity={0.8}
                >
                  <View className="flex-1 pr-2 mr-4">
                    <Text className="text-black dark:text-white font-extrabold text-sm" numberOfLines={1}>
                      {f.filename.split('/').pop()}
                    </Text>
                    <Text className="text-gray-400 dark:text-gray-500 text-[10px] font-semibold mt-0.5" numberOfLines={1}>
                      {f.filename}
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <Text className="text-green-500 text-xs font-extrabold mr-1.5">+{f.additions}</Text>
                    <Text className="text-red-500 text-xs font-extrabold mr-2.5">-{f.deletions}</Text>
                    <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={isDark ? '#888' : '#6b7280'} />
                  </View>
                </TouchableOpacity>

                {/* Diff Viewer panel */}
                {isExpanded && (
                  <View className="border-t border-gray-200 dark:border-gray-800 bg-[#0c0c0d] py-3">
                    <ScrollView horizontal={true} showsHorizontalScrollIndicator={true}>
                      <View className="flex-col min-w-full">
                        {renderDiffLines(f.patch)}
                      </View>
                    </ScrollView>
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* PR Comments/Conversation */}
        <Text className="text-gray-400 dark:text-gray-500 text-xs font-black tracking-widest mt-6 mb-3 uppercase">Conversation ({pr.comments.length})</Text>
        
        {pr.comments.length === 0 ? (
          <View className="bg-white dark:bg-[#1e1e1e] border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-3xl p-8 items-center justify-center shadow-xs mb-6">
            <Ionicons name="chatbox-outline" size={28} color={isDark ? '#555' : '#888'} className="mb-2" />
            <Text className="text-gray-400 dark:text-gray-500 text-sm font-semibold">No comments on this pull request.</Text>
          </View>
        ) : (
          pr.comments.map(c => (
            <View key={c.id} className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-800/80 rounded-2xl p-4 mb-3 shadow-xs">
              <View className="flex-row justify-between items-center mb-3">
                <View className="flex-row items-center">
                  {c.authorAvatarUrl ? (
                    <Image source={{ uri: c.authorAvatarUrl }} className="w-6 h-6 rounded-full" />
                  ) : (
                    <View className="w-6 h-6 rounded-full bg-gray-500 items-center justify-center">
                      <Text className="text-white font-bold text-[10px]">{c.authorName.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text className="text-black dark:text-white font-bold text-xs ml-2">
                    @{c.authorName}
                  </Text>
                </View>
                <Text className="text-gray-400 dark:text-gray-500 text-[10px] font-semibold">
                  {new Date(c.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Text className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{c.body}</Text>
            </View>
          ))
        )}
        {/* Collapsible comment input for Request Changes */}
        {showChangesInput && (
          <View className="bg-white dark:bg-[#1e1e1e] border border-red-500/30 rounded-3xl p-5 mb-4 mt-2">
            <Text className="text-red-500 font-bold text-sm mb-2">Request Changes Feedback</Text>
            <TextInput
              className="border border-gray-200 dark:border-gray-800 rounded-xl p-3 bg-gray-50 dark:bg-transparent text-black dark:text-white text-sm mb-3 min-h-[80px]"
              placeholder="What changes are required before merging?"
              placeholderTextColor="#888"
              multiline={true}
              value={changesComment}
              onChangeText={setChangesComment}
            />
            <View className="flex-row gap-2 justify-end">
              <TouchableOpacity
                className="border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2"
                onPress={() => {
                  setShowChangesInput(false);
                  setChangesComment('');
                }}
              >
                <Text className="text-gray-500 text-xs font-bold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-red-500 rounded-xl px-4 py-2"
                onPress={() => {
                  handleRequestChanges(changesComment);
                  setShowChangesInput(false);
                  setChangesComment('');
                }}
              >
                <Text className="text-white text-xs font-bold">Submit Feedback</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* QUICK ACTIONS BAR */}
        {pr.state === 'open' && (
          <View className="mt-8 mb-6 border-t border-gray-200 dark:border-gray-800 pt-6">
            <Text className="text-gray-400 dark:text-gray-500 text-xs font-black tracking-widest mb-4 uppercase">Quick Actions</Text>
            
            {actionLoading ? (
              <View className="py-4 items-center justify-center">
                <ActivityIndicator size="small" color="#eab308" />
                <Text className="text-xs text-gray-500 mt-2 font-semibold">Processing action...</Text>
              </View>
            ) : (
              <View className="flex-col gap-3">
                <View className="flex-row gap-3">
                  {/* Approve PR */}
                  <TouchableOpacity
                    className="flex-1 bg-green-500 active:bg-green-600 rounded-2xl py-3.5 flex-row items-center justify-center shadow-xs"
                    onPress={handleApprove}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark-circle" size={16} color="white" style={{ marginRight: 6 }} />
                    <Text className="text-white font-black text-sm uppercase tracking-wider">Approve</Text>
                  </TouchableOpacity>

                  {/* Request Changes */}
                  <TouchableOpacity
                    className="flex-1 bg-red-500 active:bg-red-600 rounded-2xl py-3.5 flex-row items-center justify-center shadow-xs"
                    onPress={() => setShowChangesInput(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="alert-circle" size={16} color="white" style={{ marginRight: 6 }} />
                    <Text className="text-white font-black text-sm uppercase tracking-wider">Request Changes</Text>
                  </TouchableOpacity>
                </View>

                {/* Merge PR */}
                <TouchableOpacity
                  className="w-full bg-purple-500 active:bg-purple-600 rounded-2xl py-3.5 flex-row items-center justify-center shadow-xs"
                  onPress={handleMergePrompt}
                  activeOpacity={0.8}
                >
                  <Ionicons name="git-merge" size={16} color="white" style={{ marginRight: 6 }} />
                  <Text className="text-white font-black text-sm uppercase tracking-wider">Merge Pull Request</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
