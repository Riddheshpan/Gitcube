import React, { useState, useEffect } from 'react';
import * as Sentry from '@sentry/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';

import { useColorScheme } from 'nativewind';
import { queryClient } from '../src/api/queryClient';
import { lightTheme, darkTheme } from '../src/theme';

import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform, View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';


// Initialize Sentry
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
  tracesSampleRate: 1.0,
});

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayout() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    async function initSettings() {
      // 1. Check biometrics
      if (Platform.OS === 'web') {
        setIsAuthenticated(true);
        setIsCheckingAuth(false);
      } else {
        try {
          const biometricsSaved = await SecureStore.getItemAsync('biometrics_enabled');
          if (biometricsSaved !== 'true') {
            setIsAuthenticated(true);
            setIsCheckingAuth(false);
          } else {
            const result = await LocalAuthentication.authenticateAsync({
              promptMessage: 'Unlock gitCube',
              fallbackLabel: 'Use Passcode',
            });
            if (result.success) {
              setIsAuthenticated(true);
            }
          }
        } catch (e) {
          console.warn('Biometric check failed', e);
        } finally {
          setIsCheckingAuth(false);
        }
      }

      // 2. Load Theme
      try {
        const savedTheme = Platform.OS === 'web' 
          ? localStorage.getItem('app_theme')
          : await SecureStore.getItemAsync('app_theme');
        if (savedTheme === 'dark' || savedTheme === 'light') {
          setColorScheme(savedTheme);
        }
      } catch (e) {
        console.warn('Theme load failed', e);
      }
    }

    initSettings();
  }, []);

  if (isCheckingAuth) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colorScheme === 'dark' ? '#121212' : '#f4f4f5' }}>
        <ActivityIndicator size="large" color="#eab308" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colorScheme === 'dark' ? '#121212' : '#f4f4f5' }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#eab308', justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
          <Text style={{ fontSize: 40 }}>🔒</Text>
        </View>
        <Text style={{ color: colorScheme === 'dark' ? '#fff' : '#000', marginBottom: 30, fontSize: 24, fontWeight: '900', letterSpacing: -1 }}>App Locked</Text>
        <TouchableOpacity 
          style={{ backgroundColor: '#eab308', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 }}
          onPress={() => {
            LocalAuthentication.authenticateAsync({
              promptMessage: 'Unlock gitCube',
              fallbackLabel: 'Use Passcode',
            }).then(res => {
              if (res.success) setIsAuthenticated(true);
            });
          }}
        >
          <Text style={{ color: '#000', fontWeight: '900', fontSize: 16 }}>Tap to Unlock</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <PaperProvider theme={theme}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack initialRouteName="index">
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="walkthrough" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="signup" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="connected-accounts" options={{ headerShown: false }} />
            <Stack.Screen name="ticket-detail" options={{ headerShown: false }} />
            <Stack.Screen name="profile" options={{ headerShown: false }} />
            <Stack.Screen name="privacy-terms" options={{ headerShown: false }} />

          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </PaperProvider>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
