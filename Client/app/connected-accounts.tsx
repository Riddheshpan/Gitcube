import React from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, ScrollView, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { makeRedirectUri, useAuthRequest } from 'expo-auth-session';
import { Platform } from 'react-native';
import { exchangeGitHubCode, exchangeGitLabCode, exchangeJiraCode, getToken, saveToken, deleteToken } from '../src/api/auth';

let globalIsExchanging = false;

export default function ConnectedAccountsScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const params = useLocalSearchParams();
  const urlCode = params.code as string;
  const [githubConnected, setGithubConnected] = React.useState(false);
  const [gitlabConnected, setGitlabConnected] = React.useState(false);
  const [jiraConnected, setJiraConnected] = React.useState(false);
  const [trelloConnected, setTrelloConnected] = React.useState(false);

  // Trello Connection States
  const [showTrelloModal, setShowTrelloModal] = React.useState(false);
  const [trelloApiKey, setTrelloApiKey] = React.useState('');
  const [trelloToken, setTrelloToken] = React.useState('');
  const [trelloConnecting, setTrelloConnecting] = React.useState(false);

  const discovery = {
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

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: 'Ov23liWht4VD2SttzcEP',
      scopes: ['repo', 'user'],
      redirectUri: makeRedirectUri({
        scheme: 'gitcube',
        path: ''
      }),
    },
    discovery
  );

  const [gitlabRequest, gitlabResponse, gitlabPromptAsync] = useAuthRequest(
    {
      clientId: '8240fdae63b13f74a431fff13a25ace9b1cbf5bed830ddee72eb5faf8439d75a',
      scopes: ['read_user', 'email'],
      redirectUri: makeRedirectUri({
        scheme: 'gitcube',
        path: ''
      }),
    },
    gitlabDiscovery
  );

  const [jiraRequest, jiraResponse, jiraPromptAsync] = useAuthRequest(
    {
      clientId: 'AJYTtVwvdefv99NFPf4gQ7IlDoS7XXMo',
      scopes: ['read:jira-work', 'read:jira-user', 'offline_access'],
      redirectUri: makeRedirectUri({
        scheme: 'gitcube',
        path: ''
      }),
      extraParams: {
        audience: 'api.atlassian.com',
        prompt: 'consent'
      }
    },
    jiraDiscovery
  );

  React.useEffect(() => {
    // Check initial connection status from local storage
    const checkConnections = async () => {
      try {
        const gh = await getToken('github_token');
        const gl = await getToken('gitlab_token');
        const ji = await getToken('jira_token');
        const tr = await getToken('trello_token');
        
        setGithubConnected(!!gh);
        setGitlabConnected(!!gl);
        setJiraConnected(!!ji);
        setTrelloConnected(!!tr);
      } catch (e) {
        console.error('Error fetching connections status', e);
      }
    };
    checkConnections();
  }, []);

  React.useEffect(() => {
    const handleUrlCode = async () => {
      if (urlCode) {
        try {
          if (globalIsExchanging) return;

          const provider = Platform.OS === 'web'
            ? localStorage.getItem('oauth_provider')
            : await SecureStore.getItemAsync('oauth_provider');
            
          const codeVerifier = Platform.OS === 'web'
            ? localStorage.getItem('oauth_code_verifier')
            : await SecureStore.getItemAsync('oauth_code_verifier');
             
          if (provider === 'github') {
            exchangeCode(urlCode, codeVerifier || '');
          } else if (provider === 'gitlab') {
            exchangeGitLabCodeLocal(urlCode, codeVerifier || '');
          } else if (provider === 'jira') {
            exchangeJiraCodeLocal(urlCode, codeVerifier || '');
          }
          
          // Clean up
          if (Platform.OS === 'web') {
            localStorage.removeItem('oauth_provider');
            localStorage.removeItem('oauth_code_verifier');
          } else {
            await SecureStore.deleteItemAsync('oauth_provider');
            await SecureStore.deleteItemAsync('oauth_code_verifier');
          }
        } catch (err) {
          console.error('Error processing URL redirect code in settings:', err);
        }
      }
    };
    handleUrlCode();
  }, [urlCode]);

  React.useEffect(() => {
    if (response?.type === 'success' && request?.codeVerifier) {
      const { code } = response.params;
      exchangeCode(code, request.codeVerifier);
    }
  }, [response, request]);

  React.useEffect(() => {
    if (gitlabResponse?.type === 'success' && gitlabRequest?.codeVerifier) {
      const { code } = gitlabResponse.params;
      exchangeGitLabCodeLocal(code, gitlabRequest.codeVerifier);
    }
  }, [gitlabResponse, gitlabRequest]);

  React.useEffect(() => {
    if (jiraResponse?.type === 'success' && jiraRequest?.codeVerifier) {
      const { code } = jiraResponse.params;
      exchangeJiraCodeLocal(code, jiraRequest.codeVerifier);
    }
  }, [jiraResponse, jiraRequest]);

  const disconnectBackendConnection = async (provider: 'github' | 'gitlab' | 'jira' | 'trello') => {
    // Standalone app: Just delete local token
    await deleteToken(`${provider}_token`);
  };

  const exchangeCode = async (code: string, codeVerifier: string) => {
    if (globalIsExchanging) return;
    globalIsExchanging = true;
    try {
      const { accessToken } = await exchangeGitHubCode(code, codeVerifier);
      await saveToken('github_token', accessToken);
      setGithubConnected(true);
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error exchanging code:', error);
    } finally {
      globalIsExchanging = false;
    }
  };

  const exchangeGitLabCodeLocal = async (code: string, codeVerifier: string) => {
    if (globalIsExchanging) return;
    globalIsExchanging = true;
    try {
      const { accessToken } = await exchangeGitLabCode(code, codeVerifier);
      await saveToken('gitlab_token', accessToken);
      setGitlabConnected(true);
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error exchanging GitLab code:', error);
    } finally {
      globalIsExchanging = false;
    }
  };

  const exchangeJiraCodeLocal = async (code: string, codeVerifier: string) => {
    if (globalIsExchanging) return;
    globalIsExchanging = true;
    try {
      const { accessToken } = await exchangeJiraCode(code, codeVerifier);
      await saveToken('jira_token', accessToken);
      setJiraConnected(true);
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error exchanging Jira code:', error);
    } finally {
      globalIsExchanging = false;
    }
  };
  const handleConnectTrello = async () => {
    if (!trelloApiKey || !trelloToken) {
      if (Platform.OS === 'web') {
        alert('API Key and Token are required');
      } else {
        Alert.alert('Error', 'API Key and Token are required');
      }
      return;
    }

    setTrelloConnecting(true);
    try {
      await saveToken('trello_api_key', trelloApiKey);
      await saveToken('trello_token', trelloToken);
      
      setTrelloConnected(true);
      setShowTrelloModal(false);
      setTrelloApiKey('');
      setTrelloToken('');
    } catch (e: any) {
      console.error('Trello connect error:', e);
      if (Platform.OS === 'web') {
        alert(e.message);
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setTrelloConnecting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#121212]">
      {/* Top Bar */}
      <View className="bg-[#1e1e1e] dark:bg-yellow-500 px-4 pt-12 pb-4 flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center">
          <Ionicons name="chevron-back" size={24} color={isDark ? "black" : "white"} />
          <Text className="text-white dark:text-black font-semibold text-lg ml-1">Settings</Text>
        </TouchableOpacity>
        <Text className="text-white dark:text-black font-bold text-lg">Connected Accounts</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        className="flex-1 px-4 mt-6"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* GitHub Account */}
        <View className="bg-white dark:bg-[#1e1e1e] border-2 border-black dark:border-gray-700 rounded-2xl p-4 flex-row justify-between items-center shadow-sm mb-4">
          <View className="flex-row items-center">
            <View className="bg-gray-100 dark:bg-gray-800 w-10 h-10 rounded-full items-center justify-center mr-3">
              <Ionicons name="logo-github" size={24} color={isDark ? "white" : "black"} />
            </View>
            <View>
              <Text className="font-bold text-black dark:text-white text-base">GitHub</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                {githubConnected ? 'Connected' : 'Not connected'}
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            className={`px-4 py-2 rounded-full ${githubConnected ? 'bg-red-500' : 'bg-black dark:bg-yellow-500'}`}
            onPress={async () => {
              if (githubConnected) {
                await disconnectBackendConnection('github');
                setGithubConnected(false);
                // Only redirect to login if no other account is connected
                if (!gitlabConnected && !jiraConnected) {
                  router.replace('/login');
                }
              } else {
                try {
                  if (Platform.OS === 'web') {
                    localStorage.setItem('oauth_provider', 'github');
                    if (request?.codeVerifier) {
                      localStorage.setItem('oauth_code_verifier', request.codeVerifier);
                    }
                  } else {
                    await SecureStore.setItemAsync('oauth_provider', 'github');
                    if (request?.codeVerifier) {
                      await SecureStore.setItemAsync('oauth_code_verifier', request.codeVerifier);
                    }
                  }
                  promptAsync();
                } catch (e) {
                  console.error(e);
                }
              }
            }}
            disabled={!request && !githubConnected}
          >
            <Text className="text-white dark:text-black font-bold text-xs">
              {githubConnected ? 'Log Out' : 'Connect'}
            </Text>
          </TouchableOpacity>
        </View>
 
        {/* GitLab Account */}
        <View className="bg-white dark:bg-[#1e1e1e] border-2 border-black dark:border-gray-700 rounded-2xl p-4 flex-row justify-between items-center shadow-sm mb-4">
          <View className="flex-row items-center">
            <View className="bg-orange-100 dark:bg-orange-500/20 w-10 h-10 rounded-full items-center justify-center mr-3">
              <Ionicons name="logo-gitlab" size={24} color="#f97316" />
            </View>
            <View>
              <Text className="font-bold text-black dark:text-white text-base">GitLab</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                {gitlabConnected ? 'Connected' : 'Not connected'}
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            className={`px-4 py-2 rounded-full ${gitlabConnected ? 'bg-red-500' : 'bg-black dark:bg-yellow-500'}`}
            onPress={async () => {
              if (gitlabConnected) {
                await disconnectBackendConnection('gitlab');
                setGitlabConnected(false);
                // Only redirect to login if no other account is connected
                if (!githubConnected && !jiraConnected) {
                  router.replace('/login');
                }
              } else {
                try {
                  if (Platform.OS === 'web') {
                    localStorage.setItem('oauth_provider', 'gitlab');
                    if (gitlabRequest?.codeVerifier) {
                      localStorage.setItem('oauth_code_verifier', gitlabRequest.codeVerifier);
                    }
                  } else {
                    await SecureStore.setItemAsync('oauth_provider', 'gitlab');
                    if (gitlabRequest?.codeVerifier) {
                      await SecureStore.setItemAsync('oauth_code_verifier', gitlabRequest.codeVerifier);
                    }
                  }
                  gitlabPromptAsync();
                } catch (e) {
                  console.error(e);
                }
              }
            }}
            disabled={!gitlabRequest && !gitlabConnected}
          >
            <Text className="text-white dark:text-black font-bold text-xs">
              {gitlabConnected ? 'Log Out' : 'Connect'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Jira Account */}
        <View className="bg-white dark:bg-[#1e1e1e] border-2 border-black dark:border-gray-700 rounded-2xl p-4 flex-row justify-between items-center shadow-sm mb-4">
          <View className="flex-row items-center">
            <View className="bg-blue-100 dark:bg-blue-500/20 w-10 h-10 rounded-full items-center justify-center mr-3">
              <Ionicons name="layers" size={24} color="#3b82f6" />
            </View>
            <View>
              <Text className="font-bold text-black dark:text-white text-base">Jira</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                {jiraConnected ? 'Connected' : 'Not connected'}
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            className={`px-4 py-2 rounded-full ${jiraConnected ? 'bg-red-500' : 'bg-black dark:bg-yellow-500'}`}
            onPress={async () => {
              if (jiraConnected) {
                await disconnectBackendConnection('jira');
                setJiraConnected(false);
                if (!githubConnected && !gitlabConnected && !trelloConnected) {
                  router.replace('/login');
                }
              } else {
                try {
                  if (Platform.OS === 'web') {
                    localStorage.setItem('oauth_provider', 'jira');
                    if (jiraRequest?.codeVerifier) {
                      localStorage.setItem('oauth_code_verifier', jiraRequest.codeVerifier);
                    }
                  } else {
                    await SecureStore.setItemAsync('oauth_provider', 'jira');
                    if (jiraRequest?.codeVerifier) {
                      await SecureStore.setItemAsync('oauth_code_verifier', jiraRequest.codeVerifier);
                    }
                  }
                  jiraPromptAsync();
                } catch (e) {
                  console.error(e);
                }
              }
            }}
            disabled={!jiraRequest && !jiraConnected}
          >
            <Text className="text-white dark:text-black font-bold text-xs">
              {jiraConnected ? 'Log Out' : 'Connect'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Trello Account */}
        <View className="bg-white dark:bg-[#1e1e1e] border-2 border-black dark:border-gray-700 rounded-2xl p-4 flex-row justify-between items-center shadow-sm mb-4">
          <View className="flex-row items-center">
            <View className="bg-cyan-100 dark:bg-cyan-500/20 w-10 h-10 rounded-full items-center justify-center mr-3">
              <Ionicons name="apps-outline" size={24} color="#00aecc" />
            </View>
            <View>
              <Text className="font-bold text-black dark:text-white text-base">Trello</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                {trelloConnected ? 'Connected' : 'Not connected'}
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            className={`px-4 py-2 rounded-full ${trelloConnected ? 'bg-red-500' : 'bg-black dark:bg-yellow-500'}`}
            onPress={async () => {
              if (trelloConnected) {
                await disconnectBackendConnection('trello');
                setTrelloConnected(false);
                if (!githubConnected && !gitlabConnected && !jiraConnected) {
                  router.replace('/login');
                }
              } else {
                setShowTrelloModal(true);
              }
            }}
          >
            <Text className="text-white dark:text-black font-bold text-xs">
              {trelloConnected ? 'Log Out' : 'Connect'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Trello Credentials Modal */}
      <Modal
        visible={showTrelloModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowTrelloModal(false)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center px-6">
          <View className="bg-white dark:bg-[#1a1a1a] w-full max-w-[340px] rounded-3xl p-6 border-2 border-black/10 shadow-lg">
            <Text className="text-black dark:text-white font-extrabold text-lg mb-2">Connect Trello</Text>
            <Text className="text-gray-500 dark:text-gray-400 text-xs mb-4">
              Enter your Trello Developer API Key and User Token to link your boards.
            </Text>

            <Text className="text-black dark:text-white font-semibold text-xs mb-1">Developer API Key</Text>
            <TextInput
              className="border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-black text-black dark:text-white mb-3 text-sm"
              placeholder="API Key"
              placeholderTextColor="#888"
              value={trelloApiKey}
              onChangeText={setTrelloApiKey}
            />

            <Text className="text-black dark:text-white font-semibold text-xs mb-1">User Token</Text>
            <TextInput
              className="border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-black text-black dark:text-white mb-4 text-sm"
              placeholder="User Token"
              placeholderTextColor="#888"
              secureTextEntry
              value={trelloToken}
              onChangeText={setTrelloToken}
            />

            <View className="flex-row gap-2">
              <TouchableOpacity
                className="flex-1 border border-gray-300 dark:border-gray-700 rounded-xl py-3 items-center"
                onPress={() => {
                  setShowTrelloModal(false);
                  setTrelloApiKey('');
                  setTrelloToken('');
                }}
              >
                <Text className="text-gray-500 dark:text-gray-400 font-bold text-sm">Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                className="flex-1 bg-yellow-500 rounded-xl py-3 items-center justify-center"
                onPress={handleConnectTrello}
                disabled={trelloConnecting}
              >
                {trelloConnecting ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text className="text-black font-bold text-sm">Connect</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
