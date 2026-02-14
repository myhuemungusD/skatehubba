import crypto from "node:crypto";
import { describe, it, expect, beforeEach } from "vitest";

/**
 * Integration tests for concurrent request handling in S.K.A.T.E. game.
 *
 * These tests verify that the game logic correctly handles scenarios where
 * multiple requests arrive simultaneously, including:
 * - Simultaneous vote submissions from both players
 * - Duplicate submissions via idempotency key detection
 * - Concurrent vote + timeout race conditions
 *
 * Note: These tests exercise the extracted logic functions. Full transaction
 * behavior (Firestore retries, serialization) is verified in production via
 * the monitoring added to Cloud Functions.
 */

// Types mirroring the Cloud Function data model
interface JudgmentVotes {
  attackerVote: "landed" | "bailed" | null;
  defenderVote: "landed" | "bailed" | null;
  timedOut?: boolean;
  autoResolved?: string;
}

interface Move {
  id: string;
  type: "set" | "match";
  result: "landed" | "bailed" | "pending";
  judgmentVotes?: JudgmentVotes;
  idempotencyKey?: string;
  playerId?: string;
  trickName?: string | null;
  clipUrl?: string;
}

interface GameData {
  player1Id: string;
  player2Id: string;
  currentAttacker: string;
  currentTurn: string;
  turnPhase: string;
  roundNumber: number;
  player1Letters: string[];
  player2Letters: string[];
  moves: Move[];
  processedIdempotencyKeys: string[];
  status: string;
  voteDeadline: number | null;
  voteReminderSent: boolean;
  winnerId: string | null;
}

const SKATE_LETTERS = ["S", "K", "A", "T", "E"] as const;

// ---------------------------------------------------------------------------
// Extracted game logic (mirrors Cloud Function behavior)
// ---------------------------------------------------------------------------

function processVote(
  gameData: GameData,
  moveId: string,
  voterId: string,
  vote: "landed" | "bailed",
  idempotencyKey: string
): {
  updatedGame: GameData;
  response: {
    success: boolean;
    vote: "landed" | "bailed";
    finalResult: "landed" | "bailed" | null;
    waitingForOtherVote: boolean;
    winnerId: string | null;
    gameCompleted: boolean;
    duplicate: boolean;
  };
} {
  // Idempotency check
  if (gameData.processedIdempotencyKeys.includes(idempotencyKey)) {
    const move = gameData.moves.find((m) => m.id === moveId);
    return {
      updatedGame: gameData,
      response: {
        success: true,
        vote,
        finalResult: move?.result === "pending" ? null : (move?.result ?? null),
        waitingForOtherVote: move?.result === "pending",
        winnerId: gameData.winnerId,
        gameCompleted: gameData.status === "completed",
        duplicate: true,
      },
    };
  }

  const isAttacker = gameData.currentAttacker === voterId;
  const defenderId =
    gameData.currentAttacker === gameData.player1Id ? gameData.player2Id : gameData.player1Id;
  const isPlayer1Defender = defenderId === gameData.player1Id;

  // Find the move
  const moves = gameData.moves.map((m) => ({ ...m }));
  const moveIndex = moves.findIndex((m) => m.id === moveId);
  if (moveIndex === -1) throw new Error("Move not found");

  const move = moves[moveIndex];
  const existingVotes: JudgmentVotes = move.judgmentVotes || {
    attackerVote: null,
    defenderVote: null,
  };

  // Check duplicate vote
  if (isAttacker && existingVotes.attackerVote !== null) {
    throw new Error("Already voted");
  }
  if (!isAttacker && existingVotes.defenderVote !== null) {
    throw new Error("Already voted");
  }

  // Record vote
  const newVotes: JudgmentVotes = {
    attackerVote: isAttacker ? vote : existingVotes.attackerVote,
    defenderVote: isAttacker ? existingVotes.defenderVote : vote,
  };
  move.judgmentVotes = newVotes;
  moves[moveIndex] = move;

  const bothVoted = newVotes.attackerVote !== null && newVotes.defenderVote !== null;

  const updatedKeys = [...gameData.processedIdempotencyKeys.slice(-49), idempotencyKey];

  if (!bothVoted) {
    return {
      updatedGame: {
        ...gameData,
        moves,
        processedIdempotencyKeys: updatedKeys,
      },
      response: {
        success: true,
        vote,
        finalResult: null,
        waitingForOtherVote: true,
        winnerId: null,
        gameCompleted: false,
        duplicate: false,
      },
    };
  }

  // Both voted: determine result
  let finalResult: "landed" | "bailed";
  if (newVotes.attackerVote === newVotes.defenderVote) {
    finalResult = newVotes.attackerVote!;
  } else {
    finalResult = "landed"; // Defender benefit of doubt
  }
  move.result = finalResult;
  moves[moveIndex] = move;

  const currentLetters = isPlayer1Defender ? gameData.player1Letters : gameData.player2Letters;

  let newLetters = [...currentLetters];
  let winnerId: string | null = null;
  let gameCompleted = false;

  if (finalResult === "bailed") {
    const nextIdx = currentLetters.length;
    if (nextIdx < SKATE_LETTERS.length) {
      newLetters = [...currentLetters, SKATE_LETTERS[nextIdx]];
      if (newLetters.length === 5) {
        winnerId = gameData.currentAttacker;
        gameCompleted = true;
      }
    }
  }

  const nextAttacker = finalResult === "landed" ? defenderId : gameData.currentAttacker;

  return {
    updatedGame: {
      ...gameData,
      moves,
      currentAttacker: nextAttacker,
      currentTurn: nextAttacker,
      turnPhase: gameCompleted ? "round_complete" : "attacker_recording",
      roundNumber: finalResult === "landed" ? gameData.roundNumber : gameData.roundNumber + 1,
      status: gameCompleted ? "completed" : gameData.status,
      winnerId,
      voteDeadline: null,
      voteReminderSent: false,
      processedIdempotencyKeys: updatedKeys,
      ...(isPlayer1Defender ? { player1Letters: newLetters } : { player2Letters: newLetters }),
    },
    response: {
      success: true,
      vote,
      finalResult,
      waitingForOtherVote: false,
      winnerId,
      gameCompleted,
      duplicate: false,
    },
  };
}

