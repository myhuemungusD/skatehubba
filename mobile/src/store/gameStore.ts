import { create } from "zustand";
import type { GameOverlay, PendingUpload, GameSession } from "@/types";

interface GameUIState {
  gameId: string | null;
  currentUserId: string | null;
  activeOverlay: GameOverlay | null;
  pendingUpload: PendingUpload | null;
}

interface GameUIActions {
  initGame: (gameId: string, currentUserId: string) => void;
  resetGame: () => void;
  showOverlay: (overlay: GameOverlay) => void;
  dismissOverlay: () => void;
  setUploadProgress: (progress: number) => void;
  setUploadStatus: (status: PendingUpload["status"], error?: string) => void;
  clearUpload: () => void;
}

type GameStore = GameUIState & GameUIActions;

const initialState: GameUIState = {
  gameId: null,
  currentUserId: null,
  activeOverlay: null,
  pendingUpload: null,
};

// Track active timer for cleanup
let overlayTimerId: ReturnType<typeof setTimeout> | null = null;

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  initGame: (gameId, currentUserId) => {
    // Clear any pending timer
    if (overlayTimerId) {
      clearTimeout(overlayTimerId);
      overlayTimerId = null;
    }
    set({
      ...initialState,
      gameId,
      currentUserId,
    });
  },

  resetGame: () => {
    if (overlayTimerId) {
      clearTimeout(overlayTimerId);
      overlayTimerId = null;
    }
    set(initialState);
  },

  showOverlay: (overlay) => {
    // Clear any existing timer
    if (overlayTimerId) {
      clearTimeout(overlayTimerId);
      overlayTimerId = null;
    }

    set({ activeOverlay: overlay });

    if (overlay.autoDismissMs !== null) {
      overlayTimerId = setTimeout(() => {
        const current = get().activeOverlay;
        if (current?.type === overlay.type) {
          set({ activeOverlay: null });
        }
        overlayTimerId = null;
      }, overlay.autoDismissMs);
    }
  },

  dismissOverlay: () => {
    if (overlayTimerId) {
      clearTimeout(overlayTimerId);
      overlayTimerId = null;
    }
    set({ activeOverlay: null });
  },

  setUploadProgress: (progress) => {
    const current = get().pendingUpload;
    if (current) {
      set({ pendingUpload: { ...current, progress } });
    } else {
      set({
        pendingUpload: {
          id: `upload_${Date.now()}`,
          localUri: "",
          progress,
          status: "uploading",
          error: null,
        },
      });
    }
  },

  setUploadStatus: (status, error) => {
    const current = get().pendingUpload;
    if (current) {
      set({
        pendingUpload: {
          ...current,
          status,
          error: error || null,
        },
      });
    }
  },

  clearUpload: () => {
    set({ pendingUpload: null });
  },
}));

/**
 * Get current player's role in the game.
 * Pass the game session from React Query as the single source of truth.
 */
export function usePlayerRole(session: GameSession | null | undefined) {
  const currentUserId = useGameStore((state) => state.currentUserId);

  if (!session || !currentUserId) {
    return { isAttacker: false, isDefender: false, isMyTurn: false };
  }

  const isMyTurn = session.currentTurn === currentUserId;
  const isAttacker = session.currentAttacker === currentUserId;
  const isDefender = !isAttacker && isMyTurn;

  return { isAttacker, isDefender, isMyTurn };
}

/** Get current overlay state */
export function useActiveOverlay() {
  return useGameStore((state) => state.activeOverlay);
}
