import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

export default function TabLayout() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
          borderTopWidth: 2,
          borderTopColor: isDark ? '#333333' : '#e5e7eb',
          height: 62,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: isDark ? '#eab308' : '#111111',
        tabBarInactiveTintColor: isDark ? '#666666' : '#9ca3af',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: -2,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <View className={`p-1.5 rounded-xl ${focused ? 'bg-yellow-400' : 'bg-transparent'}`}>
              <Ionicons name="grid-outline" size={24} color={focused ? 'black' : color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="repos"
        options={{
          title: 'PRs',
          tabBarIcon: ({ color, focused }) => (
            <View className={`p-1.5 rounded-xl ${focused ? 'bg-yellow-400' : 'bg-transparent'}`}>
              <Ionicons name="git-pull-request-outline" size={24} color={focused ? 'black' : color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="boards"
        options={{
          title: 'Board',
          tabBarIcon: ({ color, focused }) => (
            <View className={`p-1.5 rounded-xl ${focused ? 'bg-yellow-400' : 'bg-transparent'}`}>
              <Ionicons name="clipboard-outline" size={24} color={focused ? 'black' : color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, focused }) => (
            <View className={`p-1.5 rounded-xl ${focused ? 'bg-yellow-400' : 'bg-transparent'}`}>
              <Ionicons name="notifications-outline" size={24} color={focused ? 'black' : color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <View className={`p-1.5 rounded-xl ${focused ? 'bg-yellow-400' : 'bg-transparent'}`}>
              <Ionicons name="settings-outline" size={24} color={focused ? 'black' : color} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
