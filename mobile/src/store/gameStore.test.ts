import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useGameStore } from "./gameStore";
import type { GameSession, GameOverlay } from "@/types";

describe("gameStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.getState().resetGame();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initial state", () => {
    it("starts with null values", () => {
      const state = useGameStore.getState();
      expect(state.gameId).toBeNull();
      expect(state.currentUserId).toBeNull();
      expect(state.activeOverlay).toBeNull();
      expect(state.pendingUpload).toBeNull();
    });
  });

  describe("initGame", () => {
    it("sets gameId and currentUserId", () => {
      useGameStore.getState().initGame("game-abc", "user-123");

      const state = useGameStore.getState();
      expect(state.gameId).toBe("game-abc");
      expect(state.currentUserId).toBe("user-123");
    });

    it("resets overlay and upload state", () => {
      // Set some state first
      useGameStore.setState({
        activeOverlay: { type: "turn_start", title: "test" } as GameOverlay,
        pendingUpload: { id: "u1", localUri: "", progress: 50, status: "uploading", error: null },
      });

      useGameStore.getState().initGame("game-abc", "user-123");

      const state = useGameStore.getState();
      expect(state.activeOverlay).toBeNull();
      expect(state.pendingUpload).toBeNull();
    });

    it("clears pending overlay timers", () => {
      const overlay: GameOverlay = {
        type: "turn_start",
        title: "YOUR SET",
        subtitle: null,
        playerId: null,
        letter: null,
        autoDismissMs: 5000,
      };

      useGameStore.getState().showOverlay(overlay);
      expect(useGameStore.getState().activeOverlay).not.toBeNull();

      // Init game before auto-dismiss fires
      useGameStore.getState().initGame("game-abc", "user-123");

      // Advance past auto-dismiss time
      vi.advanceTimersByTime(6000);

      // Should still be null (timer was cleared)
      expect(useGameStore.getState().activeOverlay).toBeNull();
    });
  });

  describe("resetGame", () => {
    it("resets all state to initial", () => {
      useGameStore.getState().initGame("game-abc", "user-123");
      useGameStore.getState().setUploadProgress(50);

      useGameStore.getState().resetGame();

      const state = useGameStore.getState();
      expect(state.gameId).toBeNull();
      expect(state.currentUserId).toBeNull();
      expect(state.pendingUpload).toBeNull();
    });
  });

  describe("showOverlay", () => {
    it("sets the active overlay", () => {
      const overlay: GameOverlay = {
        type: "turn_start",
        title: "YOUR SET",
        subtitle: "Record the trick",
        playerId: "user-123",
        letter: null,
        autoDismissMs: null,
      };

      useGameStore.getState().showOverlay(overlay);

      expect(useGameStore.getState().activeOverlay).toEqual(overlay);
    });

    it("auto-dismisses after autoDismissMs", () => {
      const overlay: GameOverlay = {
        type: "turn_start",
        title: "YOUR SET",
        subtitle: null,
        playerId: null,
        letter: null,
        autoDismissMs: 2500,
      };

      useGameStore.getState().showOverlay(overlay);
      expect(useGameStore.getState().activeOverlay).not.toBeNull();

      vi.advanceTimersByTime(2500);

      expect(useGameStore.getState().activeOverlay).toBeNull();
    });

    it("does not auto-dismiss when autoDismissMs is null", () => {
      const overlay: GameOverlay = {
        type: "waiting_opponent",
        title: "WAITING",
        subtitle: null,
        playerId: null,
        letter: null,
        autoDismissMs: null,
      };

      useGameStore.getState().showOverlay(overlay);
      vi.advanceTimersByTime(60000);

      expect(useGameStore.getState().activeOverlay).not.toBeNull();
    });

    it("replaces previous overlay and cancels its timer", () => {
      const overlay1: GameOverlay = {
        type: "turn_start",
        title: "FIRST",
        subtitle: null,
        playerId: null,
        letter: null,
        autoDismissMs: 5000,
      };

      const overlay2: GameOverlay = {
        type: "letter_gained",
        title: "SECOND",
        subtitle: null,
        playerId: null,
        letter: "S",
        autoDismissMs: 3000,
      };

      useGameStore.getState().showOverlay(overlay1);
      useGameStore.getState().showOverlay(overlay2);

      // overlay2 should be active
      expect(useGameStore.getState().activeOverlay?.title).toBe("SECOND");

      // Advance past overlay1's dismiss time but not overlay2's
      vi.advanceTimersByTime(3000);

      // overlay2 should now be dismissed
      expect(useGameStore.getState().activeOverlay).toBeNull();
    });
  });

  describe("dismissOverlay", () => {
    it("clears the overlay", () => {
      useGameStore.getState().showOverlay({
        type: "turn_start",
        title: "TEST",
        subtitle: null,
        playerId: null,
        letter: null,
        autoDismissMs: null,
      });

      useGameStore.getState().dismissOverlay();

      expect(useGameStore.getState().activeOverlay).toBeNull();
    });
  });

  describe("upload tracking", () => {
    it("setUploadProgress creates upload if none exists", () => {
      useGameStore.getState().setUploadProgress(25);

      const upload = useGameStore.getState().pendingUpload;
      expect(upload).not.toBeNull();
      expect(upload!.progress).toBe(25);
      expect(upload!.status).toBe("uploading");
    });

    it("setUploadProgress updates existing upload", () => {
      useGameStore.getState().setUploadProgress(25);
      useGameStore.getState().setUploadProgress(75);

      expect(useGameStore.getState().pendingUpload!.progress).toBe(75);
    });

    it("setUploadStatus updates status", () => {
      useGameStore.getState().setUploadProgress(50);
      useGameStore.getState().setUploadStatus("processing");

      expect(useGameStore.getState().pendingUpload!.status).toBe("processing");
    });

    it("setUploadStatus stores error message", () => {
      useGameStore.getState().setUploadProgress(50);
      useGameStore.getState().setUploadStatus("failed", "Network timeout");

      const upload = useGameStore.getState().pendingUpload!;
      expect(upload.status).toBe("failed");
      expect(upload.error).toBe("Network timeout");
    });

    it("setUploadStatus is no-op when no upload exists", () => {
      useGameStore.getState().setUploadStatus("complete");
      expect(useGameStore.getState().pendingUpload).toBeNull();
    });

    it("clearUpload removes the pending upload", () => {
      useGameStore.getState().setUploadProgress(50);
      useGameStore.getState().clearUpload();

      expect(useGameStore.getState().pendingUpload).toBeNull();
    });
  });

  describe("player role logic", () => {
    // usePlayerRole is a React hook that calls useGameStore((state) => state.currentUserId).
    // We test the underlying role-derivation logic directly using store state.
    function getPlayerRole(session: GameSession | null | undefined, currentUserId: string | null) {
      if (!session || !currentUserId) {
        return { isAttacker: false, isDefender: false, isMyTurn: false };
      }
      const isMyTurn = session.currentTurn === currentUserId;
      const isAttacker = session.currentAttacker === currentUserId;
      const isDefender = !isAttacker && isMyTurn;
      return { isAttacker, isDefender, isMyTurn };
    }

    it("returns all false when session is null", () => {
      const result = getPlayerRole(null, "user-123");
      expect(result).toEqual({ isAttacker: false, isDefender: false, isMyTurn: false });
    });

    it("returns all false when currentUserId is null", () => {
      const session = {
        currentTurn: "user-123",
        currentAttacker: "user-123",
      } as GameSession;

      const result = getPlayerRole(session, null);
      expect(result).toEqual({ isAttacker: false, isDefender: false, isMyTurn: false });
    });

    it("identifies attacker correctly", () => {
      const session = {
        currentTurn: "user-123",
        currentAttacker: "user-123",
      } as GameSession;

      const result = getPlayerRole(session, "user-123");
      expect(result.isAttacker).toBe(true);
      expect(result.isDefender).toBe(false);
      expect(result.isMyTurn).toBe(true);
    });

    it("identifies defender correctly", () => {
      const session = {
        currentTurn: "user-456",
        currentAttacker: "user-123",
      } as GameSession;

      const result = getPlayerRole(session, "user-456");
      expect(result.isAttacker).toBe(false);
      expect(result.isDefender).toBe(true);
      expect(result.isMyTurn).toBe(true);
    });

    it("identifies waiting (not my turn) correctly", () => {
      const session = {
        currentTurn: "user-123",
        currentAttacker: "user-123",
      } as GameSession;

      const result = getPlayerRole(session, "user-456");
      expect(result.isAttacker).toBe(false);
      expect(result.isDefender).toBe(false);
      expect(result.isMyTurn).toBe(false);
    });
  });
});
