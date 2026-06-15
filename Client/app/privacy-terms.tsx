import React, { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';

export default function PrivacyTermsScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>('privacy');

  const bgPage = isDark ? 'bg-[#121212]' : 'bg-[#f4f4f5]';
  const bgCard = isDark ? 'bg-[#1e1e1e]' : 'bg-white';
  const textMain = isDark ? 'text-white' : 'text-black';
  const textSub = isDark ? 'text-gray-400' : 'text-gray-600';
  const borderTheme = isDark ? 'border-yellow-500' : 'border-black';

  return (
    <SafeAreaView className={`flex-1 ${bgPage}`}>
      {/* Top Header - Themed to match GitCube */}
      <View className="bg-[#1e1e1e] dark:bg-yellow-500 px-4 pt-12 pb-4 flex-row items-center justify-between">
        <TouchableOpacity 
          className="flex-row items-center border border-white/30 dark:border-black/30 rounded-lg p-2"
          activeOpacity={0.7}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={20} color={isDark ? "black" : "white"} />
        </TouchableOpacity>
        <Text className="text-white dark:text-black text-lg font-bold">Legal Agreements</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View className="flex-row px-4 mt-6 mb-4">
        <TouchableOpacity 
          className={`flex-1 py-3 items-center rounded-l-xl border-y-2 border-l-2 ${borderTheme} ${
            activeTab === 'privacy' 
              ? 'bg-yellow-500 dark:bg-yellow-500/20' 
              : bgCard
          }`}
          onPress={() => setActiveTab('privacy')}
          activeOpacity={0.8}
        >
          <Text className={`font-black text-sm uppercase tracking-wide ${
            activeTab === 'privacy' 
              ? 'text-black dark:text-yellow-500' 
              : textMain
          }`}>
            Privacy Policy
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          className={`flex-1 py-3 items-center rounded-r-xl border-2 ${borderTheme} ${
            activeTab === 'terms' 
              ? 'bg-yellow-500 dark:bg-yellow-500/20' 
              : bgCard
          }`}
          onPress={() => setActiveTab('terms')}
          activeOpacity={0.8}
        >
          <Text className={`font-black text-sm uppercase tracking-wide ${
            activeTab === 'terms' 
              ? 'text-black dark:text-yellow-500' 
              : textMain
          }`}>
            Terms of Service
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      <ScrollView 
        className="flex-1 px-4 mb-6"
        showsVerticalScrollIndicator={false}
      >
        <View className={`${bgCard} border-2 ${borderTheme} rounded-2xl p-5 shadow-sm`}>
          {activeTab === 'privacy' ? (
            <View>
              <Text className={`${textMain} text-xl font-bold mb-4 border-b border-dashed border-gray-300 dark:border-gray-800 pb-2`}>
                Privacy Policy
              </Text>
              
              <Text className={`${textSub} text-xs mb-4 italic`}>
                Last updated: June 9, 2026
              </Text>

              <Text className={`${textMain} font-bold text-sm mb-1`}>1. Core Commitment</Text>
              <Text className={`${textSub} text-xs mb-4 leading-relaxed`}>
                gitCube bridges your Git repositories and project boards directly. We respect your developer credentials and source code privacy. We do not access, store, or modify your code except to perform tasks requested directly within the app UI.
              </Text>

              <Text className={`${textMain} font-bold text-sm mb-1`}>2. Authentication & Tokens</Text>
              <Text className={`${textSub} text-xs mb-4 leading-relaxed`}>
                Your OAuth tokens for GitHub, GitLab, and Jira are saved securely using local device encryption (SecureStore on iOS and Android) and optionally cached in our secure backend to provide background webhook alerts. Tokens are encrypted at rest and never shared with third parties.
              </Text>

              <Text className={`${textMain} font-bold text-sm mb-1`}>3. AI Summarization Integration</Text>
              <Text className={`${textSub} text-xs mb-4 leading-relaxed`}>
                When using the AI Diff Summarizer or AI Log Analyzer, code diffs or terminal log lines are securely sent to the Hugging Face Inference API using Llama 3.1 model hosts. These snippets are not retained by Hugging Face nor used to train public machine learning models.
              </Text>

              <Text className={`${textMain} font-bold text-sm mb-1`}>4. Usage Metrics & Crashes</Text>
              <Text className={`${textSub} text-xs mb-4 leading-relaxed`}>
                We collect anonymous app performance metrics and crash logs via Sentry to keep gitCube running smoothly. We do not gather repository names, commit contents, or other private developer assets.
              </Text>

              <Text className={`${textMain} font-bold text-sm mb-1`}>5. Your Rights & Contact</Text>
              <Text className={`${textSub} text-xs mb-2 leading-relaxed`}>
                You can delete your accounts and wipe all local tokens at any time using the settings screen. For support or privacy enquiries, contact us at:
              </Text>
              <Text className="text-yellow-600 dark:text-yellow-500 font-semibold text-xs mb-4">
                privacy@gitcube.dev
              </Text>
            </View>
          ) : (
            <View>
              <Text className={`${textMain} text-xl font-bold mb-4 border-b border-dashed border-gray-300 dark:border-gray-800 pb-2`}>
                Terms of Service
              </Text>

              <Text className={`${textSub} text-xs mb-4 italic`}>
                Last updated: June 9, 2026
              </Text>

              <Text className={`${textMain} font-bold text-sm mb-1`}>1. Acceptance of Terms</Text>
              <Text className={`${textSub} text-xs mb-4 leading-relaxed`}>
                By accessing or using gitCube, you agree to comply with and be bound by these Terms of Service. If you do not agree, you must immediately uninstall the app.
              </Text>

              <Text className={`${textMain} font-bold text-sm mb-1`}>2. Third-Party Integrations</Text>
              <Text className={`${textSub} text-xs mb-4 leading-relaxed`}>
                gitCube relies on APIs provided by GitHub, GitLab, and Jira. Your use of gitCube is contingent upon your adherence to those platform developer terms. We are not responsible for API downtime or changes by these platforms.
              </Text>

              <Text className={`${textMain} font-bold text-sm mb-1`}>3. AI-Generated Summaries Disclaimer</Text>
              <Text className={`${textSub} text-xs mb-4 leading-relaxed`}>
                Summaries of code diffs and pipeline logs are generated by AI (Llama 3.1). While we strive for quality, AI output can contain inaccuracies, errors, or hallucinations. You are solely responsible for reviewing all changes before performing merges or deployments.
              </Text>

              <Text className={`${textMain} font-bold text-sm mb-1`}>4. Limitation of Liability</Text>
              <Text className={`${textSub} text-xs mb-4 leading-relaxed`}>
                To the maximum extent permitted by law, gitCube is provided &quot;as is&quot;. In no event shall we be liable for any lost data, merge conflicts, broken pipelines, security breaches, or direct/indirect damages arising from the use of the app.
              </Text>

              <Text className={`${textMain} font-bold text-sm mb-1`}>5. Updates & Modification</Text>
              <Text className={`${textSub} text-xs mb-4 leading-relaxed`}>
                We reserve the right to modify these terms or discontinue any features at any time. Continued use of the app after modifications constitutes acceptance of the new terms.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
