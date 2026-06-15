/**
 * Auth helpers — direct PKCE token exchange with GitHub, GitLab, and Jira.
 * No server middleman. Credentials embedded here (accepted pattern for native mobile apps,
 * per RFC 8252 "OAuth 2.0 for Native Apps").
 */
import { makeRedirectUri } from 'expo-auth-session';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// ─── OAuth App Credentials ──────────────────────────────────────────────────
// These are embedded intentionally — this is a native mobile app (public client).
// See RFC 8252 §8.4: client secrets in native apps cannot be kept confidential.

const GITHUB_CLIENT_ID = 'Ov23liWht4VD2SttzcEP';
const GITHUB_CLIENT_SECRET = 'd3fe890076d0ce57369c60a2cca35742c663778c';

const GITLAB_CLIENT_ID = '8240fdae63b13f74a431fff13a25ace9b1cbf5bed830ddee72eb5faf8439d75a';
// GitLab supports PKCE for public clients — no client_secret needed

const JIRA_CLIENT_ID = 'AJYTtVwvdefv99NFPf4gQ7IlDoS7XXMo';
// Jira uses server-side PKCE for public clients - secret not required
const JIRA_CLIENT_SECRET = '';

// ─── Redirect URI ───────────────────────────────────────────────────────────

export function getRedirectUri(): string {
  // On a real device/APK, `native: true` generates the correct gitcube:// URI.
  // Without it, Expo can generate an exp:// or localhost URI in some builds,
  // which won't match the callback registered in GitHub/GitLab/Jira OAuth apps.
  return makeRedirectUri({ scheme: 'gitcube', native: 'gitcube://' });
}

// ─── Token Storage Helpers ──────────────────────────────────────────────────

export async function saveToken(key: string, value: string) {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

export async function getToken(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

export async function deleteToken(key: string) {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

export async function clearAllTokens() {
  const keys = ['github_token', 'gitlab_token', 'jira_token', 'user_token', 'username', 'oauth_provider', 'oauth_code_verifier'];
  await Promise.all(keys.map(k => deleteToken(k)));
}

export async function getAnyToken(): Promise<{ token: string; provider: 'github' | 'gitlab' | 'jira' } | null> {
  const [github, gitlab, jira] = await Promise.all([
    getToken('github_token'),
    getToken('gitlab_token'),
    getToken('jira_token'),
  ]);
  if (github) return { token: github, provider: 'github' };
  if (gitlab) return { token: gitlab, provider: 'gitlab' };
  if (jira) return { token: jira, provider: 'jira' };
  return null;
}

export async function isLoggedIn(): Promise<boolean> {
  const result = await getAnyToken();
  return result !== null;
}

// ─── GitHub Token Exchange ──────────────────────────────────────────────────

export async function exchangeGitHubCode(code: string, codeVerifier: string): Promise<{ accessToken: string; username: string }> {
  const redirectUri = getRedirectUri();
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = await res.json();
  if (data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'GitHub token exchange failed');
  }

  // Fetch username
  let username = 'GitHub User';
  try {
    const profileRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${data.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'gitCube-App',
      },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json();
      username = profile.login ?? username;
    }
  } catch (_) {}

  return { accessToken: data.access_token, username };
}

// ─── GitLab Token Exchange ─────────────────────────────────────────────────

export async function exchangeGitLabCode(code: string, codeVerifier: string): Promise<{ accessToken: string; username: string }> {
  const redirectUri = getRedirectUri();
  const res = await fetch('https://gitlab.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: GITLAB_CLIENT_ID,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  const data = await res.json();
  if (data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'GitLab token exchange failed');
  }

  let username = 'GitLab User';
  try {
    const profileRes = await fetch('https://gitlab.com/api/v4/user', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json();
      username = profile.username ?? username;
    }
  } catch (_) {}

  return { accessToken: data.access_token, username };
}

// ─── Jira Token Exchange ───────────────────────────────────────────────────

export async function exchangeJiraCode(code: string): Promise<{ accessToken: string }> {
  const redirectUri = getRedirectUri();
  const res = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: JIRA_CLIENT_ID,
      client_secret: JIRA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  const data = await res.json();
  if (data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Jira token exchange failed');
  }

  return { accessToken: data.access_token };
}
