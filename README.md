# gitCube 🧊

**gitCube** is a powerful, cross-platform mobile application that centralizes your developer workspace. Connect your favorite version control and project management tools, manage pull requests, track CI/CD pipelines, and review project health metrics straight from your mobile device.

## ✨ Key Features

- **Centralized Dashboard**: Track open Pull Requests, CI/CD run statuses, and Kanban board cards all in one place.
- **Multi-Provider Support**: Seamlessly connect your **GitHub**, **GitLab**, and **Jira** accounts using secure OAuth integration.
- **AI-Powered PR Summaries**: Automatically generate concise summaries of Pull Request code diffs using a Cloudflare AI proxy (powered by Llama 3.1).
- **Native Quick Actions**: Easily **Approve**, **Merge**, or **Re-run pipelines** directly from the notifications feed or PR detail view.
- **Dark Mode Support**: Beautifully crafted UI utilizing NativeWind (TailwindCSS) with comprehensive light/dark themes.
- **Real-Time Polling**: Your dashboard stats are always up to date.

## 🛠 Tech Stack

- **Framework**: [React Native](https://reactnative.dev/) & [Expo](https://expo.dev/) (Expo Router for navigation)
- **Styling**: [NativeWind](https://www.nativewind.dev/) (Tailwind CSS for React Native)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Secure Storage**: Expo SecureStore
- **API Interactions**: Direct REST API calls to GitHub/GitLab endpoints to ensure speed and low latency.
- **Backend/AI Proxy**: Custom Cloudflare Worker acting as an AI proxy to securely pass prompt diffs to Llama 3.1.

## 📦 Folder Structure

- `/Client/` - The main Expo React Native application.
- `/CloudflareWorker/` - Serverless worker that proxies requests to Cloudflare AI for the PR diff summarization feature.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Expo CLI
- An Expo Go app on your physical device, or an iOS/Android emulator.

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/gitCube.git
   cd gitCube/Client
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run start
   ```

4. **Run on a device**:
   - Press `i` to open an iOS simulator.
   - Press `a` to open an Android emulator.
   - Or scan the QR code using the Expo Go app on your phone.

### Setting up the AI Proxy
To get AI PR summaries working, navigate to `/CloudflareWorker`, setup your Cloudflare configuration (Wrangler), provide your AI binding, and deploy the worker. Then point your client app to the deployed worker URL.

## 🔒 Security
- **Secure Token Storage**: Authentication tokens are stored securely on your device using `expo-secure-store`.
- **Direct API Calls**: Aside from AI summarization, interactions with GitHub and GitLab occur directly between your device and the provider's API, meaning your tokens never touch our servers.

## 📝 Release Notes
For the latest updates, please check the built-in release notes directly inside the gitCube dashboard application.
