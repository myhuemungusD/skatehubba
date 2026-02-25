/**
 * @fileoverview Unit tests for setterBail in gameTurnService
 *
 * Tests the setter bail flow where the offensive player bails on their
 * own trick and takes a letter. Covers:
 * - Validation errors (game not found, not active, wrong player, wrong phase)
 * - Success path: letter assigned, roles swapped
 * - Game over when setter reaches S.K.A.T.E.
 * - Correct notifications sent to players
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — declared before any application imports
// ============================================================================

vi.mock("@shared/schema", () => ({
  games: { _table: "games", id: { name: "id" } },
  gameTurns: {
    _table: "gameTurns",
    id: { name: "id" },
    gameId: { name: "gameId" },
    playerId: { name: "playerId" },
    turnType: { name: "turnType" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
  and: (...conditions: any[]) => ({ _op: "and", conditions }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: any[]) => ({ _sql: true, strings }),
    { raw: (s: string) => ({ _sql: true, raw: s }) }
  ),
}));

vi.mock("../../routes/games-shared", () => ({
  TURN_DEADLINE_MS: 24 * 60 * 60 * 1000,
  SKATE_LETTERS: "SKATE",
  isGameOver: (p1Letters: string, p2Letters: string) => {
    if (p1Letters.length >= 5) return { over: true, loserId: "player1" };
    if (p2Letters.length >= 5) return { over: true, loserId: "player2" };
    return { over: false, loserId: null };
  },
}));

// ============================================================================
// Import after mocks
// ============================================================================

const { setterBail } = await import("../../services/gameTurnService");

// ============================================================================
// Helpers
// ============================================================================

/**
 * Creates a mock transaction tx object with chainable select/update/execute.
 *
 * selectResults: array of arrays — each tx.select() call consumes the next entry.
 * updateResults: array of arrays — each tx.update() call consumes the next entry.
 */
function createTx(
  config: {
    selectResults?: any[][];
    updateResults?: any[][];
  } = {}
) {
  const tx: any = {};
  let selectIdx = 0;
  let updateIdx = 0;

  tx.execute = vi.fn().mockResolvedValue(undefined);

  tx.select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation(() => {
      const idx = selectIdx++;
      const result = config.selectResults?.[idx] || [];
      return {
        where: vi.fn().mockImplementation(() => ({
          limit: vi.fn().mockResolvedValue(result),
          then: (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
        })),
        then: (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
      };
    }),
  }));

  tx.update = vi.fn().mockImplementation(() => ({
    set: vi.fn().mockImplementation(() => {
      const idx = updateIdx++;
      const result = config.updateResults?.[idx] || [];
      return {
        where: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue(result),
          then: (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
        })),
      };
    }),
  }));

  return tx;
}

// ============================================================================
// Shared fixtures
// ============================================================================

const baseActiveGame = {
  id: "game-1",
  player1Id: "user-1",
  player2Id: "user-2",
  player1Name: "Alice",
  player2Name: "Bob",
  status: "active",
  currentTurn: "user-1",
  turnPhase: "set_trick",
  offensivePlayerId: "user-1",
  defensivePlayerId: "user-2",
  player1Letters: "",
  player2Letters: "",
};

// ============================================================================
// Tests
// ============================================================================