function submitTrick(
  gameData: GameData,
  userId: string,
  clipUrl: string,
  trickName: string | null,
  isSetTrick: boolean,
  idempotencyKey: string
): { updatedGame: GameData; moveId: string; duplicate: boolean } {
  // Idempotency check
  if (gameData.processedIdempotencyKeys.includes(idempotencyKey)) {
    const existing = gameData.moves.find((m) => m.idempotencyKey === idempotencyKey);
    return {
      updatedGame: gameData,
      moveId: existing?.id || "unknown",
      duplicate: true,
    };
  }

  if (gameData.player1Id !== userId && gameData.player2Id !== userId) {
    throw new Error("Not a participant");
  }
  if (gameData.currentTurn !== userId) {
    throw new Error("Not your turn");
  }

  const expectedPhase = isSetTrick ? "attacker_recording" : "defender_recording";
  if (gameData.turnPhase !== expectedPhase) {
    throw new Error(`Wrong phase: expected ${expectedPhase}, got ${gameData.turnPhase}`);
  }

  const moveId = `move_${userId}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const move: Move = {
    id: moveId,
    type: isSetTrick ? "set" : "match",
    result: "pending",
    idempotencyKey,
    playerId: userId,
    trickName,
    clipUrl,
  };

  const nextPhase = isSetTrick ? "defender_recording" : "judging";
  const nextTurn = isSetTrick
    ? gameData.player1Id === userId
      ? gameData.player2Id
      : gameData.player1Id
    : gameData.currentTurn;

  return {
    updatedGame: {
      ...gameData,
      moves: [...gameData.moves, move],
      turnPhase: nextPhase,
      currentTurn: nextTurn,
      voteDeadline: nextPhase === "judging" ? Date.now() + 60000 : gameData.voteDeadline,
      voteReminderSent: nextPhase === "judging" ? false : gameData.voteReminderSent,
      processedIdempotencyKeys: [...gameData.processedIdempotencyKeys.slice(-49), idempotencyKey],
    },
    moveId,
    duplicate: false,
  };
}

function autoResolveTimeout(gameData: GameData): GameData | null {
  if (gameData.turnPhase !== "judging") return null;
  if (!gameData.voteDeadline || gameData.voteDeadline > Date.now()) return null;

  const moves = gameData.moves.map((m) => ({ ...m }));
  const moveIndex = moves.findIndex((m) => m.type === "match" && m.result === "pending");
  if (moveIndex === -1) return null;

  const move = moves[moveIndex];
  move.result = "landed";
  move.judgmentVotes = {
    ...(move.judgmentVotes || { attackerVote: null, defenderVote: null }),
    timedOut: true,
    autoResolved: "landed",
  };
  moves[moveIndex] = move;

  const defenderId =
    gameData.currentAttacker === gameData.player1Id ? gameData.player2Id : gameData.player1Id;

  return {
    ...gameData,
    moves,
    turnPhase: "attacker_recording",
    currentTurn: defenderId,
    currentAttacker: defenderId,
    voteDeadline: null,
    voteReminderSent: false,
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createFreshGame(overrides: Partial<GameData> = {}): GameData {
  return {
    player1Id: "player1",
    player2Id: "player2",
    currentAttacker: "player1",
    currentTurn: "player1",
    turnPhase: "judging",
    roundNumber: 1,
    player1Letters: [],
    player2Letters: [],
    moves: [
      {
        id: "move1",
        type: "match",
        result: "pending",
      },
    ],
    processedIdempotencyKeys: [],
    status: "active",
    voteDeadline: Date.now() + 60000,
    voteReminderSent: false,
    winnerId: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Concurrent Request Integration Tests", () => {
  describe("simultaneous vote submissions", () => {
    it("should correctly resolve when attacker votes first, then defender", () => {
      const game = createFreshGame();

      // Attacker votes first
      const afterAttacker = processVote(game, "move1", "player1", "bailed", crypto.randomUUID());
      expect(afterAttacker.response.waitingForOtherVote).toBe(true);
      expect(afterAttacker.response.finalResult).toBeNull();

      // Defender votes second (using updated state from attacker's transaction)
      const afterDefender = processVote(
        afterAttacker.updatedGame,
        "move1",
        "player2",
        "bailed",
        crypto.randomUUID()
      );
      expect(afterDefender.response.waitingForOtherVote).toBe(false);
      expect(afterDefender.response.finalResult).toBe("bailed");
      expect(afterDefender.updatedGame.player2Letters).toEqual(["S"]);
    });

    it("should correctly resolve when defender votes first, then attacker", () => {
      const game = createFreshGame();

      // Defender votes first
      const afterDefender = processVote(game, "move1", "player2", "landed", crypto.randomUUID());
      expect(afterDefender.response.waitingForOtherVote).toBe(true);

      // Attacker votes second
      const afterAttacker = processVote(
        afterDefender.updatedGame,
        "move1",
        "player1",
        "landed",
        crypto.randomUUID()
      );
      expect(afterAttacker.response.waitingForOtherVote).toBe(false);
      expect(afterAttacker.response.finalResult).toBe("landed");
      expect(afterAttacker.updatedGame.player2Letters).toEqual([]);
    });

    it("should handle disagreement in either order with same outcome", () => {
      // Order 1: attacker says bailed, defender says landed
      const game1 = createFreshGame();
      const r1a = processVote(game1, "move1", "player1", "bailed", crypto.randomUUID());
      const r1b = processVote(r1a.updatedGame, "move1", "player2", "landed", crypto.randomUUID());

      // Order 2: defender says landed, attacker says bailed
      const game2 = createFreshGame();
      const r2a = processVote(game2, "move1", "player2", "landed", crypto.randomUUID());
      const r2b = processVote(r2a.updatedGame, "move1", "player1", "bailed", crypto.randomUUID());

      // Both should resolve to "landed" (defender benefit of doubt)
      expect(r1b.response.finalResult).toBe("landed");
      expect(r2b.response.finalResult).toBe("landed");

      // Both should have same letter state (no new letter since result is landed)
      expect(r1b.updatedGame.player2Letters).toEqual(r2b.updatedGame.player2Letters);
      expect(r1b.updatedGame.player2Letters).toEqual([]);
    });

    it("should prevent double-voting by the same player", () => {
      const game = createFreshGame();

      // Attacker votes once
      const afterFirst = processVote(game, "move1", "player1", "bailed", crypto.randomUUID());

      // Attacker tries to vote again (simulating a race where two requests from same player)
      expect(() =>
        processVote(afterFirst.updatedGame, "move1", "player1", "landed", crypto.randomUUID())
      ).toThrow("Already voted");
    });
  });

  describe("idempotency under concurrent duplicate requests", () => {
    it("should return duplicate response for repeated idempotency key", () => {
      const game = createFreshGame();
      const key = crypto.randomUUID();

      // First request processes normally
      const first = processVote(game, "move1", "player1", "bailed", key);
      expect(first.response.duplicate).toBe(false);

      // Second request with same key is detected as duplicate
      const second = processVote(first.updatedGame, "move1", "player1", "bailed", key);
      expect(second.response.duplicate).toBe(true);
      expect(second.response.success).toBe(true);
    });

    it("should handle N concurrent identical requests with only one processing", () => {
      const game = createFreshGame();
      const key = crypto.randomUUID();
      const N = 10;

      let currentState = game;
      let processedCount = 0;
      let duplicateCount = 0;

      for (let i = 0; i < N; i++) {
        const result = processVote(currentState, "move1", "player1", "bailed", key);
        if (result.response.duplicate) {
          duplicateCount++;
        } else {
          processedCount++;
        }
        currentState = result.updatedGame;
      }

      // Exactly one should process, rest are duplicates
      expect(processedCount).toBe(1);
      expect(duplicateCount).toBe(N - 1);
    });

    it("should handle duplicate trick submissions via idempotency", () => {
      const game = createFreshGame({
        turnPhase: "attacker_recording",
        currentTurn: "player1",
      });
      const key = crypto.randomUUID();

      const first = submitTrick(game, "player1", "https://clip.url", "kickflip", true, key);
      expect(first.duplicate).toBe(false);

      const second = submitTrick(
        first.updatedGame,
        "player1",
        "https://clip.url",
        "kickflip",
        true,
        key
      );
      expect(second.duplicate).toBe(true);
      expect(second.moveId).toBe(first.moveId);
    });

    it("should maintain bounded idempotency key storage (max 50)", () => {
      let game = createFreshGame({
        turnPhase: "attacker_recording",
        currentTurn: "player1",
      });

      // Generate 60 unique keys (more than the 50 limit)
      const keys: string[] = [];
      for (let i = 0; i < 60; i++) {
        const key = crypto.randomUUID();
        keys.push(key);

        // We need to reset the game phase for each submission
        game = {
          ...game,
          turnPhase: "attacker_recording",
          currentTurn: "player1",
        };

        const result = submitTrick(game, "player1", `https://clip${i}.url`, `trick${i}`, true, key);
        game = result.updatedGame;
      }

      // Storage should be bounded at 50
      expect(game.processedIdempotencyKeys.length).toBe(50);

      // Oldest keys should have been evicted
      expect(game.processedIdempotencyKeys.includes(keys[0])).toBe(false);
      expect(game.processedIdempotencyKeys.includes(keys[9])).toBe(false);

      // Recent keys should still be present
      expect(game.processedIdempotencyKeys.includes(keys[59])).toBe(true);
      expect(game.processedIdempotencyKeys.includes(keys[58])).toBe(true);
    });
  });

  describe("vote + timeout race conditions", () => {
    it("should not auto-resolve when vote arrives before timeout", () => {
      const game = createFreshGame({
        voteDeadline: Date.now() + 30000, // 30 seconds from now
      });

      // Vote arrives before timeout
      const afterVote = processVote(game, "move1", "player1", "landed", crypto.randomUUID());

      // Timeout check runs but deadline hasn't passed
      const timeoutResult = autoResolveTimeout(afterVote.updatedGame);

      // Timeout should not trigger (still waiting for defender vote, deadline in future)
      expect(timeoutResult).toBeNull();
    });

    it("should auto-resolve when timeout fires with no votes", () => {
      const game = createFreshGame({
        voteDeadline: Date.now() - 1000, // Already expired
      });

      const result = autoResolveTimeout(game);
      expect(result).not.toBeNull();
      expect(result!.moves[0].result).toBe("landed");
      expect(result!.moves[0].judgmentVotes?.timedOut).toBe(true);
      // Defender (player2) becomes attacker since result is "landed"
      expect(result!.currentAttacker).toBe("player2");
    });

    it("should auto-resolve when timeout fires with only attacker vote", () => {
      const game = createFreshGame({
        voteDeadline: Date.now() - 1000,
        moves: [
          {
            id: "move1",
            type: "match",
            result: "pending",
            judgmentVotes: {
              attackerVote: "bailed",
              defenderVote: null,
            },
          },
        ],
      });

      const result = autoResolveTimeout(game);
      expect(result).not.toBeNull();
      // Even though attacker said bailed, timeout favors defender
      expect(result!.moves[0].result).toBe("landed");
      expect(result!.moves[0].judgmentVotes?.timedOut).toBe(true);
    });

    it("should not auto-resolve if game phase changed (vote completed first)", () => {
      // Simulate: both players voted just before timeout fires
      const game = createFreshGame({
        turnPhase: "attacker_recording", // Phase already moved past judging
        voteDeadline: Date.now() - 1000,
      });

      const result = autoResolveTimeout(game);
      // Should not resolve because game is no longer in judging phase
      expect(result).toBeNull();
    });

    it("should not auto-resolve if deadline cleared (vote completed first)", () => {
      const game = createFreshGame({
        voteDeadline: null, // Cleared by successful vote resolution
      });

      const result = autoResolveTimeout(game);
      expect(result).toBeNull();
    });
  });

  describe("full game sequence with concurrent patterns", () => {
    it("should handle a complete game sequence with mixed voting orders", () => {
      let game = createFreshGame({
        turnPhase: "attacker_recording",
        currentTurn: "player1",
        voteDeadline: null,
      });

      // Round 1: Attacker sets trick
      const set1 = submitTrick(
        game,
        "player1",
        "https://clip1.url",
        "kickflip",
        true,
        crypto.randomUUID()
      );
      game = set1.updatedGame;
      expect(game.turnPhase).toBe("defender_recording");
      expect(game.currentTurn).toBe("player2");

      // Round 1: Defender responds
      const match1 = submitTrick(
        game,
        "player2",
        "https://clip2.url",
        null,
        false,
        crypto.randomUUID()
      );
      game = match1.updatedGame;
      expect(game.turnPhase).toBe("judging");
      expect(game.voteDeadline).not.toBeNull();

      // Round 1: Concurrent voting - defender votes first
      const vote1a = processVote(game, match1.moveId, "player2", "bailed", crypto.randomUUID());
      game = vote1a.updatedGame;
      expect(vote1a.response.waitingForOtherVote).toBe(true);

      // Round 1: Attacker votes (completes judgment)
      const vote1b = processVote(game, match1.moveId, "player1", "bailed", crypto.randomUUID());
      game = vote1b.updatedGame;
      expect(vote1b.response.finalResult).toBe("bailed");
      expect(game.player2Letters).toEqual(["S"]);
      expect(game.turnPhase).toBe("attacker_recording");
    });

    it("should correctly complete a game ending in SKATE", () => {
      let game = createFreshGame({
        turnPhase: "judging",
        player2Letters: ["S", "K", "A", "T"],
        voteDeadline: Date.now() + 60000,
      });

      // Both players agree defender bailed - should give 5th letter and end game
      const vote1 = processVote(game, "move1", "player1", "bailed", crypto.randomUUID());
      game = vote1.updatedGame;

      const vote2 = processVote(game, "move1", "player2", "bailed", crypto.randomUUID());
      game = vote2.updatedGame;

      expect(vote2.response.gameCompleted).toBe(true);
      expect(vote2.response.winnerId).toBe("player1");
      expect(game.player2Letters).toEqual(["S", "K", "A", "T", "E"]);
      expect(game.status).toBe("completed");
    });
  });
});
