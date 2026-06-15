import React from 'react';
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

import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getApiUrl } from '../src/constants/api';

// Handle foreground notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotificationsAsync() {
  if ((Platform.OS as string) === 'web') return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for push notifications!');
    return null;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('[Notifications] No EAS projectId found. Skipping push notification token registration.');
      return null;
    }
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId
    });
    return tokenData.data;
  } catch (error) {
    console.error('Error getting Expo push token:', error);
    return null;
  }
}

// Initialize Sentry
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
  tracesSampleRate: 1.0,
});

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayout() {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  React.useEffect(() => {
    async function setupNotifications() {
      if ((Platform.OS as string) === 'web') return;
      
      const token = await registerForPushNotificationsAsync();
      if (!token) return;
      
      console.log('[Layout] Expo Push Token obtained:', token);
      
      const userToken = (Platform.OS as string) === 'web'
        ? localStorage.getItem('user_token')
        : await SecureStore.getItemAsync('user_token');
        
      if (userToken) {
        try {
          const res = await fetch(getApiUrl('/api/user/push-token'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({ token })
          });
          if (res.ok) {
            console.log('[Layout] Registered push token with backend successfully');
          } else {
            console.warn('[Layout] Failed to register push token with backend:', res.status);
          }
        } catch (err) {
          console.error('[Layout] Failed to send push token to backend:', err);
        }
      }
    }
    setupNotifications();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <PaperProvider theme={theme}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack initialRouteName="index">
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="signup" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="connected-accounts" options={{ headerShown: false }} />
            <Stack.Screen name="ticket-detail" options={{ headerShown: false }} />
            <Stack.Screen name="profile" options={{ headerShown: false }} />
            <Stack.Screen name="privacy-terms" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </PaperProvider>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
