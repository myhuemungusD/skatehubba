import { create } from 'zustand';

type ClosetType = 'all' | 'deck' | 'trucks' | 'wheels' | 'shoes' | 'apparel' | 'accessory';

interface ClosetFilterState {
  type: ClosetType;
  setType: (type: ClosetType) => void;
}

export const useClosetFilter = create<ClosetFilterState>((set) => ({
  type: 'all',
  setType: (type) => set({ type }),
}));
