import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, Pressable, StyleSheet, ActivityIndicator, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { getApiUrl } from '../src/constants/api';

interface LogResponse {
  jobId: string | null;
  jobName: string;
  status: 'success' | 'failed' | 'running';
  logs: string;
}

export default function PipelineDetailScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const params = useLocalSearchParams();

  const provider = params.provider as string;
  const repo = params.repo as string;
  const runId = params.runId as string;

  // Session & Data States
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [logData, setLogData] = useState<LogResponse | null>(null);

  // AI Log Analysis States
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [rerunLoading, setRerunLoading] = useState(false);

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
        fetchPipelineLogs(token);
      } catch (e) {
        console.error('Session init error:', e);
        setLoading(false);
      }
    };
    initSession();
  }, []);

  const fetchPipelineLogs = async (token: string) => {
    setLoading(true);
    try {
      const encodedRepo = encodeURIComponent(repo);
      const res = await fetch(getApiUrl(`/api/git/pipelines/${provider}/${runId}/logs?repoId=${encodedRepo}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.status === 200) {
        setLogData(data);
      } else {
        throw new Error(data.error || 'Failed to fetch build logs');
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

  const handleRerunPipeline = async () => {
    if (!sessionToken || !logData) return;
    setRerunLoading(true);
    try {
      const res = await fetch(getApiUrl(`/api/git/pipelines/${provider}/${runId}/rerun`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ repoId: repo })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (Platform.OS === 'web') alert('Pipeline re-run triggered successfully!');
        else Alert.alert('Success', 'Pipeline re-run triggered successfully!');
        fetchPipelineLogs(sessionToken); // reload status/logs
      } else {
        throw new Error(data.error || 'Failed to re-run pipeline');
      }
    } catch (e: any) {
      console.error(e);
      if (Platform.OS === 'web') alert(`Failed to re-run pipeline: ${e.message}`);
      else Alert.alert('Error', `Failed to re-run pipeline: ${e.message}`);
    } finally {
      setRerunLoading(false);
    }
  };

  const handleAnalyzeLogs = async () => {
    if (!sessionToken || !logData) return;
    setAiLoading(true);
    try {
      const encodedRepo = encodeURIComponent(repo);
      const res = await fetch(getApiUrl(`/api/git/pipelines/${provider}/${runId}/analyze`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          repoId: repo,
          logs: logData.logs
        })
      });
      const data = await res.json();
      if (res.status === 200) {
        setAiAnalysis(data.analysis);
      } else {
        throw new Error(data.error || 'Failed to analyze logs with AI');
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

  // UI styling constants
  const bgCard = isDark ? '#1a1a1a' : '#ffffff';
  const bgPage = isDark ? '#121212' : '#f4f4f5';
  const borderCard = isDark ? '#2a2a2a' : '#e5e7eb';
  const textMain = isDark ? '#ffffff' : '#000000';
  const textSub = isDark ? '#888888' : '#6b7280';

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bgPage, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#F5C518" />
        <Text style={{ color: textSub, marginTop: 12, fontWeight: 'bold' }}>Retrieving pipeline logs...</Text>
      </SafeAreaView>
    );
  }

  if (!logData) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bgPage, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: textMain, fontWeight: 'bold' }}>Failed to retrieve pipeline run data.</Text>
      </SafeAreaView>
    );
  }

  const isFailed = logData.status === 'failed';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bgPage }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header Bar */}
      <View style={[ss.header, { backgroundColor: bgCard, borderBottomColor: borderCard }]}>
        <Pressable 
          style={({ pressed }) => [ss.iconBtn, { borderColor: borderCard, opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color={textMain} />
        </Pressable>
        <Text style={[ss.headerTitle, { color: textMain }]} numberOfLines={1}>
          Run #{runId} Log
        </Text>
        <Pressable 
          style={({ pressed }) => [ss.iconBtn, { borderColor: borderCard, opacity: pressed ? 0.6 : 1 }]}
          onPress={() => sessionToken && fetchPipelineLogs(sessionToken)}
        >
          <Ionicons name="refresh" size={18} color={textMain} />
        </Pressable>
      </View>

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Banner */}
        <View style={[
          ss.statusBanner, 
          { 
            backgroundColor: isFailed ? (isDark ? 'rgba(239,68,68,0.1)' : '#fee2e2') : (isDark ? 'rgba(34,197,94,0.1)' : '#dcfce7'),
            borderColor: isFailed ? '#f87171' : '#22c55e'
          }
        ]}>
          <Ionicons 
            name={isFailed ? 'close-circle-sharp' : 'checkmark-circle-sharp'} 
            size={24} 
            color={isFailed ? '#f87171' : '#22c55e'} 
            style={{ marginRight: 10 }}
          />
          <View>
            <Text style={[ss.statusText, { color: isFailed ? '#f43f5e' : '#15803d' }]}>
              {isFailed ? 'Pipeline Failed' : 'Pipeline Success'}
            </Text>
            <Text style={{ color: textSub, fontSize: 11, marginTop: 2 }}>
              Job: {logData.jobName || 'Unknown Job'}
            </Text>
          </View>
        </View>

        {/* RE-RUN PIPELINE QUICK ACTION */}
        <View style={{ marginBottom: 16 }}>
          {rerunLoading ? (
            <View style={{ paddingVertical: 10, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#F5C518" />
              <Text style={{ color: textSub, fontSize: 11, marginTop: 4, fontWeight: 'bold' }}>Triggering re-run...</Text>
            </View>
          ) : (
            <Pressable 
              style={({ pressed }) => [
                ss.rerunBtn, 
                { 
                  backgroundColor: isDark ? 'rgba(245,197,24,0.1)' : '#fef9c3', 
                  borderColor: isDark ? '#F5C518' : '#eab308',
                  opacity: pressed ? 0.8 : 1
                }
              ]}
              onPress={handleRerunPipeline}
            >
              <Ionicons name="refresh-outline" size={16} color={isDark ? '#F5C518' : '#eab308'} style={{ marginRight: 8 }} />
              <Text style={{ color: isDark ? '#F5C518' : '#eab308', fontWeight: 'bold', fontSize: 13 }}>Re-run Pipeline Run</Text>
            </Pressable>
          )}
        </View>

        {/* ==================== PREMIUM AI LOG ANALYZER CARD ==================== */}
        {isFailed && (
          <View style={[ss.aiCard, { 
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.05)' : '#fff5f5',
            borderColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fecaca'
          }]}>
            <View style={[ss.rowBetween, { marginBottom: 12 }]}>
              <View style={ss.row}>
                <Ionicons name="sparkles-sharp" size={18} color="#f43f5e" style={{ marginRight: 6 }} />
                <Text style={[ss.aiCardTitle, { color: isDark ? '#fecaca' : '#991b1b' }]}>AI Failure Analysis</Text>
              </View>
              <Text style={{ fontSize: 10, color: textSub, fontWeight: 'bold' }}>Llama 3.1</Text>
            </View>

            {aiAnalysis ? (
              <View style={{ marginTop: 4 }}>
                <Text style={{ color: textMain, fontSize: 13, lineHeight: 20 }}>{aiAnalysis}</Text>
                <Pressable 
                  style={({ pressed }) => [ss.aiResetBtn, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={handleAnalyzeLogs}
                  disabled={aiLoading}
                >
                  {aiLoading ? (
                    <ActivityIndicator size="small" color="#f43f5e" />
                  ) : (
                    <>
                      <Ionicons name="refresh-outline" size={12} color="#f43f5e" style={{ marginRight: 4 }} />
                      <Text style={{ color: '#f43f5e', fontSize: 11, fontWeight: 'bold' }}>Re-analyze logs</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <Text style={{ color: textSub, fontSize: 12, textAlign: 'center', marginBottom: 12, lineHeight: 18 }}>
                  Analyze truncated terminal error logs to find exactly why the build failed and how to resolve it.
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    ss.aiBtn,
                    { backgroundColor: '#f43f5e', opacity: pressed ? 0.8 : 1 }
                  ]}
                  onPress={handleAnalyzeLogs}
                  disabled={aiLoading}
                >
                  {aiLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="analytics" size={14} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Analyze with AI</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Truncated Log Terminal output */}
        <Text style={[ss.sectionLabel, { color: textSub, marginTop: 24, marginBottom: 12 }]}>BUILD TRACE LOGS (TRUNCATED)</Text>
        <View style={ss.terminalCard}>
          <View style={ss.terminalHeader}>
            <View style={[ss.dot, { backgroundColor: '#ff5f56' }]} />
            <View style={[ss.dot, { backgroundColor: '#ffbd2e', marginLeft: 6 }]} />
            <View style={[ss.dot, { backgroundColor: '#27c93f', marginLeft: 6 }]} />
            <Text style={ss.terminalTitle}>{logData.jobName || 'bash'}</Text>
          </View>
          <ScrollView 
            style={ss.terminalBody} 
            horizontal={true}
            showsHorizontalScrollIndicator={true}
            nestedScrollEnabled={true}
          >
            <View style={{ minWidth: '100%' }}>
              {logData.logs ? (
                <Text style={ss.terminalText}>{logData.logs}</Text>
              ) : (
                <Text style={[ss.terminalText, { fontStyle: 'italic', color: '#666' }]}>No logs fetched.</Text>
              )}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
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
    fontSize: 16,
    fontWeight: 'bold',
    maxWidth: '60%',
  },
  iconBtn: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  terminalCard: {
    backgroundColor: '#0c0c0d',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
    overflow: 'hidden',
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1b1b1c',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  terminalTitle: {
    color: '#888',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: 'bold',
    marginLeft: 12,
  },
  terminalBody: {
    maxHeight: 400,
    padding: 12,
  },
  terminalText: {
    color: '#00ff00',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
  aiCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginTop: 10,
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  aiCardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  aiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  aiResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 4,
  },
  rerunBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
  },
});
