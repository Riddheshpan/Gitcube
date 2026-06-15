import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, Pressable, StyleSheet, ActivityIndicator, Platform, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getToken, isLoggedIn } from '../../src/api/auth';
import * as GH from '../../src/api/github';

interface NotificationItem {
  _id: string;
  type: 'pr_review' | 'ci_failure' | 'merge_conflict' | 'mention' | 'other';
  title: string;
  body: string;
  read: boolean;
  provider?: 'github' | 'gitlab';
  repoId?: string;
  resourceId?: string;
  createdAt: string;
}

type FilterType = 'all' | 'pr' | 'ci' | 'mention';

export default function NotificationsScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // States to track ongoing quick actions to show loading indicators
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchNotifications = async (token: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const notifs = await GH.getNotifications(token);
      setNotifications(notifs);
    } catch (e) {
      console.error('Error fetching notifications:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const loggedIn = await isLoggedIn();
        if (!loggedIn) {
          router.replace('/login');
          return;
        }
        const ghToken = await getToken('github_token');
        setSessionToken(ghToken);
        if (ghToken) fetchNotifications(ghToken);
        else setLoading(false);
      } catch (e) {
        console.error('Notifications init error:', e);
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleRefresh = async () => {
    if (!sessionToken) return;
    setRefreshing(true);
    await fetchNotifications(sessionToken, true);
  };

  const handleMarkRead = async (id: string) => {
    if (!sessionToken) return;
    try {
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
      await GH.markNotificationRead(sessionToken, id);
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
    }
  };

  const handleMarkAllRead = async () => {
    if (!sessionToken || notifications.length === 0) return;
    try {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      await GH.markAllNotificationsRead(sessionToken);
    } catch (e) {
      console.error('Failed to mark all as read:', e);
    }
  };

  // Perform Quick Action: Approve PR
  const handleApprovePR = async (notif: NotificationItem) => {
    if (!sessionToken || !notif.repoId || !notif.resourceId) return;
    const notifId = notif._id;
    setActionLoadingId(notifId);
    try {
      // GitHub: POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
      const res = await fetch(
        `https://api.github.com/repos/${notif.repoId}/pulls/${notif.resourceId}/reviews`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'gitCube-App',
          },
          body: JSON.stringify({ event: 'APPROVE' }),
        }
      );
      if (res.ok) {
        Alert.alert('PR Approved', `PR #${notif.resourceId} approved successfully!`);
        await handleMarkRead(notifId);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `GitHub returned ${res.status}`);
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert('Action Failed', `Failed to approve PR: ${e.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Perform Quick Action: Merge PR
  const handleMergePR = async (notif: NotificationItem) => {
    if (!sessionToken || !notif.repoId || !notif.resourceId) return;
    const notifId = notif._id;
    setActionLoadingId(notifId);
    try {
      // GitHub: PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge
      const res = await fetch(
        `https://api.github.com/repos/${notif.repoId}/pulls/${notif.resourceId}/merge`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'gitCube-App',
          },
          body: JSON.stringify({ merge_method: 'merge' }),
        }
      );
      if (res.ok) {
        Alert.alert('PR Merged', `PR #${notif.resourceId} merged successfully!`);
        await handleMarkRead(notifId);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `GitHub returned ${res.status}`);
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert('Action Failed', `Failed to merge PR: ${e.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Perform Quick Action: Re-run CI/CD pipeline
  const handleRerunPipeline = async (notif: NotificationItem) => {
    if (!sessionToken || !notif.repoId || !notif.resourceId) return;
    const notifId = notif._id;
    setActionLoadingId(notifId);
    try {
      // GitHub: POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun
      const res = await fetch(
        `https://api.github.com/repos/${notif.repoId}/actions/runs/${notif.resourceId}/rerun`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'gitCube-App',
          },
        }
      );
      if (res.ok || res.status === 201) {
        Alert.alert('Pipeline Triggered', 'CI Pipeline re-run triggered successfully!');
        await handleMarkRead(notifId);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `GitHub returned ${res.status}`);
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert('Action Failed', `Failed to re-run pipeline: ${e.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };


  const getRelativeTime = (dateStr: string) => {
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

  const filteredNotifications = notifications.filter(n => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'pr') return n.type === 'pr_review';
    if (activeFilter === 'ci') return n.type === 'ci_failure';
    if (activeFilter === 'mention') return n.type === 'mention' || n.type === 'merge_conflict';
    return true;
  });

  // UI styling tokens
  const bgPage = isDark ? '#121212' : '#f4f4f5';
  const bgCard = isDark ? '#1a1a1a' : '#ffffff';
  const borderCard = isDark ? '#2a2a2a' : '#e5e7eb';
  const textMain = isDark ? '#ffffff' : '#000000';
  const textSub = isDark ? '#888888' : '#6b7280';

  return (
    <SafeAreaView style={[ss.safeArea, { backgroundColor: bgPage }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      {/* Header bar */}
      <View style={[ss.header, { backgroundColor: bgCard, borderBottomColor: borderCard }]}>
        <View style={ss.row}>
          <Text style={[ss.headerTitle, { color: textMain }]}>Notifications</Text>
          {notifications.some(n => !n.read) && (
            <View style={ss.unreadDotBadge} />
          )}
        </View>
        <Pressable 
          style={({ pressed }) => [ss.headerActionBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={handleMarkAllRead}
        >
          <Ionicons name="checkmark-done-outline" size={20} color={isDark ? '#F5C518' : '#eab308'} />
          <Text style={[ss.headerActionText, { color: isDark ? '#F5C518' : '#eab308' }]}>Read All</Text>
        </Pressable>
      </View>

      {/* Filter Tabs */}
      <View style={ss.filterContainer}>
        {(['all', 'pr', 'ci', 'mention'] as FilterType[]).map(filter => {
          let label = 'All';
          let icon = 'notifications-outline';
          if (filter === 'pr') { label = 'PRs'; icon = 'git-pull-request-outline'; }
          if (filter === 'ci') { label = 'CI Runs'; icon = 'play-outline'; }
          if (filter === 'mention') { label = 'Mentions'; icon = 'person-outline'; }

          const isActive = activeFilter === filter;
          const count = notifications.filter(n => {
            if (filter === 'all') return !n.read;
            if (filter === 'pr') return n.type === 'pr_review' && !n.read;
            if (filter === 'ci') return n.type === 'ci_failure' && !n.read;
            if (filter === 'mention') return (n.type === 'mention' || n.type === 'merge_conflict') && !n.read;
            return false;
          }).length;

          return (
            <Pressable
              key={filter}
              style={[
                ss.filterTab, 
                isActive && { backgroundColor: isDark ? '#F5C518' : '#eab308', borderColor: isDark ? '#F5C518' : '#eab308' },
                !isActive && { borderColor: borderCard }
              ]}
              onPress={() => setActiveFilter(filter)}
            >
              <Ionicons 
                name={icon as any} 
                size={14} 
                color={isActive ? '#111' : textSub} 
                style={{ marginRight: 4 }}
              />
              <Text style={[ss.filterTabText, { color: isActive ? '#111' : textSub }]}>
                {label}
              </Text>
              {count > 0 && (
                <View style={[ss.filterCount, { backgroundColor: isActive ? '#111' : (isDark ? '#333' : '#e5e7eb') }]}>
                  <Text style={[ss.filterCountText, { color: isActive ? '#fff' : textMain }]}>{count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Notifications list feed */}
      {loading ? (
        <View style={ss.loaderContainer}>
          <ActivityIndicator size="large" color="#F5C518" />
          <Text style={[ss.loaderText, { color: textSub }]}>Retrieving notifications...</Text>
        </View>
      ) : filteredNotifications.length === 0 ? (
        <ScrollView
          contentContainerStyle={ss.emptyContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#F5C518" />
          }
        >
          <View style={[ss.emptyIconContainer, { backgroundColor: isDark ? '#222' : '#f3f4f6' }]}>
            <Ionicons name="notifications-off-outline" size={40} color={textSub} />
          </View>
          <Text style={[ss.emptyTitle, { color: textMain }]}>No Notifications</Text>
          <Text style={[ss.emptySubtitle, { color: textSub }]}>
            {activeFilter === 'all'
              ? "You are all caught up! Webhook events will appear here in real-time."
              : `No notifications matching '${activeFilter.toUpperCase()}'.`}
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#F5C518" />
          }
        >
          {filteredNotifications.map(notif => {
            // Icon settings per notification type
            let iconName = 'notifications-outline';
            let iconColor = '#F5C518';
            let typeBg = 'rgba(245,197,24,0.1)';
            
            if (notif.type === 'ci_failure') {
              iconName = 'close-circle-outline';
              iconColor = '#ef4444';
              typeBg = isDark ? 'rgba(239,68,68,0.15)' : '#fee2e2';
            } else if (notif.type === 'pr_review') {
              iconName = 'git-pull-request-outline';
              iconColor = '#22c55e';
              typeBg = isDark ? 'rgba(34,197,94,0.15)' : '#f0fdf4';
            } else if (notif.type === 'mention') {
              iconName = 'at-outline';
              iconColor = '#a855f7';
              typeBg = isDark ? 'rgba(168,85,247,0.15)' : '#faf5ff';
            } else if (notif.type === 'merge_conflict') {
              iconName = 'git-merge-outline';
              iconColor = '#f97316';
              typeBg = isDark ? 'rgba(249,115,22,0.15)' : '#ffedd5';
            }

            const isActionLoading = actionLoadingId === notif._id;

            return (
              <View 
                key={notif._id} 
                style={[
                  ss.card, 
                  { 
                    backgroundColor: bgCard, 
                    borderColor: borderCard,
                    opacity: notif.read ? 0.75 : 1
                  }
                ]}
              >
                {/* Header Row */}
                <View style={ss.cardHeader}>
                  <View style={ss.row}>
                    <View style={[ss.iconBg, { backgroundColor: typeBg }]}>
                      <Ionicons name={iconName as any} size={18} color={iconColor} />
                    </View>
                    <View style={ss.titleContainer}>
                      <Text style={[ss.cardTitle, { color: textMain, fontWeight: notif.read ? '600' : 'bold' }]}>
                        {notif.title}
                      </Text>
                      {notif.repoId ? (
                        <Text style={[ss.repoLabel, { color: textSub }]}>
                          📁 {notif.repoId}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  
                  {/* Mark single notification read if unread */}
                  {!notif.read ? (
                    <Pressable 
                      style={({ pressed }) => [ss.markReadBtn, { opacity: pressed ? 0.6 : 1 }]}
                      onPress={() => handleMarkRead(notif._id)}
                    >
                      <Ionicons name="checkmark-outline" size={16} color={textSub} />
                    </Pressable>
                  ) : (
                    <Ionicons name="checkmark-done-sharp" size={14} color="#a3a3a3" />
                  )}
                </View>

                {/* Body Content */}
                <Text style={[ss.cardBody, { color: textMain }]}>
                  {notif.body}
                </Text>

                {/* Relative timestamp */}
                <View style={[ss.rowBetween, { marginTop: 12 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="time-outline" size={12} color={textSub} style={{ marginRight: 4 }} />
                    <Text style={[ss.timeText, { color: textSub }]}>
                      {getRelativeTime(notif.createdAt)}
                    </Text>
                  </View>

                  {/* Normalized badge */}
                  {notif.provider && (
                    <View style={ss.providerBadge}>
                      <Ionicons 
                        name={notif.provider === 'github' ? 'logo-github' : 'logo-gitlab'} 
                        size={10} 
                        color={textSub} 
                        style={{ marginRight: 3 }}
                      />
                      <Text style={[ss.providerText, { color: textSub }]}>
                        {notif.provider}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Webhook Quick Actions */}
                {!notif.read && notif.repoId && notif.resourceId && (
                  <View style={ss.actionRow}>
                    {isActionLoading ? (
                      <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
                        <ActivityIndicator size="small" color="#F5C518" />
                      </View>
                    ) : (
                      <>
                        {/* CI failures quick action: Re-run build */}
                        {notif.type === 'ci_failure' && (
                          <Pressable 
                            style={({ pressed }) => [ss.actionBtn, { backgroundColor: isDark ? 'rgba(245,197,24,0.1)' : '#fef9c3', borderColor: isDark ? '#F5C518' : '#eab308', opacity: pressed ? 0.8 : 1 }]}
                            onPress={() => handleRerunPipeline(notif)}
                          >
                            <Ionicons name="refresh-outline" size={14} color={isDark ? '#F5C518' : '#eab308'} style={{ marginRight: 6 }} />
                            <Text style={[ss.actionBtnText, { color: isDark ? '#F5C518' : '#eab308' }]}>Re-run Pipeline</Text>
                          </Pressable>
                        )}

                        {/* PR review requests quick actions: Approve / Merge */}
                        {notif.type === 'pr_review' && (
                          <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
                            <Pressable 
                              style={({ pressed }) => [ss.actionBtn, { backgroundColor: isDark ? 'rgba(34,197,94,0.1)' : '#f0fdf4', borderColor: '#22c55e', opacity: pressed ? 0.8 : 1, flex: 1 }]}
                              onPress={() => handleApprovePR(notif)}
                            >
                              <Ionicons name="checkmark-circle-outline" size={14} color="#22c55e" style={{ marginRight: 6 }} />
                              <Text style={[ss.actionBtnText, { color: '#22c55e' }]}>Approve PR</Text>
                            </Pressable>
                            
                            <Pressable 
                              style={({ pressed }) => [ss.actionBtn, { backgroundColor: isDark ? 'rgba(168,85,247,0.1)' : '#faf5ff', borderColor: '#a855f7', opacity: pressed ? 0.8 : 1, flex: 1 }]}
                              onPress={() => handleMergePR(notif)}
                            >
                              <Ionicons name="git-merge-outline" size={14} color="#a855f7" style={{ marginRight: 6 }} />
                              <Text style={[ss.actionBtnText, { color: '#a855f7' }]}>Merge PR</Text>
                            </Pressable>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  unreadDotBadge: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
    marginLeft: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerActionText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterCount: {
    borderRadius: 99,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 4,
  },
  filterCountText: {
    fontSize: 9,
    fontWeight: '900',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  titleContainer: {
    flex: 1,
    paddingRight: 8,
  },
  cardTitle: {
    fontSize: 14,
    lineHeight: 18,
  },
  repoLabel: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: '700',
  },
  markReadBtn: {
    padding: 4,
    borderRadius: 6,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.85,
    marginBottom: 12,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  providerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 4,
  },
  providerText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'transparent',
    paddingTop: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 8,
    flex: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
});
