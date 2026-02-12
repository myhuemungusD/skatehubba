import "./types";
import type {
  Game,
  GameTurn,
  GameDispute,
  GameWithDetails,
  MyGames,
  CreateGameRequest,
  SubmitTurnRequest,
  JudgeTurnRequest,
  AvailablePlayer,
} from "./types";

describe("Game API Types", () => {
  it("allows constructing a valid Game object", () => {
    const game: Game = {
      id: "game-001",
      player1Id: "p1",
      player1Name: "Alice",
      player2Id: "p2",
      player2Name: "Bob",
      status: "active",
      currentTurn: "p1",
      turnPhase: "set_trick",
      offensivePlayerId: "p1",
      defensivePlayerId: "p2",
      player1Letters: "SK",
      player2Letters: "S",
      player1DisputeUsed: false,
      player2DisputeUsed: false,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T01:00:00Z",
    };
    expect(game.status).toBe("active");
    expect(game.turnPhase).toBe("set_trick");
  });

  it("allows constructing a GameWithDetails object", () => {
    const turn: GameTurn = {
      id: 1,
      gameId: "game-001",
      playerId: "p1",
      playerName: "Alice",
      turnNumber: 1,
      turnType: "set",
      trickDescription: "Kickflip",
      videoUrl: "https://cdn.example.com/clip.mp4",
      result: "landed",
      createdAt: "2025-01-01T00:00:00Z",
    };

    const dispute: GameDispute = {
      id: 1,
      gameId: "game-001",
      turnId: 1,
      disputedBy: "p2",
      againstPlayerId: "p1",
      originalResult: "landed",
      createdAt: "2025-01-01T00:00:00Z",
    };

    const details: GameWithDetails = {
      game: {
        id: "game-001",
        player1Id: "p1",
        player1Name: "Alice",
        player2Id: "p2",
        player2Name: "Bob",
        status: "active",
        currentTurn: "p1",
        turnPhase: "set_trick",
        offensivePlayerId: "p1",
        defensivePlayerId: "p2",
        player1Letters: "",
        player2Letters: "",
        player1DisputeUsed: false,
        player2DisputeUsed: false,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
      turns: [turn],
      disputes: [dispute],
      isMyTurn: true,
      needsToJudge: false,
      needsToRespond: false,
      pendingTurnId: null,
      canDispute: true,
    };
    expect(details.turns).toHaveLength(1);
    expect(details.canDispute).toBe(true);
  });

  it("allows constructing MyGames with all categories", () => {
    const myGames: MyGames = {
      pendingChallenges: [],
      sentChallenges: [],
      activeGames: [],
      completedGames: [],
      total: 0,
    };
    expect(myGames.total).toBe(0);
  });

  it("allows constructing request types", () => {
    const create: CreateGameRequest = { opponentId: "p2" };
    const submit: SubmitTurnRequest = {
      trickDescription: "Heelflip",
      videoUrl: "https://cdn.example.com/heel.mp4",
      videoDurationMs: 5000,
    };
    const judge: JudgeTurnRequest = { result: "landed" };

    expect(create.opponentId).toBe("p2");
    expect(submit.videoDurationMs).toBe(5000);
    expect(judge.result).toBe("landed");
  });

  it("allows constructing an AvailablePlayer", () => {
    const player: AvailablePlayer = {
      id: "p1",
      username: "skater_pro",
      isOnline: true,
    };
    expect(player.isOnline).toBe(true);
  });
});
