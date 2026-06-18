import React, { useState } from "react";
import { 
  View, 
  Text, 
  SafeAreaView, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Modal, 
  ActivityIndicator, 
  Platform, 
  KeyboardAvoidingView,
  Alert
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useColorScheme } from "nativewind";

const DEFAULT_USERNAME = "Test";
const DEFAULT_FULLNAME = "test example";
const DEFAULT_EMAIL = "test@example.com";
const DEFAULT_WORKSPACE = "gitCube / frontend";

export default function Profilepage() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  // Profile data states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    username: DEFAULT_USERNAME,
    fullName: DEFAULT_FULLNAME,
    email: DEFAULT_EMAIL,
    defaultWorkspace: DEFAULT_WORKSPACE
  });
  
  // Connection states (default to mockup screenshot values)
  const [githubConnected, setGithubConnected] = useState(true);
  const [gitlabConnected, setGitlabConnected] = useState(true); // represents 'expired' in GitLab row

  // Edit form modal states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editFullName, setEditFullName] = useState(DEFAULT_FULLNAME);
  const [editEmail, setEditEmail] = useState(DEFAULT_EMAIL);
  const [editDefaultWorkspace, setEditDefaultWorkspace] = useState(DEFAULT_WORKSPACE);


  // Capitalize and format username to full name
  const formatFullName = (username: string) => {
    if (!username || username === "guest" || username === DEFAULT_USERNAME) {
      return DEFAULT_FULLNAME;
    }
    const words = username
      .replace(/([A-Z])/g, ' $1') // split camelCase
      .replace(/[_-]/g, ' ') // replace snake_case / kebab-case
      .split(' ')
      .filter(Boolean);
    
    return words
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const token = Platform.OS === "web"
        ? localStorage.getItem("github_token") || localStorage.getItem("gitlab_token") || localStorage.getItem("jira_token")
        : (await SecureStore.getItemAsync("github_token")) || (await SecureStore.getItemAsync("gitlab_token")) || (await SecureStore.getItemAsync("jira_token"));
        
      const localUsername = Platform.OS === "web"
        ? localStorage.getItem("username")
        : await SecureStore.getItemAsync("username");

      const localFullName = Platform.OS === "web" ? localStorage.getItem("fullName") : await SecureStore.getItemAsync("fullName");
      const localEmail = Platform.OS === "web" ? localStorage.getItem("email") : await SecureStore.getItemAsync("email");
      const localWorkspace = Platform.OS === "web" ? localStorage.getItem("defaultWorkspace") : await SecureStore.getItemAsync("defaultWorkspace");

      const ghToken = Platform.OS === "web" ? localStorage.getItem("github_token") : await SecureStore.getItemAsync("github_token");
      const glToken = Platform.OS === "web" ? localStorage.getItem("gitlab_token") : await SecureStore.getItemAsync("gitlab_token");

      if (!token) {
        // Offline / Not Logged In guest fallback
        setProfile({
          username: DEFAULT_USERNAME,
          fullName: DEFAULT_FULLNAME,
          email: DEFAULT_EMAIL,
          defaultWorkspace: DEFAULT_WORKSPACE
        });
        setEditFullName(DEFAULT_FULLNAME);
        setEditEmail(DEFAULT_EMAIL);
        setEditDefaultWorkspace(DEFAULT_WORKSPACE);
        setGithubConnected(false);
        setGitlabConnected(false);
        setLoading(false);
        return;
      }

      const activeUsername = localUsername || DEFAULT_USERNAME;
      const derivedName = localFullName || formatFullName(activeUsername);
      const derivedEmail = localEmail || `${activeUsername.toLowerCase()}@example.com`;

      const updatedProfile = {
        username: activeUsername,
        fullName: derivedName,
        email: derivedEmail,
        defaultWorkspace: localWorkspace || DEFAULT_WORKSPACE
      };
      setProfile(updatedProfile);
      
      setEditFullName(updatedProfile.fullName);
      setEditEmail(updatedProfile.email);
      setEditDefaultWorkspace(updatedProfile.defaultWorkspace);
      
      setGithubConnected(!!ghToken);
      setGitlabConnected(!!glToken);

    } catch (e) {
      console.warn("Could not load profile from local storage, using fallback:", e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchProfile();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const handleOpenEdit = () => {
    setEditFullName(profile.fullName);
    setEditEmail(profile.email);
    setEditDefaultWorkspace(profile.defaultWorkspace);
    setEditModalVisible(true);
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      
      if (Platform.OS === "web") {
        localStorage.setItem("fullName", editFullName);
        localStorage.setItem("email", editEmail);
        localStorage.setItem("defaultWorkspace", editDefaultWorkspace);
      } else {
        await SecureStore.setItemAsync("fullName", editFullName);
        await SecureStore.setItemAsync("email", editEmail);
        await SecureStore.setItemAsync("defaultWorkspace", editDefaultWorkspace);
      }
      
      setProfile(prev => ({
        ...prev,
        fullName: editFullName,
        email: editEmail,
        defaultWorkspace: editDefaultWorkspace
      }));
      setEditModalVisible(false);

    } catch (e) {
      console.error("Error saving profile:", e);
      alert("Error saving profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem('github_token');
        localStorage.removeItem('gitlab_token');
        localStorage.removeItem('jira_token');
        localStorage.removeItem('user_token');
        localStorage.removeItem('fullName');
        localStorage.removeItem('email');
        localStorage.removeItem('defaultWorkspace');
      } else {
        await SecureStore.deleteItemAsync('github_token');
        await SecureStore.deleteItemAsync('gitlab_token');
        await SecureStore.deleteItemAsync('jira_token');
        await SecureStore.deleteItemAsync('trello_token');
        await SecureStore.deleteItemAsync('username');
        await SecureStore.deleteItemAsync('user_token');
        await SecureStore.deleteItemAsync('fullName');
        await SecureStore.deleteItemAsync('email');
        await SecureStore.deleteItemAsync('defaultWorkspace');
      }
      router.replace('/login');
    } catch (e) {
      console.error('Error signing out', e);
    }
  };

  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    if (Platform.OS === 'web') {
      const accepted = window.confirm(`${title}\n\n${message}`);
      if (accepted) onConfirm();
    } else {
      Alert.alert(
        title,
        message,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Confirm", style: "destructive", onPress: onConfirm }
        ]
      );
    }
  };

  const handleRevokeTokens = async () => {
    confirmAction(
      "Revoke All Sessions", 
      "Are you sure you want to revoke all API sessions? You will be logged out of this and all other devices.",
      async () => {
        try {
          await handleSignOut();
        } catch (e) {
          console.error("Revoke tokens error:", e);
          await handleSignOut();
        }
      }
    );
  };

  const handleDeleteAccount = async () => {
    confirmAction(
      "Delete Account", 
      "Are you sure you want to permanently delete your account? This action cannot be undone and all your board caches will be wiped.",
      async () => {
        try {
          await handleSignOut();
        } catch (e) {
          console.error("Delete account error:", e);
          await handleSignOut();
        }
      }
    );
  };

  const getInitials = (name: string, username: string) => {
    const activeName = name || username || "AH";
    const parts = activeName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return activeName.substring(0, 2).toUpperCase();
  };

  // Helper icons and styles dynamically matching the UI screenshot reference
  const getYellowIconColor = () => {
    return isDark ? "#eab308" : "#ca8a04";
  };

  const getHeaderIconColor = () => {
    return isDark ? "white" : "black";
  };

  const IconFrame = ({ children, color = "yellow" }: { children: React.ReactNode, color?: "yellow" | "gray" | "red" }) => {
    let borderStyle = "border-yellow-500/30 dark:border-yellow-500/40 bg-yellow-500/5";
    if (color === "gray") borderStyle = "border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-transparent";
    if (color === "red") borderStyle = "border-red-500/20 dark:border-red-500/30 bg-red-500/5";
    
    return (
      <View className={`border-2 ${borderStyle} rounded-xl p-2 items-center justify-center mr-4 w-11 h-11`}>
        {children}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-[#f4f4f5] dark:bg-[#121212] justify-center items-center">
        <ActivityIndicator size="large" color="#eab308" />
        <Text className="text-gray-500 dark:text-gray-400 mt-4 font-semibold">Loading profile...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f4f4f5] dark:bg-[#121212]">
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header Bar */}
      <View className="bg-white dark:bg-[#121212] border-b border-gray-100 dark:border-gray-900 px-4 pt-12 pb-4 flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <Ionicons name="arrow-back-outline" size={24} color={getHeaderIconColor()} />
          </TouchableOpacity>
          <Text className="text-black dark:text-white text-2xl font-bold tracking-tighter">git</Text>
          <Text className="text-yellow-500 text-2xl font-black tracking-tighter ml-0.5">Cube</Text>
        </View>
        <View className="flex-row space-x-3">
          <View className="border border-gray-200 dark:border-white/10 rounded-lg p-2">
            <Ionicons name="notifications-outline" size={20} color={getHeaderIconColor()} />
          </View>
          <View className="border border-yellow-500/30 rounded-lg p-2 bg-yellow-500/5">
            <Ionicons name="person" size={20} color="#eab308" />
          </View>
        </View>
      </View>

      <ScrollView 
        className="flex-1" 
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 60 }}
        showsVerticalScrollIndicator={true}
      >
        {/* Profile Card Section */}
        <View className="items-center mb-6">
          <View className="relative mb-3">
            {/* Initials Avatar */}
            <View className="w-24 h-24 rounded-full border-4 border-yellow-500 items-center justify-center bg-white dark:bg-[#1e1e1e]">
              <Text className="text-yellow-600 dark:text-yellow-500 text-3xl font-bold tracking-wider">
                {getInitials(profile.fullName, profile.username)}
              </Text>
            </View>
            {/* Edit overlay icon */}
            <TouchableOpacity 
              onPress={handleOpenEdit}
              className="absolute bottom-0 right-0 bg-yellow-500 w-8 h-8 rounded-full border-2 border-white dark:border-[#121212] items-center justify-center shadow-md"
              activeOpacity={0.8}
            >
              <Ionicons name="camera-outline" size={16} color="black" />
            </TouchableOpacity>
          </View>

          <Text className="text-black dark:text-white text-2xl font-black tracking-tight">{profile.fullName}</Text>
          <Text className="text-gray-500 dark:text-gray-400 text-sm font-semibold mt-1">@{profile.username}</Text>

          <View className="bg-yellow-500/15 dark:bg-yellow-500/10 border border-yellow-500/30 rounded-full px-4 py-1 mt-3">
            <Text className="text-yellow-600 dark:text-yellow-500 text-xs font-black tracking-widest uppercase">PRO</Text>
          </View>
        </View>

        {/* Dash/Stats Box Section */}
        <View className="flex-row justify-between mb-8">
          <View className="border-2 border-dashed border-yellow-500/40 bg-white dark:bg-yellow-500/5 rounded-2xl py-4 px-2 w-[31%] items-center justify-center">
            <Text className="text-3xl font-black text-yellow-500">38</Text>
            <Text className="text-gray-500 dark:text-gray-400 text-[10px] font-bold text-center mt-1 uppercase tracking-wider">PRs Reviewed</Text>
          </View>
          
          <View className="border-2 border-dashed border-yellow-500/40 bg-white dark:bg-yellow-500/5 rounded-2xl py-4 px-2 w-[31%] items-center justify-center">
            <Text className="text-3xl font-black text-yellow-500">14</Text>
            <Text className="text-gray-500 dark:text-gray-400 text-[10px] font-bold text-center mt-1 uppercase tracking-wider">CI Runs</Text>
          </View>

          <View className="border-2 border-dashed border-yellow-500/40 bg-white dark:bg-yellow-500/5 rounded-2xl py-4 px-2 w-[31%] items-center justify-center">
            <Text className="text-3xl font-black text-yellow-500">7</Text>
            <Text className="text-gray-500 dark:text-gray-400 text-[10px] font-bold text-center mt-1 uppercase tracking-wider">Active Boards</Text>
          </View>
        </View>

        {/* ACCOUNT INFO Card */}
        <Text className="text-gray-500 dark:text-gray-400 text-xs font-black tracking-widest mb-3 uppercase">Account Info</Text>
        <View className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-900 rounded-2xl p-4 mb-6 space-y-4 shadow-sm">
          <TouchableOpacity 
            onPress={handleOpenEdit}
            className="flex-row items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800/40"
            activeOpacity={0.7}
          >
            <View className="flex-row items-center flex-1">
              <IconFrame color="yellow">
                <Ionicons name="person-outline" size={18} color={getYellowIconColor()} />
              </IconFrame>
              <View className="flex-1">
                <Text className="text-gray-400 dark:text-gray-500 text-[10px] font-black uppercase tracking-wider">Username</Text>
                <Text className="text-black dark:text-white font-bold text-sm mt-0.5">{profile.username}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#aaa" />
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={handleOpenEdit}
            className="flex-row items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800/40"
            activeOpacity={0.7}
          >
            <View className="flex-row items-center flex-1">
              <IconFrame color="yellow">
                <Ionicons name="mail-outline" size={18} color={getYellowIconColor()} />
              </IconFrame>
              <View className="flex-1">
                <Text className="text-gray-400 dark:text-gray-500 text-[10px] font-black uppercase tracking-wider">Email Address</Text>
                <Text className="text-black dark:text-white font-bold text-sm mt-0.5" numberOfLines={1}>{profile.email || "not set"}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#aaa" />
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={handleOpenEdit}
            className="flex-row items-center justify-between"
            activeOpacity={0.7}
          >
            <View className="flex-row items-center flex-1">
              <IconFrame color="yellow">
                <Ionicons name="folder-open-outline" size={18} color={getYellowIconColor()} />
              </IconFrame>
              <View className="flex-1">
                <Text className="text-gray-400 dark:text-gray-500 text-[10px] font-black uppercase tracking-wider">Default Workspace</Text>
                <Text className="text-black dark:text-white font-bold text-sm mt-0.5" numberOfLines={1}>{profile.defaultWorkspace}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#aaa" />
          </TouchableOpacity>
        </View>

        {/* CONNECTED ACCOUNTS Card */}
        <Text className="text-gray-500 dark:text-gray-400 text-xs font-black tracking-widest mb-3 uppercase">Connected Accounts</Text>
        <View className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-900 rounded-2xl p-4 mb-6 space-y-4 shadow-sm">
          <View className="flex-row items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800/40">
            <View className="flex-row items-center flex-1">
              <IconFrame color="gray">
                <Ionicons name="logo-github" size={18} color="#888" />
              </IconFrame>
              <View>
                <Text className="text-black dark:text-white font-bold text-base">GitHub</Text>
              </View>
            </View>
            {githubConnected ? (
              <View className="border border-green-500 bg-green-50 dark:bg-green-500/10 rounded-full px-3 py-1">
                <Text className="text-green-600 dark:text-green-500 text-[10px] font-black uppercase tracking-wider">connected</Text>
              </View>
            ) : (
              <View className="border border-gray-300 dark:border-gray-800 bg-gray-100 dark:bg-gray-800/20 rounded-full px-3 py-1">
                <Text className="text-gray-500 text-[10px] font-black uppercase tracking-wider">not connected</Text>
              </View>
            )}
          </View>

          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-1">
              <IconFrame color="gray">
                <Ionicons name="logo-gitlab" size={18} color="#888" />
              </IconFrame>
              <View>
                <Text className="text-black dark:text-white font-bold text-base">GitLab</Text>
              </View>
            </View>
            {gitlabConnected ? (
              <View className="border border-red-500 bg-red-50 dark:bg-red-500/10 rounded-full px-3 py-1">
                <Text className="text-red-600 dark:text-red-500 text-[10px] font-black uppercase tracking-wider">expired</Text>
              </View>
            ) : (
              <View className="border border-gray-300 dark:border-gray-800 bg-gray-100 dark:bg-gray-800/20 rounded-full px-3 py-1">
                <Text className="text-gray-500 text-[10px] font-black uppercase tracking-wider">not connected</Text>
              </View>
            )}
          </View>
        </View>

        {/* SECURITY Card */}
        <Text className="text-gray-500 dark:text-gray-400 text-xs font-black tracking-widest mb-3 uppercase">Security</Text>
        <View className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-900 rounded-2xl p-4 mb-6 space-y-4 shadow-sm">
          <View className="flex-row items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800/40">
            <View className="flex-row items-center flex-1">
              <IconFrame color="yellow">
                <Ionicons name="shield-checkmark-outline" size={18} color={getYellowIconColor()} />
              </IconFrame>
              <View className="flex-1">
                <Text className="text-gray-400 dark:text-gray-500 text-[10px] font-black uppercase tracking-wider">Two-Factor Auth</Text>
                <Text className="text-black dark:text-white font-bold text-sm mt-0.5">Enabled</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#aaa" />
          </View>

          <View className="flex-row items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800/40">
            <View className="flex-row items-center flex-1">
              <IconFrame color="yellow">
                <Ionicons name="key-outline" size={18} color={getYellowIconColor()} />
              </IconFrame>
              <View className="flex-1">
                <Text className="text-gray-400 dark:text-gray-500 text-[10px] font-black uppercase tracking-wider">API Token</Text>
                <Text className="text-black dark:text-white font-bold text-sm mt-0.5">••••••••a3f9</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#aaa" />
          </View>

          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-1">
              <IconFrame color="yellow">
                <Ionicons name="desktop-outline" size={18} color={getYellowIconColor()} />
              </IconFrame>
              <View className="flex-1">
                <Text className="text-gray-400 dark:text-gray-500 text-[10px] font-black uppercase tracking-wider">Active Sessions</Text>
                <Text className="text-black dark:text-white font-bold text-sm mt-0.5">2 devices</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#aaa" />
          </View>
        </View>

        {/* DANGER ZONE Card */}
        <Text className="text-red-500 text-xs font-black tracking-widest mb-3 uppercase">Danger Zone</Text>
        <View className="bg-red-50/20 dark:bg-[#1e1e1e] border border-red-200 dark:border-red-500/20 rounded-2xl p-4 space-y-4 shadow-sm">
          <TouchableOpacity 
            onPress={handleRevokeTokens}
            className="flex-row items-center justify-between pb-3 border-b border-red-100 dark:border-gray-800/40"
            activeOpacity={0.7}
          >
            <View className="flex-row items-center flex-1">
              <IconFrame color="red">
                <Ionicons name="log-out-outline" size={18} color="#ef4444" />
              </IconFrame>
              <View className="flex-1">
                <Text className="text-red-500 font-bold text-base">Revoke All Tokens</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#ef4444" />
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={handleDeleteAccount}
            className="flex-row items-center justify-between"
            activeOpacity={0.7}
          >
            <View className="flex-row items-center flex-1">
              <IconFrame color="red">
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </IconFrame>
              <View className="flex-1">
                <Text className="text-red-500 font-bold text-base">Delete Account</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Edit Profile Form Modal */}
      <Modal
        visible={editModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 bg-black/60 justify-center items-center px-4"
        >
          <View className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-yellow-500/30 rounded-3xl p-6 w-full max-w-sm shadow-xl">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-black dark:text-white text-xl font-bold">Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>

            {/* Full Name Input */}
            <View className="mb-4">
              <Text className="text-yellow-600 dark:text-yellow-500 text-xs font-semibold mb-2 ml-1">Full Name</Text>
              <TextInput
                className="w-full bg-white dark:bg-[#121212] text-black dark:text-white border border-gray-200 dark:border-gray-800 px-4 py-3 rounded-xl text-base"
                placeholder="Enter full name"
                placeholderTextColor="#999"
                value={editFullName}
                onChangeText={setEditFullName}
              />
            </View>

            {/* Email Address Input */}
            <View className="mb-4">
              <Text className="text-yellow-600 dark:text-yellow-500 text-xs font-semibold mb-2 ml-1">Email Address</Text>
              <TextInput
                className="w-full bg-white dark:bg-[#121212] text-black dark:text-white border border-gray-200 dark:border-gray-800 px-4 py-3 rounded-xl text-base"
                placeholder="Enter email address"
                placeholderTextColor="#999"
                value={editEmail}
                onChangeText={setEditEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Default Workspace Input */}
            <View className="mb-6">
              <Text className="text-yellow-600 dark:text-yellow-500 text-xs font-semibold mb-2 ml-1">Default Workspace</Text>
              <TextInput
                className="w-full bg-white dark:bg-[#121212] text-black dark:text-white border border-gray-200 dark:border-gray-800 px-4 py-3 rounded-xl text-base"
                placeholder="Enter default workspace"
                placeholderTextColor="#999"
                value={editDefaultWorkspace}
                onChangeText={setEditDefaultWorkspace}
              />
            </View>

            {/* Action Buttons */}
            <View className="flex-row space-x-3 justify-end">
              <TouchableOpacity 
                onPress={() => setEditModalVisible(false)}
                className="px-4 py-3 bg-gray-100 dark:bg-gray-800/40 rounded-xl"
              >
                <Text className="text-gray-500 dark:text-gray-400 font-bold text-sm">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={handleSaveProfile}
                disabled={saving}
                className="px-5 py-3 bg-yellow-500 rounded-xl flex-row items-center"
              >
                {saving && <ActivityIndicator size="small" color="black" style={{ marginRight: 6 }} />}
                <Text className="text-black font-black text-sm">Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}