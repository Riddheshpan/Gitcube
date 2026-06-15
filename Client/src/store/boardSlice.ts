import { StateCreator } from 'zustand';

export interface Board {
  id: string;
  name: string;
  provider: 'jira' | 'trello' | 'github_projects' | 'linear';
}

export interface BoardSlice {
  selectedBoard: Board | null;
  boards: Board[];
  setSelectedBoard: (board: Board | null) => void;
  setBoards: (boards: Board[]) => void;
}

export const createBoardSlice: StateCreator<BoardSlice> = (set) => ({
  selectedBoard: null,
  boards: [],
  setSelectedBoard: (board) => set({ selectedBoard: board }),
  setBoards: (boards) => set({ boards: boards }),
});
