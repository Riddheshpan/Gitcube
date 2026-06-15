import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { createAuthSlice, AuthSlice } from './authSlice';
import { createRepoSlice, RepoSlice } from './repoSlice';
import { createBoardSlice, BoardSlice } from './boardSlice';

type StoreState = AuthSlice & RepoSlice & BoardSlice;

export const useBoundStore = create<StoreState>()((...a) => ({
  ...createAuthSlice(...a),
  ...createRepoSlice(...a),
  ...createBoardSlice(...a),
}));

export const useAuth = () => useBoundStore(useShallow((state) => ({
  isAuthenticated: state.isAuthenticated,
  token: state.token,
  user: state.user,
  login: state.login,
  logout: state.logout,
})));

export const useRepo = () => useBoundStore(useShallow((state) => ({
  selectedRepo: state.selectedRepo,
  repositories: state.repositories,
  setSelectedRepo: state.setSelectedRepo,
  setRepositories: state.setRepositories,
})));

export const useBoard = () => useBoundStore(useShallow((state) => ({
  selectedBoard: state.selectedBoard,
  boards: state.boards,
  setSelectedBoard: state.setSelectedBoard,
  setBoards: state.setBoards,
})));

