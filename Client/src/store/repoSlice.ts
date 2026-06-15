import { StateCreator } from 'zustand';

export interface Repo {
  id: string;
  name: string;
  fullName: string;
  provider: 'github' | 'gitlab' | 'bitbucket';
  ownerAvatarUrl?: string;
}

export interface RepoSlice {
  selectedRepo: Repo | null;
  repositories: Repo[];
  setSelectedRepo: (repo: Repo | null) => void;
  setRepositories: (repos: Repo[]) => void;
}

export const createRepoSlice: StateCreator<RepoSlice> = (set) => ({
  selectedRepo: null,
  repositories: [],
  setSelectedRepo: (repo) => set({ selectedRepo: repo }),
  setRepositories: (repos) => set({ repositories: repos }),
});
