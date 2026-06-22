import React from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Switch, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useRouter, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

export default function SettingsScreen() {
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [githubConnected, setGithubConnected] = React.useState(false);
  const [gitlabConnected, setGitlabConnected] = React.useState(false);
  const [jiraConnected, setJiraConnected] = React.useState(false);
  const [username, setUsername] = React.useState('');

  const handleToggleTheme = async () => {
    toggleColorScheme();
    const newTheme = isDark ? 'light' : 'dark';
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem('app_theme', newTheme);
      } else {
        await SecureStore.setItemAsync('app_theme', newTheme);
      }
    } catch (e) {
      console.warn('Failed to save theme', e);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      const checkTokens = async () => {
        try {
          const ghToken = Platform.OS === 'web' 
            ? localStorage.getItem('github_token')
            : await SecureStore.getItemAsync('github_token');
          setGithubConnected(!!ghToken);

          const glToken = Platform.OS === 'web' 
            ? localStorage.getItem('gitlab_token')
            : await SecureStore.getItemAsync('gitlab_token');
          setGitlabConnected(!!glToken);

          const jrToken = Platform.OS === 'web' 
            ? localStorage.getItem('jira_token')
            : await SecureStore.getItemAsync('jira_token');
          setJiraConnected(!!jrToken);

          const storedUser = Platform.OS === 'web'
            ? localStorage.getItem('username')
            : await SecureStore.getItemAsync('username');
          setUsername(storedUser || '');
        } catch (e) {
          console.error('Error reading tokens in settings', e);
        }
      };
      checkTokens();
    }, [])
  );

  const getConnectionStatusText = () => {
    const active = [];
    if (githubConnected) active.push('GitHub');
    if (gitlabConnected) active.push('GitLab');
    if (jiraConnected) active.push('Jira');
    if (active.length === 0) return 'No accounts connected';
    return `Connected: ${active.join(', ')}`;
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#121212]">
      {/* Top Bar - Matches first image (Dark in light mode, Yellow in dark mode) */}
      <View className="bg-[#1e1e1e] dark:bg-yellow-500 px-4 pt-12 pb-4 flex-row justify-between items-center">
        <View className="flex-row items-center">
          <Text className="text-white dark:text-black text-2xl font-bold tracking-tighter">git</Text>
          <Text className="text-yellow-500 dark:text-black text-2xl font-black tracking-tighter ml-0.5">Cube</Text>
        </View>
        <View className="flex-row space-x-3">
          <View className="border border-white/50 dark:border-black/30 rounded-lg p-2">
            <Ionicons name="notifications-outline" size={20} color={isDark ? "black" : "white"} />
          </View>
          <TouchableOpacity
            className="border border-white/50 dark:border-black/30 rounded-lg p-2"
            activeOpacity={0.7}
            onPress={() => router.push('/profile')}
          >
            <Ionicons name="person-outline" size={20} color={isDark ? "black" : "white"} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Settings Title */}
        <View className="mb-6 flex-row items-center">
          <Ionicons name="settings-outline" size={20} color={isDark ? "white" : "black"} />
          <View className="border-b-2 border-yellow-500 pb-0.5 ml-2">
            <Text className="text-xl font-bold text-black dark:text-white tracking-wide">Settings</Text>
          </View>
        </View>

        {/* Profile Card */}
        {username ? (
          <View className="bg-white dark:bg-[#1e1e1e] border-2 border-black dark:border-yellow-500 rounded-2xl p-4 flex-row items-center shadow-sm mb-4">
            <View className="bg-yellow-100 dark:bg-yellow-500/20 w-12 h-12 rounded-full items-center justify-center mr-4">
              <Ionicons name="person" size={24} color={isDark ? "#eab308" : "#ca8a04"} />
            </View>
            <View>
              <Text className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wider">Logged in as</Text>
              <Text className="font-bold text-black dark:text-white text-lg mt-0.5">{username}</Text>
            </View>
          </View>
        ) : null}

        {/* Toggle Section */}
        <View className="bg-white dark:bg-[#1e1e1e] border-2 border-black dark:border-yellow-500 rounded-2xl p-4 flex-row justify-between items-center shadow-sm">
          <View className="flex-row items-center">
            <View className="bg-yellow-100 dark:bg-yellow-500/20 w-10 h-10 rounded-full items-center justify-center mr-3">
              <Ionicons 
                name={isDark ? "moon" : "sunny"} 
                size={20} 
                color={isDark ? "#eab308" : "#ca8a04"} 
              />
            </View>
            <View>
              <Text className="font-bold text-black dark:text-white text-base">Dark Mode</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Toggle app theme</Text>
            </View>
          </View>
          <Switch
            trackColor={{ false: '#e5e7eb', true: '#eab308' }}
            thumbColor={isDark ? '#fff' : '#fff'}
            ios_backgroundColor="#e5e7eb"
            onValueChange={handleToggleTheme}
            value={isDark}
          />
        </View>

        {/* Connected Accounts Section */}
        <TouchableOpacity
          className="bg-white dark:bg-[#1e1e1e] border-2 border-black dark:border-yellow-500 rounded-2xl p-4 flex-row justify-between items-center shadow-sm mt-4"
          onPress={() => router.push('/connected-accounts')}
        >
          <View className="flex-row items-center">
            <View className="bg-blue-100 dark:bg-blue-500/20 w-10 h-10 rounded-full items-center justify-center mr-3">
              <Ionicons 
                name="link" 
                size={20} 
                color={isDark ? "#3b82f6" : "#2563eb"} 
              />
            </View>
            <View className="flex-1 pr-2">
              <Text className="font-bold text-black dark:text-white text-base">Connected Accounts</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-xs mt-0.5" numberOfLines={1}>
                {getConnectionStatusText()}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={isDark ? "white" : "black"} />
        </TouchableOpacity>

        {/* Privacy Policy & Terms of Service Section */}
        <TouchableOpacity
          className="bg-white dark:bg-[#1e1e1e] border-2 border-black dark:border-yellow-500 rounded-2xl p-4 flex-row justify-between items-center shadow-sm mt-4"
          onPress={() => router.push('/privacy-terms')}
        >
          <View className="flex-row items-center">
            <View className="bg-purple-100 dark:bg-purple-500/20 w-10 h-10 rounded-full items-center justify-center mr-3">
              <Ionicons 
                name="document-text" 
                size={20} 
                color={isDark ? "#a855f7" : "#7c3aed"} 
              />
            </View>
            <View className="flex-1 pr-2">
              <Text className="font-bold text-black dark:text-white text-base">Privacy & Terms</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-xs mt-0.5" numberOfLines={1}>
                Read user agreements and privacy policy
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={isDark ? "white" : "black"} />
        </TouchableOpacity>

        {/* Sign Out Button */}
        <TouchableOpacity 
          className="bg-red-500/10 border-2 border-red-500 rounded-2xl p-4 flex-row justify-center items-center mt-6"
          onPress={async () => {
            try {
              if (Platform.OS === 'web') {
                localStorage.removeItem('github_token');
                localStorage.removeItem('gitlab_token');
                localStorage.removeItem('jira_token');
                localStorage.removeItem('user_token');
                localStorage.removeItem('username');
              } else {
                await SecureStore.deleteItemAsync('github_token');
                await SecureStore.deleteItemAsync('gitlab_token');
                await SecureStore.deleteItemAsync('jira_token');
                await SecureStore.deleteItemAsync('user_token');
                await SecureStore.deleteItemAsync('username');
              }
              setGithubConnected(false);
              setGitlabConnected(false);
              setJiraConnected(false);
              setUsername('');
              router.replace('/login');
            } catch (e) {
              console.error('Error signing out', e);
            }
          }}
        >
          <Ionicons name="log-out-outline" size={20} color="#ef4444" style={{ marginRight: 8 }} />
          <Text className="text-red-500 font-bold text-base">Sign Out of All Accounts</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
