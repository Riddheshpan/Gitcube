import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { getApiUrl } from '../src/constants/api';

interface CardAssignee {
  name: string;
  avatarUrl: string | null;
}

export default function TicketDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const id = params.id as string;
  const provider = params.provider as string;
  const boardId = params.boardId as string;
  const initialTitle = params.title as string;
  const initialDescription = params.description as string;
  const initialStatus = params.status as 'backlog' | 'todo' | 'inprogress' | 'done';
  const initialRawStatus = params.rawStatus as string;
  
  // Parse labels
  const initialLabels = params.labels ? (params.labels as string).split(',') : [];
  
  // Parse assignees
  let initialAssignees: CardAssignee[] = [];
  try {
    if (params.assignees) {
      initialAssignees = JSON.parse(params.assignees as string);
    }
  } catch (e) {
    console.error('Failed to parse assignees', e);
  }

  // Parse linked PRs
  const initialLinkedPRs = params.linkedPRs ? (params.linkedPRs as string).split(',') : [];

  const [status, setStatus] = useState(initialStatus);
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  useEffect(() => {
    const getSession = async () => {
      const token = Platform.OS === 'web'
        ? localStorage.getItem('user_token')
        : await SecureStore.getItemAsync('user_token');
      setSessionToken(token);
    };
    getSession();
  }, []);

  const handleTransition = async (targetStatus: 'backlog' | 'todo' | 'inprogress' | 'done') => {
    if (!sessionToken) return;
    setTransitionLoading(true);

    try {
      const res = await fetch(getApiUrl(`/api/boards/cards/${provider}/move`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          boardId: boardId,
          cardId: id,
          status: targetStatus
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to transition status');
      }

      setStatus(targetStatus);
      if (Platform.OS === 'web') {
        alert(`Status updated to: ${targetStatus.toUpperCase()}`);
      } else {
        Alert.alert('Success', `Status updated to: ${targetStatus.toUpperCase()}`);
      }
    } catch (e: any) {
      console.error('Status transition error:', e);
      if (Platform.OS === 'web') {
        alert(e.message);
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setTransitionLoading(false);
    }
  };

  const handleOpenPR = async (prUrl: string) => {
    try {
      await WebBrowser.openBrowserAsync(prUrl);
    } catch (e) {
      console.error('Failed to open PR url', e);
    }
  };

  const getProviderConfig = () => {
    switch (provider) {
      case 'jira':
        return { label: 'Jira', color: '#3b82f6', icon: 'layers' };
      case 'github':
        return { label: 'GitHub Repository', color: '#6b7280', icon: 'logo-github' };
      case 'github_projects':
        return { label: 'GitHub Projects v2', color: '#8b5cf6', icon: 'logo-github' };
      case 'trello':
        return { label: 'Trello', color: '#00aecc', icon: 'apps-outline' };
      default:
        return { label: 'Custom Board', color: '#ca8a04', icon: 'list-outline' };
    }
  };

  const providerConfig = getProviderConfig();

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'backlog': return '#6b7280';
      case 'todo': return '#3b82f6';
      case 'inprogress': return '#ca8a04';
      case 'done': return '#10b981';
      default: return '#888';
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#eeeeee] dark:bg-[#121212]">
      {/* Top Header Navigation */}
      <View className="bg-[#1e1e1e] dark:bg-[#1a1a1a] px-4 pt-12 pb-4 flex-row items-center justify-between border-b border-black/10">
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center">
          <Ionicons name="chevron-back" size={24} color="#fff" />
          <Text className="text-white font-semibold text-lg ml-1">Board</Text>
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg">Ticket Details</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
        {/* Ticket Header Card */}
        <View className="bg-white dark:bg-[#1e1e1e] rounded-3xl p-6 border-2 border-black/5 dark:border-white/5 shadow-xs mb-4">
          <View className="flex-row justify-between items-center mb-3">
            {/* Provider indicator */}
            <View className="flex-row items-center px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800">
              <Ionicons name={providerConfig.icon as any} size={14} color={providerConfig.color} style={{ marginRight: 6 }} />
              <Text className="text-gray-600 dark:text-gray-300 font-bold text-xs uppercase">{providerConfig.label}</Text>
            </View>

            {/* Status indicator */}
            <View 
              className="px-3 py-1.5 rounded-full" 
              style={{ backgroundColor: `${getStatusColor(status)}20` }}
            >
              <Text 
                className="font-extrabold text-xs uppercase" 
                style={{ color: getStatusColor(status) }}
              >
                {status}
              </Text>
            </View>
          </View>

          <Text className="text-yellow-600 dark:text-yellow-500 font-black text-sm uppercase tracking-wider mb-2">
            {id}
          </Text>
          <Text className="text-black dark:text-white font-extrabold text-xl leading-snug mb-4">
            {initialTitle}
          </Text>

          {/* Labels list */}
          {initialLabels.length > 0 && (
            <View className="flex-row flex-wrap gap-1.5 mb-2">
              {initialLabels.map((l, idx) => (
                <View key={idx} className="bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700">
                  <Text className="text-gray-500 dark:text-gray-400 text-xs font-semibold">{l}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Description Section */}
        <View className="bg-white dark:bg-[#1e1e1e] rounded-3xl p-6 border-2 border-black/5 dark:border-white/5 shadow-xs mb-4">
          <Text className="text-black dark:text-white font-extrabold text-base mb-3">Description</Text>
          {initialDescription ? (
            <Text className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
              {initialDescription}
            </Text>
          ) : (
            <Text className="text-gray-400 dark:text-gray-500 text-sm italic">
              No description provided for this ticket.
            </Text>
          )}
        </View>

        {/* Assignees Section */}
        <View className="bg-white dark:bg-[#1e1e1e] rounded-3xl p-6 border-2 border-black/5 dark:border-white/5 shadow-xs mb-4">
          <Text className="text-black dark:text-white font-extrabold text-base mb-3">Assignee</Text>
          {initialAssignees.length > 0 ? (
            <View className="flex-row items-center">
              <View className="bg-yellow-500/20 w-10 h-10 rounded-full items-center justify-center mr-3 border border-yellow-500/10">
                <Ionicons name="person" size={18} color="#ca8a04" />
              </View>
              <View>
                <Text className="text-black dark:text-white font-bold text-sm">
                  {initialAssignees[0].name}
                </Text>
                <Text className="text-gray-400 text-xs">Primary Assignee</Text>
              </View>
            </View>
          ) : (
            <View className="flex-row items-center">
              <View className="bg-gray-100 dark:bg-gray-800 w-10 h-10 rounded-full items-center justify-center mr-3">
                <Ionicons name="person-outline" size={18} color="#888" />
              </View>
              <Text className="text-gray-400 dark:text-gray-500 text-sm italic">Unassigned</Text>
            </View>
          )}
        </View>

        {/* Linked PRs Section */}
        <View className="bg-white dark:bg-[#1e1e1e] rounded-3xl p-6 border-2 border-black/5 dark:border-white/5 shadow-xs mb-4">
          <Text className="text-black dark:text-white font-extrabold text-base mb-3">Linked Pull Requests</Text>
          {initialLinkedPRs.length > 0 && initialLinkedPRs[0] !== '' ? (
            <View className="gap-2">
              {initialLinkedPRs.map((prUrl, idx) => (
                <TouchableOpacity
                  key={idx}
                  className="bg-gray-50 dark:bg-[#252525] border border-black/5 dark:border-white/5 rounded-xl p-3 flex-row items-center justify-between active:bg-gray-100"
                  onPress={() => handleOpenPR(prUrl)}
                >
                  <View className="flex-row items-center flex-1 mr-2">
                    <Ionicons name="git-pull-request" size={16} color="#10b981" style={{ marginRight: 8 }} />
                    <Text className="text-blue-500 font-semibold text-xs underline" numberOfLines={1}>
                      {prUrl}
                    </Text>
                  </View>
                  <Ionicons name="open-outline" size={14} color="#888" />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View className="py-4 items-center justify-center border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
              <Ionicons name="git-branch-outline" size={24} color="#888" />
              <Text className="text-gray-400 dark:text-gray-500 text-xs mt-2 text-center">
                No active pull requests linked to this card.
              </Text>
            </View>
          )}
        </View>

        {/* Status Transitions Quick Action Panel */}
        <View className="bg-white dark:bg-[#1e1e1e] rounded-3xl p-6 border-2 border-black/5 dark:border-white/5 shadow-xs mb-10">
          <Text className="text-black dark:text-white font-extrabold text-base mb-3">Change Ticket Status</Text>
          <View className="gap-2">
            {[
              { key: 'backlog', label: 'Backlog', icon: 'list-outline', color: '#6b7280' },
              { key: 'todo', label: 'To Do', icon: 'ellipse-outline', color: '#3b82f6' },
              { key: 'inprogress', label: 'In Progress', icon: 'play-circle-outline', color: '#ca8a04' },
              { key: 'done', label: 'Done', icon: 'checkmark-circle-outline', color: '#10b981' }
            ].map(col => {
              const isCurrent = col.key === status;
              return (
                <TouchableOpacity
                  key={col.key}
                  className={`border rounded-xl p-3.5 flex-row items-center justify-between ${
                    isCurrent 
                      ? 'bg-yellow-500/10 border-yellow-500/20' 
                      : 'bg-gray-50 dark:bg-[#252525] border-black/5 dark:border-white/5 active:bg-gray-100'
                  }`}
                  onPress={() => !isCurrent && handleTransition(col.key as any)}
                  disabled={transitionLoading || isCurrent}
                >
                  <View className="flex-row items-center">
                    <Ionicons name={col.icon as any} size={16} color={col.color} style={{ marginRight: 8 }} />
                    <Text className={`font-bold text-sm ${isCurrent ? 'text-yellow-600 dark:text-yellow-500' : 'text-black dark:text-white'}`}>
                      {col.label}
                    </Text>
                  </View>
                  {isCurrent && <Ionicons name="checkmark" size={16} color="#ca8a04" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Global Transition Spinner */}
      {transitionLoading && (
        <View className="absolute inset-0 bg-black/30 justify-center items-center z-50">
          <ActivityIndicator size="large" color="#ca8a04" />
        </View>
      )}
    </SafeAreaView>
  );
}