describe("setterBail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Validation errors
  // ==========================================================================

  describe("validation errors", () => {
    it("returns 404 when game is not found", async () => {
      const tx = createTx({ selectResults: [[]] });

      const result = await setterBail(tx, "game-1", "user-1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(404);
        expect(result.error).toBe("Game not found");
      }
    });

    it("returns 400 when game is not active", async () => {
      const tx = createTx({
        selectResults: [[{ ...baseActiveGame, status: "completed" }]],
      });

      const result = await setterBail(tx, "game-1", "user-1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.error).toBe("Game is not active");
      }
    });

    it("returns 403 when player is not the offensive player", async () => {
      const tx = createTx({
        selectResults: [[{ ...baseActiveGame }]],
      });

      // user-2 is the defensive player, not the setter
      const result = await setterBail(tx, "game-1", "user-2");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(403);
        expect(result.error).toBe("Only the setter can declare a bail");
      }
    });

    it("returns 400 when turnPhase is not set_trick", async () => {
      const tx = createTx({
        selectResults: [[{ ...baseActiveGame, turnPhase: "respond_trick" }]],
      });

      const result = await setterBail(tx, "game-1", "user-1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.error).toBe("Can only bail during set trick phase");
      }
    });

    it("returns 400 when turnPhase is judge", async () => {
      const tx = createTx({
        selectResults: [[{ ...baseActiveGame, turnPhase: "judge" }]],
      });

      const result = await setterBail(tx, "game-1", "user-1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.error).toBe("Can only bail during set trick phase");
      }
    });
  });

  // ==========================================================================
  // Success: game continues
  // ==========================================================================

  describe("success — game continues", () => {
    it("assigns letter to setter (player1) and swaps roles", async () => {
      const updatedGame = {
        ...baseActiveGame,
        player1Letters: "S",
        player2Letters: "",
        currentTurn: "user-2",
        turnPhase: "set_trick",
        offensivePlayerId: "user-2",
        defensivePlayerId: "user-1",
      };

      const tx = createTx({
        selectResults: [[{ ...baseActiveGame }]],
        updateResults: [[updatedGame]],
      });

      const result = await setterBail(tx, "game-1", "user-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.game).toEqual(updatedGame);
        expect(result.gameOver).toBe(false);
        expect(result.message).toBe("You bailed your own trick. Letter earned. Roles swap.");
      }
    });

    it("assigns letter to setter (player2) when player2 is offensive", async () => {
      const game = {
        ...baseActiveGame,
        offensivePlayerId: "user-2",
        defensivePlayerId: "user-1",
        currentTurn: "user-2",
      };

      const updatedGame = {
        ...game,
        player1Letters: "",
        player2Letters: "S",
        currentTurn: "user-1",
        turnPhase: "set_trick",
        offensivePlayerId: "user-1",
        defensivePlayerId: "user-2",
      };

      const tx = createTx({
        selectResults: [[game]],
        updateResults: [[updatedGame]],
      });

      const result = await setterBail(tx, "game-1", "user-2");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.game).toEqual(updatedGame);
        expect(result.gameOver).toBe(false);
      }
    });

    it("appends the correct next SKATE letter based on existing letters", async () => {
      const game = {
        ...baseActiveGame,
        player1Letters: "SK",
      };

      const updatedGame = {
        ...game,
        player1Letters: "SKA",
        currentTurn: "user-2",
        offensivePlayerId: "user-2",
        defensivePlayerId: "user-1",
      };

      const tx = createTx({
        selectResults: [[game]],
        updateResults: [[updatedGame]],
      });

      const result = await setterBail(tx, "game-1", "user-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.game.player1Letters).toBe("SKA");
        expect(result.gameOver).toBe(false);
      }
    });

    it("sends your_turn notification to the new offensive player", async () => {
      const updatedGame = {
        ...baseActiveGame,
        player1Letters: "S",
        currentTurn: "user-2",
        offensivePlayerId: "user-2",
        defensivePlayerId: "user-1",
      };

      const tx = createTx({
        selectResults: [[{ ...baseActiveGame }]],
        updateResults: [[updatedGame]],
      });

      const result = await setterBail(tx, "game-1", "user-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.notifications).toHaveLength(1);
        // isPlayer1=true so opponentName = game.player1Name = "Alice"
        // (the setter's name, telling the new offensive player who they face)
        expect(result.notifications[0]).toEqual({
          playerId: "user-2",
          type: "your_turn",
          data: {
            gameId: "game-1",
            opponentName: "Alice",
          },
        });
      }
    });

    it("uses opponent name from game data for notifications", async () => {
      const game = {
        ...baseActiveGame,
        offensivePlayerId: "user-2",
        defensivePlayerId: "user-1",
        currentTurn: "user-2",
      };

      const updatedGame = {
        ...game,
        player2Letters: "S",
        currentTurn: "user-1",
        offensivePlayerId: "user-1",
        defensivePlayerId: "user-2",
      };

      const tx = createTx({
        selectResults: [[game]],
        updateResults: [[updatedGame]],
      });

      const result = await setterBail(tx, "game-1", "user-2");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.notifications).toHaveLength(1);
        // isPlayer1 = false (user-2 !== player1Id), so opponentName = game.player2Name = "Bob"
        expect(result.notifications[0].data.opponentName).toBe("Bob");
      }
    });

    it("defaults opponent name to 'Opponent' when name is null", async () => {
      const game = {
        ...baseActiveGame,
        player1Name: null,
      };

      const updatedGame = {
        ...game,
        player1Letters: "S",
        currentTurn: "user-2",
        offensivePlayerId: "user-2",
        defensivePlayerId: "user-1",
      };

      const tx = createTx({
        selectResults: [[game]],
        updateResults: [[updatedGame]],
      });

      const result = await setterBail(tx, "game-1", "user-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        // isPlayer1 = true, so opponentName = game.player1Name || "Opponent"
        // player1Name is null, so it defaults to "Opponent"
        expect(result.notifications[0].data.opponentName).toBe("Opponent");
      }
    });

    it("calls tx.execute for row locking", async () => {
      const updatedGame = { ...baseActiveGame, player1Letters: "S" };
      const tx = createTx({
        selectResults: [[{ ...baseActiveGame }]],
        updateResults: [[updatedGame]],
      });

      await setterBail(tx, "game-1", "user-1");

      expect(tx.execute).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Success: game over
  // ==========================================================================

  describe("success — game over", () => {
    it("ends game when player1 setter reaches SKATE", async () => {
      const game = {
        ...baseActiveGame,
        player1Letters: "SKAT",
      };

      const completedGame = {
        ...game,
        player1Letters: "SKATE",
        status: "completed",
        winnerId: "user-2",
        turnPhase: null,
        currentTurn: null,
        deadlineAt: null,
      };

      const tx = createTx({
        selectResults: [[game]],
        updateResults: [[completedGame]],
      });

      const result = await setterBail(tx, "game-1", "user-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.gameOver).toBe(true);
        expect(result.winnerId).toBe("user-2");
        expect(result.game).toEqual(completedGame);
        expect(result.message).toBe("You bailed your own trick. Game over.");
      }
    });

    it("ends game when player2 setter reaches SKATE", async () => {
      const game = {
        ...baseActiveGame,
        offensivePlayerId: "user-2",
        defensivePlayerId: "user-1",
        currentTurn: "user-2",
        player2Letters: "SKAT",
      };

      const completedGame = {
        ...game,
        player2Letters: "SKATE",
        status: "completed",
        winnerId: "user-1",
        turnPhase: null,
        currentTurn: null,
        deadlineAt: null,
      };

      const tx = createTx({
        selectResults: [[game]],
        updateResults: [[completedGame]],
      });

      const result = await setterBail(tx, "game-1", "user-2");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.gameOver).toBe(true);
        expect(result.winnerId).toBe("user-1");
        expect(result.game).toEqual(completedGame);
      }
    });

    it("sends game_over notifications to both players", async () => {
      const game = {
        ...baseActiveGame,
        player1Letters: "SKAT",
      };

      const completedGame = {
        ...game,
        player1Letters: "SKATE",
        status: "completed",
        winnerId: "user-2",
      };

      const tx = createTx({
        selectResults: [[game]],
        updateResults: [[completedGame]],
      });

      const result = await setterBail(tx, "game-1", "user-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.notifications).toHaveLength(2);

        const player1Notification = result.notifications.find((n) => n.playerId === "user-1");
        const player2Notification = result.notifications.find((n) => n.playerId === "user-2");

        expect(player1Notification).toEqual({
          playerId: "user-1",
          type: "game_over",
          data: {
            gameId: "game-1",
            winnerId: "user-2",
            youWon: false,
          },
        });

        expect(player2Notification).toEqual({
          playerId: "user-2",
          type: "game_over",
          data: {
            gameId: "game-1",
            winnerId: "user-2",
            youWon: true,
          },
        });
      }
    });

    it("loser notification has youWon=false and winner notification has youWon=true", async () => {
      const game = {
        ...baseActiveGame,
        offensivePlayerId: "user-2",
        defensivePlayerId: "user-1",
        currentTurn: "user-2",
        player2Letters: "SKAT",
      };

      const completedGame = {
        ...game,
        player2Letters: "SKATE",
        status: "completed",
        winnerId: "user-1",
      };

      const tx = createTx({
        selectResults: [[game]],
        updateResults: [[completedGame]],
      });

      const result = await setterBail(tx, "game-1", "user-2");

      expect(result.ok).toBe(true);
      if (result.ok) {
        const loserNotif = result.notifications.find((n) => n.playerId === "user-2");
        const winnerNotif = result.notifications.find((n) => n.playerId === "user-1");

        expect(loserNotif!.data.youWon).toBe(false);
        expect(winnerNotif!.data.youWon).toBe(true);
        expect(loserNotif!.data.winnerId).toBe("user-1");
        expect(winnerNotif!.data.winnerId).toBe("user-1");
      }
    });
  });
});
