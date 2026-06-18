/**
 * Provider API base URLs — used across the app for direct API calls.
 * No server URL needed anymore; the app talks directly to each provider.
 */

export const GITHUB_API = 'https://api.github.com';
export const GITLAB_API = 'https://gitlab.com/api/v4';
export const JIRA_API = 'https://api.atlassian.com';

// Add your Cloudflare Worker URL here after running `npx wrangler deploy` in the CloudflareWorker directory.
// Make sure it does not end with a trailing slash.
export const AI_PROXY_URL = 'https://gitcube-ai-proxy.ridd.workers.dev';

