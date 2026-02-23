import "../../socket/types";
import type {
  RoomType,
  RoomInfo,
  BattleCreatedPayload,
  GameStatePayload,
  GamePausedPayload,
  GameResumedPayload,
  NotificationPayload,
  PresencePayload,
  SocketData,
  BattleVotingStartedPayload,
} from "../../socket/types";

describe("Server Socket Types", () => {
  it("allows constructing RoomInfo", () => {
    const room: RoomInfo = {
      type: "game" as RoomType,
      id: "game-001",
      members: new Set(["user-1", "user-2"]),
      createdAt: new Date(),
    };
    expect(room.members.size).toBe(2);
    expect(room.type).toBe("game");
  });

  it("allows constructing GameStatePayload", () => {
    const state: GameStatePayload = {
      gameId: "game-001",
      players: [
        { odv: "user-1", letters: "SK", connected: true },
        { odv: "user-2", letters: "S", connected: true },
      ],
      currentPlayer: "user-1",
      currentAction: "set",
      status: "active",
    };
    expect(state.players).toHaveLength(2);
    expect(state.status).toBe("active");
  });

  it("allows constructing pause/resume payloads", () => {
    const paused: GamePausedPayload = {
      gameId: "game-001",
      disconnectedPlayer: "user-2",
      reconnectTimeout: 60,
    };

    const resumed: GameResumedPayload = {
      gameId: "game-001",
      reconnectedPlayer: "user-2",
    };

    expect(paused.reconnectTimeout).toBe(60);
    expect(resumed.reconnectedPlayer).toBe("user-2");
  });

  it("allows constructing SocketData", () => {
    const data: SocketData = {
      userId: "user-123",
      odv: "user-123",
      firebaseUid: "firebase-abc",
      roles: ["user"],
      connectedAt: new Date(),
      rooms: new Set(["game:game-001"]),
    };
    expect(data.roles).toContain("user");
    expect(data.rooms.has("game:game-001")).toBe(true);
  });

  it("allows constructing BattleVotingStartedPayload", () => {
    const payload: BattleVotingStartedPayload = {
      battleId: "battle-001",
      timeoutSeconds: 30,
      startedAt: "2025-01-01T00:00:00Z",
    };
    expect(payload.timeoutSeconds).toBe(30);
  });
});
