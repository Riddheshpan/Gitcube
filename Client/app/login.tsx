import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useAuthRequest } from 'expo-auth-session';
import { Ionicons } from '@expo/vector-icons';
import { exchangeGitHubCode, exchangeGitLabCode, exchangeJiraCode, saveToken, getToken, deleteToken, getRedirectUri } from '../src/api/auth';

WebBrowser.maybeCompleteAuthSession();

// ─── OAuth Discovery Endpoints ──────────────────────────────────────────────
const githubDiscovery = {
  authorizationEndpoint: 'https://github.com/login/oauth/authorize',
  tokenEndpoint: 'https://github.com/login/oauth/access_token',
  revocationEndpoint: 'https://github.com/settings/connections/applications/Ov23liWht4VD2SttzcEP',
};

const gitlabDiscovery = {
  authorizationEndpoint: 'https://gitlab.com/oauth/authorize',
  tokenEndpoint: 'https://gitlab.com/oauth/token',
};

const jiraDiscovery = {
  authorizationEndpoint: 'https://auth.atlassian.com/authorize',
  tokenEndpoint: 'https://auth.atlassian.com/oauth/token',
};

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const urlCode = params.code as string;
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  // Use a ref instead of a module-level variable so it resets if the component remounts
  const isExchangingRef = React.useRef(false);

  // Compute the redirect URI once — must be identical in auth request AND token exchange
  const redirectUri = getRedirectUri();

  // ─── Auth Requests (PKCE) ─────────────────────────────────────────────────
  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: 'Ov23liWht4VD2SttzcEP',
      scopes: ['repo', 'user', 'notifications'],
      redirectUri,
    },
    githubDiscovery
  );

  const [gitlabRequest, gitlabResponse, gitlabPromptAsync] = useAuthRequest(
    {
      clientId: '8240fdae63b13f74a431fff13a25ace9b1cbf5bed830ddee72eb5faf8439d75a',
      scopes: ['read_user', 'email', 'api'],
      redirectUri,
    },
    gitlabDiscovery
  );

  const [jiraRequest, jiraResponse, jiraPromptAsync] = useAuthRequest(
    {
      clientId: 'AJYTtVwvdefv99NFPf4gQ7IlDoS7XXMo',
      scopes: ['read:jira-work', 'read:jira-user', 'offline_access'],
      redirectUri,
      extraParams: { audience: 'api.atlassian.com', prompt: 'consent' },
    },
    jiraDiscovery
  );

  // ─── Auto-login if token already stored ──────────────────────────────────
  React.useEffect(() => {
    const check = async () => {
      try {
        const [gh, gl, jira] = await Promise.all([
          getToken('github_token'),
          getToken('gitlab_token'),
          getToken('jira_token'),
        ]);
        if (gh || gl || jira) router.replace('/(tabs)');
      } catch (_) {}
    };
    check();
  }, []);

  // ─── Handle deep-link code (from app:// redirect) ─────────────────────────
  React.useEffect(() => {
    const handleUrlCode = async () => {
      if (!urlCode || urlCode.length < 10) return;
      try {
        const [gh, gl, jira] = await Promise.all([
          getToken('github_token'),
          getToken('gitlab_token'),
          getToken('jira_token'),
        ]);
        if (gh || gl || jira) { router.replace('/(tabs)'); return; }
        if (isExchangingRef.current) return;
        const provider = await getToken('oauth_provider');
        const codeVerifier = await getToken('oauth_code_verifier') ?? '';
        console.log('[Login] Deep-link code received, provider:', provider, 'code length:', urlCode.length);
        if (provider === 'github') await doExchangeGitHub(urlCode, codeVerifier);
        else if (provider === 'gitlab') await doExchangeGitLab(urlCode, codeVerifier);
        else if (provider === 'jira') await doExchangeJira(urlCode);
        else console.warn('[Login] No oauth_provider stored — cannot exchange code');
        await Promise.all([deleteToken('oauth_provider'), deleteToken('oauth_code_verifier')]);
      } catch (err) {
        console.error('URL code handler error:', err);
        setAuthError((err as Error).message || 'Authentication failed');
      }
    };
    handleUrlCode();
  }, [urlCode]);

  // ─── PKCE response handlers ───────────────────────────────────────────────
  React.useEffect(() => {
    if (response?.type === 'success' && request?.codeVerifier) {
      doExchangeGitHub(response.params.code, request.codeVerifier);
    } else if (response?.type === 'error') {
      console.error('[Login] GitHub auth error:', response.error);
      setAuthError(response.error?.message || 'GitHub authorization failed');
    }
  }, [response]);

  React.useEffect(() => {
    if (gitlabResponse?.type === 'success' && gitlabRequest?.codeVerifier) {
      doExchangeGitLab(gitlabResponse.params.code, gitlabRequest.codeVerifier);
    } else if (gitlabResponse?.type === 'error') {
      console.error('[Login] GitLab auth error:', gitlabResponse.error);
      setAuthError(gitlabResponse.error?.message || 'GitLab authorization failed');
    }
  }, [gitlabResponse]);

  React.useEffect(() => {
    if (jiraResponse?.type === 'success') {
      doExchangeJira(jiraResponse.params.code);
    } else if (jiraResponse?.type === 'error') {
      console.error('[Login] Jira auth error:', jiraResponse.error);
      setAuthError(jiraResponse.error?.message || 'Jira authorization failed');
    }
  }, [jiraResponse]);

  // ─── Exchange Functions (direct — no server) ──────────────────────────────

  const doExchangeGitHub = async (code: string, codeVerifier: string) => {
    if (isExchangingRef.current) return;
    isExchangingRef.current = true;
    setLoading(true);
    setAuthError('');
    try {
      const { accessToken, username } = await exchangeGitHubCode(code, codeVerifier);
      await saveToken('github_token', accessToken);
      await saveToken('username', username);
      router.replace('/(tabs)');
    } catch (err) {
      console.error('[Login] GitHub exchange failed:', err);
      setAuthError((err as Error).message || 'GitHub login failed');
    } finally {
      setLoading(false);
      isExchangingRef.current = false;
    }
  };

  const doExchangeGitLab = async (code: string, codeVerifier: string) => {
    if (isExchangingRef.current) return;
    isExchangingRef.current = true;
    setLoading(true);
    setAuthError('');
    try {
      const { accessToken, username } = await exchangeGitLabCode(code, codeVerifier);
      await saveToken('gitlab_token', accessToken);
      await saveToken('username', username);
      router.replace('/(tabs)');
    } catch (err) {
      console.error('[Login] GitLab exchange failed:', err);
      setAuthError((err as Error).message || 'GitLab login failed');
    } finally {
      setLoading(false);
      isExchangingRef.current = false;
    }
  };

  const doExchangeJira = async (code: string) => {
    if (isExchangingRef.current) return;
    isExchangingRef.current = true;
    setLoading(true);
    setAuthError('');
    try {
      const { accessToken } = await exchangeJiraCode(code);
      await saveToken('jira_token', accessToken);
      await saveToken('username', 'Jira User');
      router.replace('/(tabs)');
    } catch (err) {
      console.error('[Login] Jira exchange failed:', err);
      setAuthError((err as Error).message || 'Jira login failed');
    } finally {
      setLoading(false);
      isExchangingRef.current = false;
    }
  };

  // ─── Button Handlers ──────────────────────────────────────────────────────

  const handleGithubLogin = async () => {
    try {
      await saveToken('oauth_provider', 'github');
      if (request?.codeVerifier) await saveToken('oauth_code_verifier', request.codeVerifier);
      promptAsync();
    } catch (e) { console.error(e); }
  };

  const handleGitlabLogin = async () => {
    try {
      await saveToken('oauth_provider', 'gitlab');
      if (gitlabRequest?.codeVerifier) await saveToken('oauth_code_verifier', gitlabRequest.codeVerifier);
      gitlabPromptAsync();
    } catch (e) { console.error(e); }
  };

  const handleJiraLogin = async () => {
    try {
      await saveToken('oauth_provider', 'jira');
      jiraPromptAsync();
    } catch (e) { console.error(e); }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#d4d4d4]"
    >
      <StatusBar style="dark" />

      {/* Yellow Top Bar */}
      <View className="bg-[#fbbf24] pt-16 pb-8 px-6 rounded-b-lg shadow-sm">
        <Text className="text-black text-3xl font-semibold tracking-tight">gitCube</Text>
        <Text className="text-black/60 text-sm mt-1">Connect your dev tools</Text>
      </View>

      {/* Main Content Area */}
      <View className="flex-1 items-center justify-center px-6">

        <View className="w-full bg-[#eeeeee] p-8 rounded-[32px] shadow-sm">

          {/* Error Message */}
          {authError ? (
            <View className="mb-4 bg-red-100 border border-red-400 rounded-lg p-3">
              <Text className="text-red-700 text-sm text-center font-medium">{authError}</Text>
            </View>
          ) : null}

          <View className="items-center">

            {/* Loading indicator */}
            {loading && (
              <View className="mb-4 flex-row items-center">
                <ActivityIndicator color="#ca8a04" style={{ marginRight: 8 }} />
                <Text className="text-gray-600 text-sm">Connecting…</Text>
              </View>
            )}

            {/* GitHub */}
            <TouchableOpacity
              className="bg-white border-2 border-black px-8 py-3.5 rounded-xl shadow-sm w-full flex-row justify-center items-center mb-3"
              onPress={handleGithubLogin}
              activeOpacity={0.8}
              disabled={!request || loading}
            >
              <Ionicons name="logo-github" size={20} color="black" style={{ marginRight: 8 }} />
              <Text className="text-black font-bold text-lg">
                {loading ? 'Connecting…' : 'Continue with GitHub'}
              </Text>
            </TouchableOpacity>

            {/* GitLab */}
            <TouchableOpacity
              className="bg-[#e24329] px-8 py-3.5 rounded-xl shadow-sm w-full flex-row justify-center items-center mb-3"
              onPress={handleGitlabLogin}
              activeOpacity={0.8}
              disabled={!gitlabRequest || loading}
            >
              <Ionicons name="logo-gitlab" size={20} color="white" style={{ marginRight: 8 }} />
              <Text className="text-white font-bold text-lg">
                {loading ? 'Connecting…' : 'Continue with GitLab'}
              </Text>
            </TouchableOpacity>

            {/* Jira */}
            <TouchableOpacity
              className="bg-[#0052cc] px-8 py-3.5 rounded-xl shadow-sm w-full flex-row justify-center items-center"
              onPress={handleJiraLogin}
              activeOpacity={0.8}
              disabled={!jiraRequest || loading}
            >
              <Ionicons name="layers" size={20} color="white" style={{ marginRight: 8 }} />
              <Text className="text-white font-bold text-lg">
                {loading ? 'Connecting…' : 'Continue with Jira'}
              </Text>
            </TouchableOpacity>

          </View>

          <Text className="text-center text-gray-400 text-xs mt-6">
            By continuing, you agree to our Terms of Service.{'\n'}
            Your tokens are stored securely on this device only.
          </Text>

        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
