import "../../services/game/types";
import type { GamePlayer, GameState, GameEvent, TransitionResult } from "../../services/game/types";

describe("Game State Types", () => {
  it("allows constructing a GamePlayer", () => {
    const player: GamePlayer = {
      odv: "user-123",
      letters: "SK",
      connected: true,
    };
    expect(player.letters).toBe("SK");
    expect(player.connected).toBe(true);
  });

  it("allows constructing a full GameState", () => {
    const state: GameState = {
      id: "game-001",
      spotId: "spot-42",
      creatorId: "user-123",
      players: [
        { odv: "user-123", letters: "", connected: true },
        { odv: "user-456", letters: "S", connected: true },
      ],
      maxPlayers: 2,
      currentTurnIndex: 0,
      currentAction: "set",
      status: "active",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T01:00:00Z",
      processedEventIds: [],
    };
    expect(state.players).toHaveLength(2);
    expect(state.status).toBe("active");
  });

  it("allows constructing GameEvents of all types", () => {
    const events: GameEvent[] = [
      {
        eventId: "evt-1",
        type: "create",
        odv: "user-123",
        gameId: "game-001",
        timestamp: "2025-01-01T00:00:00Z",
      },
      {
        eventId: "evt-2",
        type: "trick",
        odv: "user-123",
        gameId: "game-001",
        payload: { trickName: "kickflip" },
        timestamp: "2025-01-01T00:01:00Z",
      },
      {
        eventId: "evt-3",
        type: "timeout",
        odv: "user-456",
        gameId: "game-001",
        timestamp: "2025-01-01T00:05:00Z",
      },
    ];
    expect(events).toHaveLength(3);
    expect(events[1].payload).toEqual({ trickName: "kickflip" });
  });

  it("allows constructing TransitionResult for success and failure", () => {
    const success: TransitionResult = {
      success: true,
      game: {
        id: "game-001",
        spotId: "spot-42",
        creatorId: "user-123",
        players: [],
        maxPlayers: 2,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "waiting",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        processedEventIds: [],
      },
    };

    const failure: TransitionResult = {
      success: false,
      error: "Invalid state transition",
    };

    const duplicate: TransitionResult = {
      success: true,
      alreadyProcessed: true,
    };

    expect(success.success).toBe(true);
    expect(success.game).toBeDefined();
    expect(failure.error).toBe("Invalid state transition");
    expect(duplicate.alreadyProcessed).toBe(true);
  });
});
