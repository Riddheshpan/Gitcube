import { StateCreator } from 'zustand';

export interface AuthSlice {
  isAuthenticated: boolean;
  token: string | null;
  user: {
    id: string;
    username: string;
    avatarUrl?: string;
  } | null;
  login: (token: string, user: AuthSlice['user']) => void;
  logout: () => void;
}

export const createAuthSlice: StateCreator<AuthSlice> = (set) => ({
  isAuthenticated: false,
  token: null,
  user: null,
  login: (token, user) => set({ isAuthenticated: true, token, user }),
  logout: () => set({ isAuthenticated: false, token: null, user: null }),
});
