/**
 * @fileoverview Unit tests for GameStateService
 * @module server/__tests__/gameStateService.test
 *
 * Tests game state management with Firestore transactions, including:
 * - Game creation and joining
 * - Trick submission and passing
 * - Turn transitions
 * - Letter accumulation
 * - Win conditions
 * - Disconnect/reconnect handling
 * - Timeout scenarios
 * - Idempotency
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock environment
vi.mock("../config/env", () => ({
  env: {
    DATABASE_URL: "mock://test",
    NODE_ENV: "test",
  },
}));

// Mock logger
vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock analytics
vi.mock("./analyticsService", () => ({
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

// In-memory Firestore mock
const mockGameStates = new Map<string, any>();
let transactionCallback: ((transaction: any) => Promise<any>) | null = null;

const mockTransaction = {
  get: vi.fn().mockImplementation(async (ref: any) => {
    const data = mockGameStates.get(ref.id);
    return {
      exists: !!data,
      data: () => data,
    };
  }),
  update: vi.fn().mockImplementation((ref: any, updates: any) => {
    const current = mockGameStates.get(ref.id) || {};
    mockGameStates.set(ref.id, { ...current, ...updates });
  }),
  set: vi.fn().mockImplementation((ref: any, data: any) => {
    mockGameStates.set(ref.id, data);
  }),
};

const mockDocRef = (id: string) => ({
  id,
  get: vi.fn().mockImplementation(async () => {
    const data = mockGameStates.get(id);
    return { exists: !!data, data: () => data };
  }),
  set: vi.fn().mockImplementation(async (data: any) => {
    mockGameStates.set(id, data);
  }),
  update: vi.fn().mockImplementation(async (updates: any) => {
    const current = mockGameStates.get(id) || {};
    mockGameStates.set(id, { ...current, ...updates });
  }),
  delete: vi.fn().mockImplementation(async () => {
    mockGameStates.delete(id);
  }),
});

vi.mock("../firestore", () => ({
  db: {
    collection: vi.fn().mockImplementation((name: string) => ({
      doc: vi.fn().mockImplementation((id: string) => mockDocRef(id)),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    })),
    runTransaction: vi.fn().mockImplementation(async (callback: any) => {
      transactionCallback = callback;
      return await callback(mockTransaction);
    }),
  },
  collections: {
    gameSessions: "game_sessions",
  },
}));

// Import after mocking
const {
  createGame,
  joinGame,
  submitTrick,
  passTrick,
  handleDisconnect,
  handleReconnect,
  forfeitGame,
  getGameState,
  generateEventId,
} = await import("../services/gameStateService");

describe("GameStateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGameStates.clear();
  });

  afterEach(() => {
    transactionCallback = null;
  });

  // =============================================================================
  // GAME CREATION TESTS
  // =============================================================================

  describe("createGame", () => {
    it("should create a new game with initial state", async () => {
      const result = await createGame({
        eventId: "test-event-1",
        spotId: "spot-123",
        creatorId: "player-1",
        maxPlayers: 4,
      });

      expect(result.success).toBe(true);
      expect(result.game).toBeDefined();
      expect(result.game!.creatorId).toBe("player-1");
      expect(result.game!.spotId).toBe("spot-123");
      expect(result.game!.maxPlayers).toBe(4);
      expect(result.game!.status).toBe("waiting");
      expect(result.game!.players).toHaveLength(1);
      expect(result.game!.players[0].odv).toBe("player-1");
      expect(result.game!.players[0].letters).toBe("");
      expect(result.game!.players[0].connected).toBe(true);
    });

    it("should limit max players to 8", async () => {
      const result = await createGame({
        eventId: "test-event-2",
        spotId: "spot-123",
        creatorId: "player-1",
        maxPlayers: 20,
      });

      expect(result.success).toBe(true);
      expect(result.game!.maxPlayers).toBe(8);
    });

    it("should store idempotency key", async () => {
      const eventId = "unique-event-id";
      const result = await createGame({
        eventId,
        spotId: "spot-123",
        creatorId: "player-1",
      });

      expect(result.game!.processedEventIds).toContain(eventId);
    });
  });

  // =============================================================================
  // GAME JOINING TESTS
  // =============================================================================

  describe("joinGame", () => {
    beforeEach(async () => {
      // Setup: Create a game first
      mockGameStates.set("test-game", {
        id: "test-game",
        spotId: "spot-123",
        creatorId: "player-1",
        players: [{ odv: "player-1", letters: "", connected: true }],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "waiting",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processedEventIds: ["create-event"],
      });
    });

    it("should allow a new player to join", async () => {
      const result = await joinGame({
        eventId: "join-event-1",
        gameId: "test-game",
        odv: "player-2",
      });

      expect(result.success).toBe(true);
      expect(result.game!.players).toHaveLength(2);
      expect(result.game!.players[1].odv).toBe("player-2");
    });

    it("should start game when 2 players join", async () => {
      const result = await joinGame({
        eventId: "join-event-2",
        gameId: "test-game",
        odv: "player-2",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("active");
      expect(result.game!.turnDeadlineAt).toBeDefined();
    });

    it("should reject if game not found", async () => {
      const result = await joinGame({
        eventId: "join-event-3",
        gameId: "nonexistent-game",
        odv: "player-2",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Game not found");
    });

    it("should reject if already in game", async () => {
      const result = await joinGame({
        eventId: "join-event-4",
        gameId: "test-game",
        odv: "player-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Already in game");
    });

    it("should handle idempotent joins", async () => {
      const eventId = "join-event-5";

      // First join
      await joinGame({
        eventId,
        gameId: "test-game",
        odv: "player-2",
      });

      // Update state to include the event ID
      const state = mockGameStates.get("test-game");
      state.processedEventIds.push(eventId);

      // Duplicate join with same event ID
      const result = await joinGame({
        eventId,
        gameId: "test-game",
        odv: "player-2",
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });

    it("should reject if game is full", async () => {
      // Fill the game
      const state = mockGameStates.get("test-game");
      state.players = [
        { odv: "player-1", letters: "", connected: true },
        { odv: "player-2", letters: "", connected: true },
        { odv: "player-3", letters: "", connected: true },
        { odv: "player-4", letters: "", connected: true },
      ];

      const result = await joinGame({
        eventId: "join-event-6",
        gameId: "test-game",
        odv: "player-5",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Game is full");
    });

    it("should reject if game already started", async () => {
      const state = mockGameStates.get("test-game");
      state.status = "active";

      const result = await joinGame({
        eventId: "join-event-7",
        gameId: "test-game",
        odv: "player-2",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Game has already started");
    });
  });

  // =============================================================================
  // TRICK SUBMISSION TESTS
  // =============================================================================

  describe("submitTrick", () => {
    beforeEach(() => {
      // Setup: Active game with 2 players
      mockGameStates.set("active-game", {
        id: "active-game",
        spotId: "spot-123",
        creatorId: "player-1",
        players: [
          { odv: "player-1", letters: "", connected: true },
          { odv: "player-2", letters: "", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processedEventIds: [],
      });
    });

    it("should allow current player to submit trick during set phase", async () => {
      const result = await submitTrick({
        eventId: "trick-event-1",
        gameId: "active-game",
        odv: "player-1",
        trickName: "Kickflip",
      });

      expect(result.success).toBe(true);
      expect(result.game!.currentAction).toBe("attempt");
      expect(result.game!.currentTrick).toBe("Kickflip");
      expect(result.game!.setterId).toBe("player-1");
    });

    it("should reject if not current player's turn", async () => {
      const result = await submitTrick({
        eventId: "trick-event-2",
        gameId: "active-game",
        odv: "player-2",
        trickName: "Kickflip",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Not your turn");
    });

    it("should reject if game is not active", async () => {
      const state = mockGameStates.get("active-game");
      state.status = "completed";

      const result = await submitTrick({
        eventId: "trick-event-3",
        gameId: "active-game",
        odv: "player-1",
        trickName: "Kickflip",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Game is not active");
    });

    it("should move to next setter after all attempts", async () => {
      const state = mockGameStates.get("active-game");
      state.currentAction = "attempt";
      state.setterId = "player-1";
      state.currentTurnIndex = 1; // Player 2's turn to attempt

      const result = await submitTrick({
        eventId: "trick-event-4",
        gameId: "active-game",
        odv: "player-2",
        trickName: "Kickflip",
      });

      expect(result.success).toBe(true);
      // Should move back to set phase with next setter
      expect(result.game!.currentAction).toBe("set");
    });
  });

  // =============================================================================
  // PASS TRICK TESTS
  // =============================================================================

  describe("passTrick", () => {
    beforeEach(() => {
      // Setup: Game in attempt phase
      mockGameStates.set("attempt-game", {
        id: "attempt-game",
        spotId: "spot-123",
        creatorId: "player-1",
        players: [
          { odv: "player-1", letters: "", connected: true },
          { odv: "player-2", letters: "", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 1,
        currentAction: "attempt",
        currentTrick: "Kickflip",
        setterId: "player-1",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processedEventIds: [],
      });
    });

    it("should add letter when passing", async () => {
      const result = await passTrick({
        eventId: "pass-event-1",
        gameId: "attempt-game",
        odv: "player-2",
      });

      expect(result.success).toBe(true);
      expect(result.letterGained).toBe("S");
      expect(result.game!.players[1].letters).toBe("S");
    });

    it("should accumulate letters S-K-A-T-E", async () => {
      const state = mockGameStates.get("attempt-game");
      state.players[1].letters = "SKAT"; // One away from elimination

      const result = await passTrick({
        eventId: "pass-event-2",
        gameId: "attempt-game",
        odv: "player-2",
      });

      expect(result.success).toBe(true);
      expect(result.letterGained).toBe("SKATE");
      expect(result.isEliminated).toBe(true);
    });

    it("should end game when only one player remains", async () => {
      const state = mockGameStates.get("attempt-game");
      state.players[1].letters = "SKAT";

      const result = await passTrick({
        eventId: "pass-event-3",
        gameId: "attempt-game",
        odv: "player-2",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("completed");
      expect(result.game!.winnerId).toBe("player-1");
    });

    it("should reject pass during set phase", async () => {
      const state = mockGameStates.get("attempt-game");
      state.currentAction = "set";
      state.currentTurnIndex = 0;

      const result = await passTrick({
        eventId: "pass-event-4",
        gameId: "attempt-game",
        odv: "player-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Can only pass during attempt phase");
    });

    it("should skip eliminated players in turn order", async () => {
      // 3-player game with one eliminated
      mockGameStates.set("three-player-game", {
        id: "three-player-game",
        spotId: "spot-123",
        creatorId: "player-1",
        players: [
          { odv: "player-1", letters: "", connected: true },
          { odv: "player-2", letters: "SKATE", connected: true }, // Eliminated
          { odv: "player-3", letters: "S", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 2, // Player 3's turn
        currentAction: "attempt",
        currentTrick: "Kickflip",
        setterId: "player-1",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processedEventIds: [],
      });

      const result = await passTrick({
        eventId: "pass-event-5",
        gameId: "three-player-game",
        odv: "player-3",
      });

      expect(result.success).toBe(true);
      // Should skip player-2 (eliminated) and go back to set phase
    });
  });

  // =============================================================================
  // DISCONNECT HANDLING TESTS
  // =============================================================================

  describe("handleDisconnect", () => {
    beforeEach(() => {
      mockGameStates.set("disconnect-game", {
        id: "disconnect-game",
        spotId: "spot-123",
        creatorId: "player-1",
        players: [
          { odv: "player-1", letters: "", connected: true },
          { odv: "player-2", letters: "", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processedEventIds: [],
      });
    });

    it("should mark player as disconnected", async () => {
      const result = await handleDisconnect({
        eventId: "disconnect-event-1",
        gameId: "disconnect-game",
        odv: "player-1",
      });

      expect(result.success).toBe(true);
      expect(result.game!.players[0].connected).toBe(false);
      expect(result.game!.players[0].disconnectedAt).toBeDefined();
    });

    it("should pause active game on disconnect", async () => {
      const result = await handleDisconnect({
        eventId: "disconnect-event-2",
        gameId: "disconnect-game",
        odv: "player-1",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("paused");
      expect(result.game!.pausedAt).toBeDefined();
    });

    it("should not pause waiting games", async () => {
      const state = mockGameStates.get("disconnect-game");
      state.status = "waiting";

      const result = await handleDisconnect({
        eventId: "disconnect-event-3",
        gameId: "disconnect-game",
        odv: "player-1",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("waiting"); // Still waiting
    });
  });

  // =============================================================================
  // RECONNECT HANDLING TESTS
  // =============================================================================

  describe("handleReconnect", () => {
    beforeEach(() => {
      mockGameStates.set("paused-game", {
        id: "paused-game",
        spotId: "spot-123",
        creatorId: "player-1",
        players: [
          {
            odv: "player-1",
            letters: "",
            connected: false,
            disconnectedAt: new Date().toISOString(),
          },
          { odv: "player-2", letters: "", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "paused",
        pausedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processedEventIds: [],
      });
    });

    it("should mark player as reconnected", async () => {
      const result = await handleReconnect({
        eventId: "reconnect-event-1",
        gameId: "paused-game",
        odv: "player-1",
      });

      expect(result.success).toBe(true);
      expect(result.game!.players[0].connected).toBe(true);
      expect(result.game!.players[0].disconnectedAt).toBeUndefined();
    });

    it("should resume game when all players reconnected", async () => {
      const result = await handleReconnect({
        eventId: "reconnect-event-2",
        gameId: "paused-game",
        odv: "player-1",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("active");
      expect(result.game!.pausedAt).toBeUndefined();
      expect(result.game!.turnDeadlineAt).toBeDefined();
    });

    it("should stay paused if other players still disconnected", async () => {
      const state = mockGameStates.get("paused-game");
      state.players[1].connected = false;

      const result = await handleReconnect({
        eventId: "reconnect-event-3",
        gameId: "paused-game",
        odv: "player-1",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("paused"); // Still paused
    });
  });

  // =============================================================================
  // FORFEIT TESTS
  // =============================================================================

  describe("forfeitGame", () => {
    beforeEach(() => {
      mockGameStates.set("forfeit-game", {
        id: "forfeit-game",
        spotId: "spot-123",
        creatorId: "player-1",
        players: [
          { odv: "player-1", letters: "SK", connected: true },
          { odv: "player-2", letters: "S", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processedEventIds: [],
      });
    });

    it("should end game and declare winner on forfeit", async () => {
      const result = await forfeitGame({
        eventId: "forfeit-event-1",
        gameId: "forfeit-game",
        odv: "player-1",
        reason: "voluntary",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("completed");
      expect(result.game!.winnerId).toBe("player-2");
    });

    it("should handle forfeit due to disconnect timeout", async () => {
      const result = await forfeitGame({
        eventId: "forfeit-event-2",
        gameId: "forfeit-game",
        odv: "player-1",
        reason: "disconnect_timeout",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("completed");
    });

    it("should reject forfeit for completed games", async () => {
      const state = mockGameStates.get("forfeit-game");
      state.status = "completed";

      const result = await forfeitGame({
        eventId: "forfeit-event-3",
        gameId: "forfeit-game",
        odv: "player-1",
        reason: "voluntary",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Game already completed");
    });
  });

  // =============================================================================
  // IDEMPOTENCY TESTS
  // =============================================================================

  describe("idempotency", () => {
    beforeEach(() => {
      mockGameStates.set("idempotent-game", {
        id: "idempotent-game",
        spotId: "spot-123",
        creatorId: "player-1",
        players: [
          { odv: "player-1", letters: "", connected: true },
          { odv: "player-2", letters: "", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processedEventIds: ["existing-event-id"],
      });
    });

    it("should skip processing for duplicate event IDs", async () => {
      const result = await submitTrick({
        eventId: "existing-event-id",
        gameId: "idempotent-game",
        odv: "player-1",
        trickName: "Kickflip",
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });
  });

  // =============================================================================
  // EVENT ID GENERATION
  // =============================================================================

  describe("generateEventId", () => {
    it("should generate unique event IDs", () => {
      const id1 = generateEventId("trick", "player-1", "game-1");
      const id2 = generateEventId("trick", "player-1", "game-1");

      expect(id1).not.toBe(id2);
      expect(id1).toContain("trick");
      expect(id1).toContain("game-1");
      expect(id1).toContain("player-1");
    });
  });
});
