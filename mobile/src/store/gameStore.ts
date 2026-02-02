import { create } from "zustand";
import type {
  GameSession,
  TurnPhase,
  GameOverlay,
  PendingUpload,
  SkateLetter,
  Move,
} from "@/types";

/**
 * Local UI state for the S.K.A.T.E. battle.
 * Separates UI concerns from Firestore server state.
 */
interface GameUIState {
  // Current game context
  gameId: string | null;
  currentUserId: string | null;

  // UI overlays and modals
  activeOverlay: GameOverlay | null;
  showCamera: boolean;
  showTrickNameInput: boolean;

  // Recording state
  isRecording: boolean;
  recordingStartTime: number | null;
  localVideoUri: string | null;

  // Upload state (optimistic updates)
  pendingUpload: PendingUpload | null;

  // Trick name for current recording
  currentTrickName: string;

  // Offline queue for moves made while disconnected
  offlineQueue: Array<{
    type: "move" | "vote";
    payload: Record<string, unknown>;
    timestamp: number;
  }>;

  // Connection status
  isOnline: boolean;

  // Local cache of game session for optimistic updates
  optimisticGameSession: GameSession | null;
}

interface GameUIActions {
  // Initialization
  initGame: (gameId: string, currentUserId: string) => void;
  resetGame: () => void;

  // Overlay management
  showOverlay: (overlay: GameOverlay) => void;
  dismissOverlay: () => void;

  // Camera/recording flow
  openCamera: () => void;
  closeCamera: () => void;
  startRecording: () => void;
  stopRecording: (videoUri: string) => void;
  clearRecording: () => void;

  // Trick naming
  openTrickNameInput: () => void;
  closeTrickNameInput: () => void;
  setTrickName: (name: string) => void;

  // Upload management
  setUploadProgress: (progress: number) => void;
  setUploadStatus: (status: PendingUpload["status"], error?: string) => void;
  clearUpload: () => void;

  // Offline handling
  queueOfflineAction: (
    type: "move" | "vote",
    payload: Record<string, unknown>
  ) => void;
  clearOfflineQueue: () => void;
  setOnlineStatus: (isOnline: boolean) => void;

  // Optimistic updates
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
  showCamera: false,
  showTrickNameInput: false,
  isRecording: false,
  recordingStartTime: null,
  localVideoUri: null,
  pendingUpload: null,
  currentTrickName: "",
  offlineQueue: [],
  isOnline: true,
  optimisticGameSession: null,
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  initGame: (gameId, currentUserId) => {
    set({
      ...initialState,
      gameId,
      currentUserId,
      isOnline: get().isOnline, // Preserve connection status
    });
  },

  resetGame: () => {
    set(initialState);
  },

  // =========================================================================
  // OVERLAY MANAGEMENT
  // =========================================================================

  showOverlay: (overlay) => {
    set({ activeOverlay: overlay });

    // Auto-dismiss if configured
    if (overlay.autoDismissMs !== null) {
      setTimeout(() => {
        const current = get().activeOverlay;
        // Only dismiss if it's still the same overlay
        if (current?.type === overlay.type) {
          set({ activeOverlay: null });
        }
      }, overlay.autoDismissMs);
    }
  },

  dismissOverlay: () => {
    set({ activeOverlay: null });
  },

  // =========================================================================
  // CAMERA/RECORDING FLOW
  // =========================================================================

  openCamera: () => {
    set({ showCamera: true });
  },

  closeCamera: () => {
    set({
      showCamera: false,
      isRecording: false,
      recordingStartTime: null,
      localVideoUri: null,
    });
  },

  startRecording: () => {
    set({
      isRecording: true,
      recordingStartTime: Date.now(),
      localVideoUri: null,
    });
  },

  stopRecording: (videoUri) => {
    set({
      isRecording: false,
      localVideoUri: videoUri,
    });
  },

  clearRecording: () => {
    set({
      localVideoUri: null,
      recordingStartTime: null,
    });
  },

  // =========================================================================
  // TRICK NAMING
  // =========================================================================

  openTrickNameInput: () => {
    set({ showTrickNameInput: true });
  },

  closeTrickNameInput: () => {
    set({ showTrickNameInput: false });
  },

  setTrickName: (name) => {
    set({ currentTrickName: name });
  },

  // =========================================================================
  // UPLOAD MANAGEMENT
  // =========================================================================

  setUploadProgress: (progress) => {
    const current = get().pendingUpload;
    if (current) {
      set({
        pendingUpload: { ...current, progress },
      });
    } else {
      // Initialize upload state if not exists
      set({
        pendingUpload: {
          id: `upload_${Date.now()}`,
          localUri: get().localVideoUri || "",
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
    set({
      pendingUpload: null,
      localVideoUri: null,
      currentTrickName: "",
    });
  },

  // =========================================================================
  // OFFLINE HANDLING
  // =========================================================================

  queueOfflineAction: (type, payload) => {
    const queue = get().offlineQueue;
    set({
      offlineQueue: [
        ...queue,
        {
          type,
          payload,
          timestamp: Date.now(),
        },
      ],
    });
  },

  clearOfflineQueue: () => {
    set({ offlineQueue: [] });
  },

  setOnlineStatus: (isOnline) => {
    set({ isOnline });
  },

  // =========================================================================
  // OPTIMISTIC UPDATES
  // =========================================================================

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

// =========================================================================
// SELECTOR HOOKS (for performance optimization)
// =========================================================================

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

/** Get recording state */
export function useRecordingState() {
  return useGameStore((state) => ({
    isRecording: state.isRecording,
    recordingStartTime: state.recordingStartTime,
    localVideoUri: state.localVideoUri,
    showCamera: state.showCamera,
  }));
}

/** Get upload state */
export function useUploadState() {
  return useGameStore((state) => state.pendingUpload);
}

/** Check if user is online */
export function useOnlineStatus() {
  return useGameStore((state) => state.isOnline);
}
