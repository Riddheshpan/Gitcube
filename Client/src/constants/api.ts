/**
 * Provider API base URLs — used across the app for direct API calls.
 * No server URL needed anymore; the app talks directly to each provider.
 */

export const GITHUB_API = 'https://api.github.com';
export const GITLAB_API = 'https://gitlab.com/api/v4';
export const JIRA_API = 'https://api.atlassian.com';

/**
 * @deprecated No longer used. The app no longer has a backend server.
 * Kept as a stub to avoid breaking any remaining imports during migration.
 */
export const API_BASE_URL = '';
export const getApiUrl = (path: string): string => {
  console.warn(`[DEPRECATED] getApiUrl called with "${path}" — server has been removed. Update this call to use src/api/ helpers.`);
  return `http://localhost:5000${path}`;
};
