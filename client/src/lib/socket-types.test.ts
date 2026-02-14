import "./socket-types";
import type {
  BattleCreatedPayload,
  GameCreatedPayload,
  GameTurnPayload,
  NotificationPayload,
  PresencePayload,
  RoomType,
} from "./socket-types";

describe("Client Socket Types", () => {
  it("allows constructing battle payloads", () => {
    const payload: BattleCreatedPayload = {
      battleId: "battle-001",
      creatorId: "user-123",
      matchmaking: "open",
      createdAt: "2025-01-01T00:00:00Z",
    };
    expect(payload.matchmaking).toBe("open");
  });

  it("allows constructing game payloads", () => {
    const created: GameCreatedPayload = {
      gameId: "game-001",
      spotId: "spot-42",
      creatorId: "user-123",
      maxPlayers: 4,
      createdAt: "2025-01-01T00:00:00Z",
    };

    const turn: GameTurnPayload = {
      gameId: "game-001",
      currentPlayer: "user-123",
      action: "set",
      timeLimit: 30,
    };

    expect(created.maxPlayers).toBe(4);
    expect(turn.action).toBe("set");
  });

  it("allows constructing notification payloads", () => {
    const notification: NotificationPayload = {
      id: "notif-001",
      type: "challenge",
      title: "New Challenge",
      message: "You have been challenged!",
      createdAt: "2025-01-01T00:00:00Z",
    };
    expect(notification.type).toBe("challenge");
  });

  it("allows constructing presence payloads", () => {
    const presence: PresencePayload = {
      odv: "user-123",
      status: "online",
    };
    expect(presence.status).toBe("online");
  });

  it("supports all room types", () => {
    const rooms: RoomType[] = ["battle", "game", "spot", "global"];
    expect(rooms).toHaveLength(4);
  });
});
