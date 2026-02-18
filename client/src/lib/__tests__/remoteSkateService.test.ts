/**
 * @fileoverview Tests for RemoteSkateService
 *
 * Tests:
 * - createGame
 * - joinGame
 * - markSetComplete / markReplyComplete
 * - subscribeToGame / subscribeToRounds / subscribeToVideo / subscribeToMyGames
 * - resolveRound
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock firebase/firestore
const mockSetDoc = vi.fn().mockResolvedValue(undefined);
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
const mockGetDocResult = { exists: vi.fn(() => true), data: vi.fn(), id: "mock-id" };
const mockGetDoc = vi.fn().mockResolvedValue(mockGetDocResult);
const mockOnSnapshot = vi.fn(() => vi.fn()); // returns unsubscribe
const mockQuery = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockServerTimestamp = vi.fn(() => ({ _serverTimestamp: true }));
const mockCollection = vi.fn(() => ({ id: "generated-id" }));
const mockDoc = vi.fn((..._args: any[]) => ({ id: "generated-id" }));

vi.mock("firebase/firestore", () => ({
  collection: (...args: any[]) => mockCollection(...args),
  doc: (...args: any[]) => mockDoc(...args),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  onSnapshot: (...args: any[]) => mockOnSnapshot(...args),
  query: (...args: any[]) => mockQuery(...args),
  where: (...args: any[]) => mockWhere(...args),
  orderBy: (...args: any[]) => mockOrderBy(...args),
  serverTimestamp: () => mockServerTimestamp(),
  Timestamp: { now: vi.fn() },
  FieldValue: {},
}));

// Mock firebase
vi.mock("../firebase", () => ({
  db: {},
  auth: {
    currentUser: { uid: "user-1", getIdToken: vi.fn().mockResolvedValue("mock-token") },
  },
}));

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  },
}));

const { RemoteSkateService } = await import("../remoteSkate/remoteSkateService");

describe("RemoteSkateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDocResult.exists.mockReturnValue(true);
    mockGetDocResult.data.mockReturnValue({
      playerAUid: "user-1",
      playerBUid: null,
      status: "waiting",
      letters: { "user-1": "" },
    });
  });

  describe("createGame", () => {
    it("should create a game document and return gameId", async () => {
      const gameId = await RemoteSkateService.createGame();
      expect(gameId).toBeDefined();
      expect(mockSetDoc).toHaveBeenCalled();
    });

    it("should throw when not logged in", async () => {
      const { auth } = await import("../firebase");
      const original = auth.currentUser;
      (auth as any).currentUser = null;

      await expect(RemoteSkateService.createGame()).rejects.toThrow(
        "Must be logged in to create a game"
      );

      (auth as any).currentUser = original;
    });
  });

  describe("joinGame", () => {
    it("should join an existing game", async () => {
      mockGetDocResult.data.mockReturnValue({
        playerAUid: "other-user",
        playerBUid: null,
        status: "waiting",
        letters: { "other-user": "" },
      });

      await RemoteSkateService.joinGame("game-1");

      expect(mockUpdateDoc).toHaveBeenCalled();
      expect(mockSetDoc).toHaveBeenCalled(); // Creates first round
    });

    it("should throw when game not found", async () => {
      mockGetDocResult.exists.mockReturnValue(false);

      await expect(RemoteSkateService.joinGame("nonexistent")).rejects.toThrow("Game not found");
    });

    it("should throw when joining own game", async () => {
      mockGetDocResult.data.mockReturnValue({
        playerAUid: "user-1",
        playerBUid: null,
        status: "waiting",
      });

      await expect(RemoteSkateService.joinGame("game-1")).rejects.toThrow(
        "You cannot join your own game"
      );
    });

    it("should throw when game is full", async () => {
      mockGetDocResult.data.mockReturnValue({
        playerAUid: "other-user",
        playerBUid: "third-user",
        status: "active",
      });

      await expect(RemoteSkateService.joinGame("game-1")).rejects.toThrow("Game is full");
    });

    it("should throw when game is no longer available", async () => {
      mockGetDocResult.data.mockReturnValue({
        playerAUid: "other-user",
        playerBUid: null,
        status: "active",
      });

      await expect(RemoteSkateService.joinGame("game-1")).rejects.toThrow(
        "Game is no longer available"
      );
    });

    it("should throw when not logged in", async () => {
      const { auth } = await import("../firebase");
      const original = auth.currentUser;
      (auth as any).currentUser = null;

      await expect(RemoteSkateService.joinGame("game-1")).rejects.toThrow(
        "Must be logged in to join a game"
      );

      (auth as any).currentUser = original;
    });
  });

  describe("markSetComplete", () => {
    it("should update round status and game turn", async () => {
      mockGetDocResult.data.mockReturnValue({
        defenseUid: "other-user",
        offenseUid: "user-1",
      });

      await RemoteSkateService.markSetComplete("game-1", "round-1");

      expect(mockUpdateDoc).toHaveBeenCalled();
    });

    it("should handle missing round gracefully", async () => {
      mockGetDocResult.exists.mockReturnValue(false);

      // Should not throw
      await RemoteSkateService.markSetComplete("game-1", "round-1");
    });
  });

  describe("markReplyComplete", () => {
    it("should update game turn to offense", async () => {
      mockGetDocResult.data.mockReturnValue({
        offenseUid: "user-1",
        defenseUid: "other-user",
      });

      await RemoteSkateService.markReplyComplete("game-1", "round-1");

      expect(mockUpdateDoc).toHaveBeenCalled();
    });

    it("should handle missing round gracefully", async () => {
      mockGetDocResult.exists.mockReturnValue(false);

      await RemoteSkateService.markReplyComplete("game-1", "round-1");
      // updateDoc should not be called for game update
    });
  });

  describe("subscribeToGame", () => {
    it("should set up snapshot listener", () => {
      const callback = vi.fn();
      const unsub = RemoteSkateService.subscribeToGame("game-1", callback);
      expect(mockOnSnapshot).toHaveBeenCalled();
      expect(typeof unsub).toBe("function");
    });

    it("should call callback with game data when snapshot exists (lines 218-219)", () => {
      let snapshotCb: any;
      mockOnSnapshot.mockImplementationOnce((_ref: any, onNext: any, _onError: any) => {
        snapshotCb = onNext;
        return vi.fn();
      });

      const callback = vi.fn();
      RemoteSkateService.subscribeToGame("game-1", callback);

      snapshotCb({
        exists: () => true,
        id: "game-1",
        data: () => ({ status: "active", playerAUid: "user-1" }),
      });

      expect(callback).toHaveBeenCalledWith({
        id: "game-1",
        status: "active",
        playerAUid: "user-1",
      });
    });

    it("should call callback with null when snapshot does not exist (line 221)", () => {
      let snapshotCb: any;
      mockOnSnapshot.mockImplementationOnce((_ref: any, onNext: any, _onError: any) => {
        snapshotCb = onNext;
        return vi.fn();
      });

      const callback = vi.fn();
      RemoteSkateService.subscribeToGame("game-1", callback);

      snapshotCb({
        exists: () => false,
        id: "game-1",
        data: () => null,
      });

      expect(callback).toHaveBeenCalledWith(null);
    });

    it("should call callback with null and log error on snapshot error (lines 224-226)", async () => {
      let errorCb: any;
      mockOnSnapshot.mockImplementationOnce((_ref: any, _onNext: any, onError: any) => {
        errorCb = onError;
        return vi.fn();
      });

      const callback = vi.fn();
      RemoteSkateService.subscribeToGame("game-1", callback);

      const { logger } = await import("../logger");
      const error = new Error("Permission denied");
      errorCb(error);

      expect(callback).toHaveBeenCalledWith(null);
      expect(logger.error).toHaveBeenCalledWith("[RemoteSkate] Game subscription error", error);
    });
  });

  describe("subscribeToRounds", () => {
    it("should set up query snapshot listener", () => {
      const callback = vi.fn();
      const unsub = RemoteSkateService.subscribeToRounds("game-1", callback);
      expect(mockOnSnapshot).toHaveBeenCalled();
      expect(typeof unsub).toBe("function");
    });

    it("should call callback with mapped round docs on snapshot success (lines 244-248)", () => {
      let snapshotCb: any;
      mockOnSnapshot.mockImplementationOnce((_ref: any, onNext: any, _onError: any) => {
        snapshotCb = onNext;
        return vi.fn();
      });

      const callback = vi.fn();
      RemoteSkateService.subscribeToRounds("game-1", callback);

      snapshotCb({
        docs: [
          { id: "round-1", data: () => ({ status: "awaiting_set", offenseUid: "user-1" }) },
          { id: "round-2", data: () => ({ status: "resolved", offenseUid: "user-2" }) },
        ],
      });

      expect(callback).toHaveBeenCalledWith([
        { id: "round-1", status: "awaiting_set", offenseUid: "user-1" },
        { id: "round-2", status: "resolved", offenseUid: "user-2" },
      ]);
    });

    it("should call callback with empty array on snapshot error (lines 250-252)", async () => {
      let errorCb: any;
      mockOnSnapshot.mockImplementationOnce((_ref: any, _onNext: any, onError: any) => {
        errorCb = onError;
        return vi.fn();
      });

      const callback = vi.fn();
      RemoteSkateService.subscribeToRounds("game-1", callback);

      const { logger } = await import("../logger");
      const error = new Error("Firestore unavailable");
      errorCb(error);

      expect(callback).toHaveBeenCalledWith([]);
      expect(logger.error).toHaveBeenCalledWith("[RemoteSkate] Rounds subscription error", error);
    });
  });

  describe("subscribeToVideo", () => {
    it("should set up snapshot listener for video", () => {
      const callback = vi.fn();
      const unsub = RemoteSkateService.subscribeToVideo("video-1", callback);
      expect(mockOnSnapshot).toHaveBeenCalled();
      expect(typeof unsub).toBe("function");
    });

    it("should call callback with video data when snapshot exists", () => {
      // Capture the onSnapshot callbacks
      let snapshotCb: any;
      mockOnSnapshot.mockImplementationOnce((_ref: any, onNext: any, _onError: any) => {
        snapshotCb = onNext;
        return vi.fn();
      });

      const callback = vi.fn();
      RemoteSkateService.subscribeToVideo("video-1", callback);

      // Simulate snapshot with data
      snapshotCb({
        exists: () => true,
        id: "video-1",
        data: () => ({ status: "ready", downloadURL: "https://example.com/video.mp4" }),
      });

      expect(callback).toHaveBeenCalledWith({
        id: "video-1",
        status: "ready",
        downloadURL: "https://example.com/video.mp4",
      });
    });

    it("should call callback with null when snapshot does not exist (line 271)", () => {
      let snapshotCb: any;
      mockOnSnapshot.mockImplementationOnce((_ref: any, onNext: any, _onError: any) => {
        snapshotCb = onNext;
        return vi.fn();
      });

      const callback = vi.fn();
      RemoteSkateService.subscribeToVideo("video-1", callback);

      // Simulate snapshot that doesn't exist (video deleted)
      snapshotCb({
        exists: () => false,
        id: "video-1",
        data: () => null,
      });

      expect(callback).toHaveBeenCalledWith(null);
    });

    it("should call callback with null and log error on snapshot error (lines 274-276)", async () => {
      let errorCb: any;
      mockOnSnapshot.mockImplementationOnce((_ref: any, _onNext: any, onError: any) => {
        errorCb = onError;
        return vi.fn();
      });

      const callback = vi.fn();
      RemoteSkateService.subscribeToVideo("video-1", callback);

      const { logger } = await import("../logger");

      // Simulate error in snapshot listener
      const error = new Error("Permission denied");
      errorCb(error);

      expect(callback).toHaveBeenCalledWith(null);
      expect(logger.error).toHaveBeenCalledWith("[RemoteSkate] Video subscription error", error);
    });
  });

  describe("subscribeToMyGames", () => {
    it("should set up query listener for playerA role", () => {
      const callback = vi.fn();
      const unsub = RemoteSkateService.subscribeToMyGames("user-1", "playerA", callback);
      expect(mockOnSnapshot).toHaveBeenCalled();
      expect(typeof unsub).toBe("function");
    });

    it("should set up query listener for playerB role", () => {
      const callback = vi.fn();
      const unsub = RemoteSkateService.subscribeToMyGames("user-1", "playerB", callback);
      expect(mockOnSnapshot).toHaveBeenCalled();
      expect(typeof unsub).toBe("function");
    });

    it("should call callback with mapped game docs on snapshot success (lines 296-300)", () => {
      let snapshotCb: any;
      mockOnSnapshot.mockImplementationOnce((_ref: any, onNext: any, _onError: any) => {
        snapshotCb = onNext;
        return vi.fn();
      });

      const callback = vi.fn();
      RemoteSkateService.subscribeToMyGames("user-1", "playerA", callback);

      // Simulate snapshot with docs
      snapshotCb({
        docs: [
          { id: "game-1", data: () => ({ status: "active", playerAUid: "user-1" }) },
          { id: "game-2", data: () => ({ status: "waiting", playerAUid: "user-1" }) },
        ],
      });

      expect(callback).toHaveBeenCalledWith([
        { id: "game-1", status: "active", playerAUid: "user-1" },
        { id: "game-2", status: "waiting", playerAUid: "user-1" },
      ]);
    });

    it("should call callback with empty array on snapshot error (lines 302-304)", async () => {
      let errorCb: any;
      mockOnSnapshot.mockImplementationOnce((_ref: any, _onNext: any, onError: any) => {
        errorCb = onError;
        return vi.fn();
      });

      const callback = vi.fn();
      RemoteSkateService.subscribeToMyGames("user-1", "playerA", callback);

      const { logger } = await import("../logger");

      const error = new Error("Firestore unavailable");
      errorCb(error);

      expect(callback).toHaveBeenCalledWith([]);
      expect(logger.error).toHaveBeenCalledWith("[RemoteSkate] My games subscription error", error);
    });
  });

  describe("confirmRound", () => {
    it("should call confirm API with correct parameters", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ disputed: false, result: "landed" }),
      });

      const result = await RemoteSkateService.confirmRound("game-1", "round-1", "landed");

      expect(fetch).toHaveBeenCalledWith(
        "/api/remote-skate/game-1/rounds/round-1/confirm",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer mock-token",
          }),
          body: JSON.stringify({ result: "landed" }),
        })
      );
      expect(result).toEqual({ disputed: false, result: "landed" });
    });

    it("should throw on confirm API error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ error: "Only defense can confirm" }),
      });

      await expect(RemoteSkateService.confirmRound("game-1", "round-1", "missed")).rejects.toThrow(
        "Only defense can confirm"
      );
    });

    it("should throw when not logged in for confirm", async () => {
      const { auth } = await import("../firebase");
      const original = auth.currentUser;
      (auth as any).currentUser = null;

      await expect(RemoteSkateService.confirmRound("game-1", "round-1", "landed")).rejects.toThrow(
        "Must be logged in"
      );

      (auth as any).currentUser = original;
    });

    it("should handle JSON parse failure on confirm error response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new Error("parse error")),
      });

      await expect(RemoteSkateService.confirmRound("game-1", "round-1", "landed")).rejects.toThrow(
        "Unknown error"
      );
    });
  });

  describe("resolveRound", () => {
    it("should call API with correct parameters", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      });

      await RemoteSkateService.resolveRound("game-1", "round-1", "landed");

      expect(fetch).toHaveBeenCalledWith(
        "/api/remote-skate/game-1/rounds/round-1/resolve",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer mock-token",
          }),
          body: JSON.stringify({ result: "landed" }),
        })
      );
    });

    it("should throw on API error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ error: "Invalid result" }),
      });

      await expect(RemoteSkateService.resolveRound("game-1", "round-1", "missed")).rejects.toThrow(
        "Invalid result"
      );
    });

    it("should throw when not logged in", async () => {
      const { auth } = await import("../firebase");
      const original = auth.currentUser;
      (auth as any).currentUser = null;

      await expect(RemoteSkateService.resolveRound("game-1", "round-1", "landed")).rejects.toThrow(
        "Must be logged in"
      );

      (auth as any).currentUser = original;
    });

    it("should handle JSON parse failure on error response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new Error("parse error")),
      });

      await expect(RemoteSkateService.resolveRound("game-1", "round-1", "landed")).rejects.toThrow(
        "Unknown error"
      );
    });
  });
});
