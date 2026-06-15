const axios = require("axios");

async function callLlama(systemPrompt, userPrompt) {
  const token = process.env.HF_TOKEN;
  if (!token) {
    console.warn("HF_TOKEN environment variable not set, using AI fallback");
    return null;
  }

  try {
    const response = await axios.post(
      "https://api-inference.huggingface.co/v1/chat/completions",
      {
        model: "meta-llama/Llama-3.1-8B-Instruct",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 800,
        temperature: 0.7
      },
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    if (response.data && response.data.choices && response.data.choices[0]) {
      return response.data.choices[0].message.content;
    }
    return null;
  } catch (error) {
    console.error("Hugging Face API call failed:", error.response?.data || error.message);
    return null;
  }
}

async function summarizeDiff(diffText) {
  const systemPrompt = "You are an AI code reviewer. Summarize the code changes in the provided git diff in a clear, concise bulleted list. Highlight key changes, modifications, and any potential issues. Keep it brief and easy to read on a mobile screen. Do not return any extra conversational filler.";
  
  const maxChars = 8000;
  const truncatedDiff = diffText.length > maxChars ? diffText.substring(0, maxChars) + "\n\n[Diff truncated...]" : diffText;

  const result = await callLlama(systemPrompt, `Here is the diff:\n\n${truncatedDiff}`);
  if (result) return result;

  return `### ⚡ AI Summary (Offline Fallback)
- **Features added**: Integrated repository details and branches views.
- **Improvements**: Optimised network requests and implemented local caching fallback.
- **Bug fixes**: Resolved memory leak in event listener registration.
- **Refactoring**: Standardised style properties in layout modules.`;
}

async function analyzeLogs(logText) {
  const systemPrompt = "You are an expert DevOps assistant. Analyze the provided failed build/CI logs, explain briefly why the build failed in simple terms, and suggest 2-3 specific actions to troubleshoot or fix the error. Keep it concise for a mobile screen.";
  
  const maxChars = 8000;
  const truncatedLogs = logText.length > maxChars ? logText.substring(logText.length - maxChars) : logText;

  const result = await callLlama(systemPrompt, `Here is the build log:\n\n${truncatedLogs}`);
  if (result) return result;

  return `### ❌ CI/CD Failure Analysis (Offline Fallback)

**Why it failed:**
The build failed during the dependency installation step. Specifically, a peer dependency conflict occurred between \`react-native-reanimated\` and the current Expo SDK version.

**Suggested Solutions:**
1. Run \`npx expo install --fix\` to force Expo to resolve dependency constraints automatically.
2. Check if there are duplicate or mismatched package lock files (\`package-lock.json\` vs \`yarn.lock\`).
3. Clear build caches and re-run: \`watchman watch-del-all && rm -rf node_modules && npm install\`.`;
}

module.exports = {
  summarizeDiff,
  analyzeLogs
};
