import React from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { isLoggedIn, getToken } from '../src/api/auth';

export default function IndexScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { code, state } = params;

  // Prevent double-execution if params re-trigger the effect
  const hasRun = React.useRef(false);

  React.useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const checkToken = async () => {
      try {
        // A real OAuth code is always a long alphanumeric string (>= 10 chars).
        // Guard against bare gitcube:// deep links with no or empty code param.
        const isRealOAuthCode = typeof code === 'string' && code.length >= 10;

        if (isRealOAuthCode) {
          // This is a real OAuth redirect callback
          const ghToken = await getToken('github_token');
          const glToken = await getToken('gitlab_token');
          if (ghToken || glToken) {
            // Already logged-in user connecting additional accounts from settings
            router.replace({
              pathname: '/connected-accounts',
              params: { code, state }
            });
          } else {
            // Fresh login via OAuth
            router.replace({
              pathname: '/login',
              params: { code, state }
            });
          }
        } else {
          // Normal startup routing (or bare gitcube:// with no real code)
          const hasSeenWalkthrough = Platform.OS === 'web'
            ? localStorage.getItem('has_seen_walkthrough')
            : await SecureStore.getItemAsync('has_seen_walkthrough');

          if (!hasSeenWalkthrough) {
            router.replace('/walkthrough' as any);
            return;
          }

          const loggedIn = await isLoggedIn();
          if (loggedIn) {
            router.replace('/(tabs)');
          } else {
            router.replace('/login');
          }
        }
      } catch (e) {
        console.error('Error in index routing', e);
        router.replace('/login');
      }
    };
    checkToken();
  }, [code, state]);

  return (
    <View style={{ flex: 1, backgroundColor: '#d4d4d4', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#ca8a04" />
    </View>
  );
}
