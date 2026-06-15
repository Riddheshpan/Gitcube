import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

/**
 * Signup is no longer supported in the serverless version.
 * Users log in via GitHub / GitLab OAuth — no server-side accounts.
 */
export default function SignupScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-[#d4d4d4] items-center justify-center px-6">
      <StatusBar style="dark" />
      <View className="w-full bg-[#eeeeee] p-8 rounded-[32px] shadow-sm items-center">
        <Text className="text-black text-2xl font-bold mb-3 text-center">No account needed</Text>
        <Text className="text-gray-500 text-sm text-center mb-6 leading-5">
          gitCube works with your existing GitHub or GitLab account.{'\n'}
          No registration required — just connect with OAuth.
        </Text>
        <TouchableOpacity
          className="bg-[#fbbf24] px-8 py-3.5 rounded-xl w-full items-center"
          onPress={() => router.replace('/login')}
        >
          <Text className="text-black font-bold text-lg">Go to Login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
