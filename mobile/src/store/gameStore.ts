import { create } from "zustand";
import type {
  GameSession,
  TurnPhase,
  GameOverlay,
  PendingUpload,
  SkateLetter,
  Move,
} from "@/types";

interface GameUIState {
  gameId: string | null;
  currentUserId: string | null;
  activeOverlay: GameOverlay | null;
  pendingUpload: PendingUpload | null;
  optimisticGameSession: GameSession | null;
}

interface GameUIActions {
  initGame: (gameId: string, currentUserId: string) => void;
  resetGame: () => void;
  showOverlay: (overlay: GameOverlay) => void;
  dismissOverlay: () => void;
  setUploadProgress: (progress: number) => void;
  setUploadStatus: (status: PendingUpload["status"], error?: string) => void;
  clearUpload: () => void;
  setOptimisticGameSession: (session: GameSession | null) => void;
  applyOptimisticMove: (move: Move) => void;
  applyOptimisticLetter: (playerId: string, letter: SkateLetter) => void;
  applyOptimisticTurnPhase: (phase: TurnPhase) => void;
}

type GameStore = GameUIState & GameUIActions;

const initialState: GameUIState = {
  gameId: null,
  currentUserId: null,
  activeOverlay: null,
  pendingUpload: null,
  optimisticGameSession: null,
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

  setOptimisticGameSession: (session) => {
    set({ optimisticGameSession: session });
  },

  applyOptimisticMove: (move) => {
    const session = get().optimisticGameSession;
    if (!session) return;

    set({
      optimisticGameSession: {
        ...session,
        moves: [...session.moves, move],
        currentSetMove: move.type === "set" ? move : session.currentSetMove,
        updatedAt: new Date(),
      },
    });
  },

  applyOptimisticLetter: (playerId, letter) => {
    const session = get().optimisticGameSession;
    if (!session) return;

    const isPlayer1 = playerId === session.player1Id;
    const currentLetters = isPlayer1
      ? session.player1Letters
      : session.player2Letters;

    set({
      optimisticGameSession: {
        ...session,
        player1Letters: isPlayer1
          ? [...currentLetters, letter]
          : session.player1Letters,
        player2Letters: !isPlayer1
          ? [...currentLetters, letter]
          : session.player2Letters,
        updatedAt: new Date(),
      },
    });
  },

  applyOptimisticTurnPhase: (phase) => {
    const session = get().optimisticGameSession;
    if (!session) return;

    set({
      optimisticGameSession: {
        ...session,
        turnPhase: phase,
        updatedAt: new Date(),
      },
    });
  },
}));

/** Get current player's role in the game */
export function usePlayerRole() {
  return useGameStore((state) => {
    const session = state.optimisticGameSession;
    if (!session || !state.currentUserId) {
      return { isAttacker: false, isDefender: false, isMyTurn: false };
    }

    const isMyTurn = session.currentTurn === state.currentUserId;
    const isAttacker = session.currentAttacker === state.currentUserId;
    const isDefender = !isAttacker && isMyTurn;

    return { isAttacker, isDefender, isMyTurn };
  });
}

/** Get current overlay state */
export function useActiveOverlay() {
  return useGameStore((state) => state.activeOverlay);
}
