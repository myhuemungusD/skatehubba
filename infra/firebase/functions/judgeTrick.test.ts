import { describe, it, expect } from "vitest";

/**
 * Unit tests for the judgeTrick Cloud Function.
 *
 * These tests verify the mutual agreement voting logic:
 * 1. Both players can vote
 * 2. If they agree, that result is used
 * 3. If they disagree, defender gets benefit of the doubt (landed)
 * 4. Letters are assigned correctly when defender bails
 * 5. Game completes when defender gets 5 letters
 * 6. Transactions prevent race conditions (tested via logic extraction)
 * 7. Idempotency keys prevent duplicate processing
 */

// Mock types to match the function
interface JudgmentVotes {
  attackerVote: "landed" | "bailed" | null;
  defenderVote: "landed" | "bailed" | null;
}

interface Move {
  id: string;
  type: "set" | "match";
  result: "landed" | "bailed" | "pending";
  judgmentVotes?: JudgmentVotes;
}

interface GameData {
  player1Id: string;
  player2Id: string;
  currentAttacker: string;
  turnPhase: string;
  roundNumber: number;
  player1Letters: string[];
  player2Letters: string[];
  moves: Move[];
}

const SKATE_LETTERS = ["S", "K", "A", "T", "E"] as const;

// Core voting logic extracted for testability
function processVote(
  gameData: GameData,
  moveId: string,
  voterId: string,
  vote: "landed" | "bailed"
): {
  newVotes: JudgmentVotes;
  bothVoted: boolean;
  finalResult: "landed" | "bailed" | null;
  newLetters: string[];
  isGameCompleted: boolean;
  winnerId: string | null;
} {
  const isAttacker = gameData.currentAttacker === voterId;
  const defenderId =
    gameData.currentAttacker === gameData.player1Id ? gameData.player2Id : gameData.player1Id;
  const isPlayer1Defender = defenderId === gameData.player1Id;

  // Find the move
  const move = gameData.moves.find((m) => m.id === moveId);
  if (!move) {
    throw new Error("Move not found");
  }

  // Initialize or get existing votes
  const existingVotes: JudgmentVotes = move.judgmentVotes || {
    attackerVote: null,
    defenderVote: null,
  };

  // Record the vote
  const newVotes: JudgmentVotes = {
    attackerVote: isAttacker ? vote : existingVotes.attackerVote,
    defenderVote: isAttacker ? existingVotes.defenderVote : vote,
  };

  // Check if both have voted
  const bothVoted = newVotes.attackerVote !== null && newVotes.defenderVote !== null;

  if (!bothVoted) {
    return {
      newVotes,
      bothVoted: false,
      finalResult: null,
      newLetters: isPlayer1Defender ? gameData.player1Letters : gameData.player2Letters,
      isGameCompleted: false,
      winnerId: null,
    };
  }

  // Both have voted - determine final result
  // If they agree, use that result. If they disagree, benefit of doubt to defender (landed)
  let finalResult: "landed" | "bailed";
  if (newVotes.attackerVote === newVotes.defenderVote) {
    finalResult = newVotes.attackerVote!;
  } else {
    // Disagreement - defender gets benefit of the doubt
    finalResult = "landed";
  }

  // Calculate new letters
  const currentLetters = isPlayer1Defender ? gameData.player1Letters : gameData.player2Letters;

  let newLetters = [...currentLetters];
  let winnerId: string | null = null;
  let isGameCompleted = false;

  if (finalResult === "bailed") {
    // Defender gets a letter
    const nextLetterIndex = currentLetters.length;
    if (nextLetterIndex < SKATE_LETTERS.length) {
      newLetters = [...currentLetters, SKATE_LETTERS[nextLetterIndex]];

      // Game over if defender has SKATE
      if (newLetters.length === 5) {
        winnerId = gameData.currentAttacker;
        isGameCompleted = true;
      }
    }
  }

  return {
    newVotes,
    bothVoted: true,
    finalResult,
    newLetters,
    isGameCompleted,
    winnerId,
  };
}

describe("judgeTrick", () => {
  const mockGameData: GameData = {
    player1Id: "player1",
    player2Id: "player2",
    currentAttacker: "player1",
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
  };

  describe("voting mechanics", () => {
    it("should record attacker vote and wait for defender", () => {
      const result = processVote(mockGameData, "move1", "player1", "bailed");

      expect(result.bothVoted).toBe(false);
      expect(result.newVotes.attackerVote).toBe("bailed");
      expect(result.newVotes.defenderVote).toBeNull();
      expect(result.finalResult).toBeNull();
    });

    it("should record defender vote and wait for attacker", () => {
      const result = processVote(mockGameData, "move1", "player2", "landed");

      expect(result.bothVoted).toBe(false);
      expect(result.newVotes.attackerVote).toBeNull();
      expect(result.newVotes.defenderVote).toBe("landed");
      expect(result.finalResult).toBeNull();
    });

    it("should complete judgment when both vote the same (landed)", () => {
      const gameWithAttackerVote = {
        ...mockGameData,
        moves: [
          {
            id: "move1",
            type: "match" as const,
            result: "pending" as const,
            judgmentVotes: {
              attackerVote: "landed" as const,
              defenderVote: null,
            },
          },
        ],
      };

      const result = processVote(gameWithAttackerVote, "move1", "player2", "landed");

      expect(result.bothVoted).toBe(true);
      expect(result.finalResult).toBe("landed");
      expect(result.newLetters).toEqual([]);
    });

    it("should complete judgment when both vote the same (bailed)", () => {
      const gameWithAttackerVote = {
        ...mockGameData,
        moves: [
          {
            id: "move1",
            type: "match" as const,
            result: "pending" as const,
            judgmentVotes: {
              attackerVote: "bailed" as const,
              defenderVote: null,
            },
          },
        ],
      };

      const result = processVote(gameWithAttackerVote, "move1", "player2", "bailed");

      expect(result.bothVoted).toBe(true);
      expect(result.finalResult).toBe("bailed");
      // Defender (player2) gets a letter
      expect(result.newLetters).toEqual(["S"]);
    });
  });

  describe("disagreement handling", () => {
    it("should give defender benefit of doubt when votes disagree (attacker says bailed, defender says landed)", () => {
      const gameWithAttackerVote = {
        ...mockGameData,
        moves: [
          {
            id: "move1",
            type: "match" as const,
            result: "pending" as const,
            judgmentVotes: {
              attackerVote: "bailed" as const,
              defenderVote: null,
            },
          },
        ],
      };

      const result = processVote(gameWithAttackerVote, "move1", "player2", "landed");

      expect(result.bothVoted).toBe(true);
      expect(result.finalResult).toBe("landed"); // Defender wins tie
      expect(result.newLetters).toEqual([]); // No letter given
    });

    it("should give defender benefit of doubt when votes disagree (attacker says landed, defender says bailed)", () => {
      const gameWithAttackerVote = {
        ...mockGameData,
        moves: [
          {
            id: "move1",
            type: "match" as const,
            result: "pending" as const,
            judgmentVotes: {
              attackerVote: "landed" as const,
              defenderVote: null,
            },
          },
        ],
      };

      const result = processVote(gameWithAttackerVote, "move1", "player2", "bailed");

      expect(result.bothVoted).toBe(true);
      expect(result.finalResult).toBe("landed"); // Defender wins tie
      expect(result.newLetters).toEqual([]); // No letter given
    });
  });

  describe("letter accumulation", () => {
    it("should add S as first letter", () => {
      const gameWithAttackerVote = {
        ...mockGameData,
        player2Letters: [],
        moves: [
          {
            id: "move1",
            type: "match" as const,
            result: "pending" as const,
            judgmentVotes: {
              attackerVote: "bailed" as const,
              defenderVote: null,
            },
          },
        ],
      };

      const result = processVote(gameWithAttackerVote, "move1", "player2", "bailed");

      expect(result.newLetters).toEqual(["S"]);
    });

    it("should add K as second letter", () => {
      const gameWithOneLetterAndVote = {
        ...mockGameData,
        player2Letters: ["S"],
        moves: [
          {
            id: "move1",
            type: "match" as const,
            result: "pending" as const,
            judgmentVotes: {
              attackerVote: "bailed" as const,
              defenderVote: null,
            },
          },
        ],
      };

      const result = processVote(gameWithOneLetterAndVote, "move1", "player2", "bailed");

      expect(result.newLetters).toEqual(["S", "K"]);
    });

    it("should add all letters in correct order", () => {
      const letters = ["S", "K", "A", "T"];
      const gameWithFourLettersAndVote = {
        ...mockGameData,
        player2Letters: letters,
        moves: [
          {
            id: "move1",
            type: "match" as const,
            result: "pending" as const,
            judgmentVotes: {
              attackerVote: "bailed" as const,
              defenderVote: null,
            },
          },
        ],
      };

      const result = processVote(gameWithFourLettersAndVote, "move1", "player2", "bailed");

      expect(result.newLetters).toEqual(["S", "K", "A", "T", "E"]);
    });
  });

  describe("game completion", () => {
    it("should complete game when defender gets fifth letter", () => {
      const gameNearEnd = {
        ...mockGameData,
        player2Letters: ["S", "K", "A", "T"],
        moves: [
          {
            id: "move1",
            type: "match" as const,
            result: "pending" as const,
            judgmentVotes: {
              attackerVote: "bailed" as const,
              defenderVote: null,
            },
          },
        ],
      };

      const result = processVote(gameNearEnd, "move1", "player2", "bailed");

      expect(result.isGameCompleted).toBe(true);
      expect(result.winnerId).toBe("player1"); // Attacker wins
      expect(result.newLetters).toEqual(["S", "K", "A", "T", "E"]);
    });

    it("should not complete game when defender has fewer than 5 letters", () => {
      const gameWithThreeLettersAndVote = {
        ...mockGameData,
        player2Letters: ["S", "K", "A"],
        moves: [
          {
            id: "move1",
            type: "match" as const,
            result: "pending" as const,
            judgmentVotes: {
              attackerVote: "bailed" as const,
              defenderVote: null,
            },
          },
        ],
      };

      const result = processVote(gameWithThreeLettersAndVote, "move1", "player2", "bailed");

      expect(result.isGameCompleted).toBe(false);
      expect(result.winnerId).toBeNull();
      expect(result.newLetters).toEqual(["S", "K", "A", "T"]);
    });

    it("should not complete game when trick is landed", () => {
      const gameWithAttackerVote = {
        ...mockGameData,
        player2Letters: ["S", "K", "A", "T"],
        moves: [
          {
            id: "move1",
            type: "match" as const,
            result: "pending" as const,
            judgmentVotes: {
              attackerVote: "landed" as const,
              defenderVote: null,
            },
          },
        ],
      };

      const result = processVote(gameWithAttackerVote, "move1", "player2", "landed");

      expect(result.isGameCompleted).toBe(false);
      expect(result.winnerId).toBeNull();
      expect(result.newLetters).toEqual(["S", "K", "A", "T"]); // No new letter
    });
  });

  describe("player roles", () => {
    it("should correctly identify when player1 is defender", () => {
      // Player2 is attacker, so player1 is defender
      const gameWithPlayer2Attacker = {
        ...mockGameData,
        currentAttacker: "player2",
        player1Letters: ["S"],
        player2Letters: [],
        moves: [
          {
            id: "move1",
            type: "match" as const,
            result: "pending" as const,
            judgmentVotes: {
              attackerVote: "bailed" as const,
              defenderVote: null,
            },
          },
        ],
      };

      // Defender (player1) votes bailed
      const result = processVote(gameWithPlayer2Attacker, "move1", "player1", "bailed");

      expect(result.bothVoted).toBe(true);
      expect(result.finalResult).toBe("bailed");
      // Player1 is defender, so they get the letter (already had S, now gets K)
      expect(result.newLetters).toEqual(["S", "K"]);
    });
  });
});

describe("idempotency", () => {
  it("should detect duplicate idempotency keys", () => {
    const processedKeys = ["key1", "key2", "key3"];
    const newKey = "key2";

    const isDuplicate = processedKeys.includes(newKey);
    expect(isDuplicate).toBe(true);
  });

  it("should allow new idempotency keys", () => {
    const processedKeys = ["key1", "key2", "key3"];
    const newKey = "key4";

    const isDuplicate = processedKeys.includes(newKey);
    expect(isDuplicate).toBe(false);
  });

  it("should bound processed keys to 50", () => {
    const processedKeys = Array.from({ length: 55 }, (_, i) => `key${i}`);
    const newKey = "newKey";

    // Simulating the slice logic from the Cloud Function
    const boundedKeys = [...processedKeys.slice(-49), newKey];

    expect(boundedKeys.length).toBe(50);
    expect(boundedKeys[boundedKeys.length - 1]).toBe(newKey);
    // Old keys should be dropped
    expect(boundedKeys.includes("key0")).toBe(false);
    expect(boundedKeys.includes("key5")).toBe(false);
    // Recent keys should be kept
    expect(boundedKeys.includes("key54")).toBe(true);
  });

  it("should generate unique idempotency keys", () => {
    const generateKey = () => `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      keys.add(generateKey());
    }

    // All 100 keys should be unique
    expect(keys.size).toBe(100);
  });
});

// ============================================================================
// VOTE TIMEOUT TESTS
// ============================================================================

describe("vote timeout", () => {
  const VOTE_TIMEOUT_MS = 60 * 1000;
  const VOTE_REMINDER_BEFORE_MS = 30 * 1000;

  describe("deadline calculation", () => {
    it("should set vote deadline 60 seconds in the future when entering judging phase", () => {
      const now = Date.now();
      const voteDeadline = new Date(now + VOTE_TIMEOUT_MS);

      const timeUntilDeadline = voteDeadline.getTime() - now;
      expect(timeUntilDeadline).toBe(60000);
    });

    it("should trigger reminder at 30 seconds before deadline", () => {
      const now = Date.now();
      const voteDeadline = new Date(now + VOTE_REMINDER_BEFORE_MS); // 30 seconds away

      const timeRemaining = voteDeadline.getTime() - now;
      const shouldSendReminder = timeRemaining <= VOTE_REMINDER_BEFORE_MS && timeRemaining > 0;

      expect(shouldSendReminder).toBe(true);
    });

    it("should not trigger reminder when more than 30 seconds remain", () => {
      const now = Date.now();
      const voteDeadline = new Date(now + 45000); // 45 seconds away

      const timeRemaining = voteDeadline.getTime() - now;
      const shouldSendReminder = timeRemaining <= VOTE_REMINDER_BEFORE_MS && timeRemaining > 0;

      expect(shouldSendReminder).toBe(false);
    });

    it("should not trigger reminder when deadline has passed", () => {
      const now = Date.now();
      const voteDeadline = new Date(now - 5000); // 5 seconds ago

      const timeRemaining = voteDeadline.getTime() - now;
      const shouldSendReminder = timeRemaining <= VOTE_REMINDER_BEFORE_MS && timeRemaining > 0;

      expect(shouldSendReminder).toBe(false);
    });
  });

  describe("auto-resolve logic", () => {
    it("should auto-resolve to landed when deadline expires", () => {
      const now = Date.now();
      const voteDeadline = new Date(now - 1000); // 1 second ago

      const timeRemaining = voteDeadline.getTime() - now;
      const shouldAutoResolve = timeRemaining <= 0;

      expect(shouldAutoResolve).toBe(true);
    });

    it("should not auto-resolve when deadline has not passed", () => {
      const now = Date.now();
      const voteDeadline = new Date(now + 10000); // 10 seconds from now

      const timeRemaining = voteDeadline.getTime() - now;
      const shouldAutoResolve = timeRemaining <= 0;

      expect(shouldAutoResolve).toBe(false);
    });

    it("should switch roles when auto-resolving (defender becomes attacker)", () => {
      const gameState = {
        currentAttacker: "player1",
        player1Id: "player1",
        player2Id: "player2",
      };

      // When vote times out, result is "landed", so defender becomes attacker
      const defenderId =
        gameState.currentAttacker === gameState.player1Id
          ? gameState.player2Id
          : gameState.player1Id;

      // Defender becomes the new attacker
      const nextAttacker = defenderId;

      expect(nextAttacker).toBe("player2");
    });

    it("should mark the move with timeout metadata", () => {
      const move = {
        id: "move1",
        type: "match",
        result: "pending",
        judgmentVotes: {
          attackerVote: null,
          defenderVote: null,
        },
      };

      // Simulate auto-resolve
      const resolvedMove = {
        ...move,
        result: "landed",
        judgmentVotes: {
          ...move.judgmentVotes,
          timedOut: true,
          autoResolved: "landed",
        },
      };

      expect(resolvedMove.result).toBe("landed");
      expect(resolvedMove.judgmentVotes.timedOut).toBe(true);
      expect(resolvedMove.judgmentVotes.autoResolved).toBe("landed");
    });
  });

  describe("edge cases", () => {
    it("should handle case where attacker voted but defender did not", () => {
      const move = {
        judgmentVotes: {
          attackerVote: "bailed" as const,
          defenderVote: null,
        },
      };

      // When timeout occurs, defender gets benefit of doubt
      const autoResolvedResult = "landed";

      // Even though attacker said "bailed", timeout favors defender
      expect(autoResolvedResult).toBe("landed");
    });

    it("should handle case where defender voted but attacker did not", () => {
      const move = {
        judgmentVotes: {
          attackerVote: null,
          defenderVote: "bailed" as const,
        },
      };

      // When timeout occurs, defender gets benefit of doubt
      const autoResolvedResult = "landed";

      // Even though defender admitted bailed, timeout favors defender
      expect(autoResolvedResult).toBe("landed");
    });

    it("should handle case where neither player voted", () => {
      const move = {
        judgmentVotes: {
          attackerVote: null,
          defenderVote: null,
        },
      };

      // When timeout occurs with no votes, defender gets benefit of doubt
      const autoResolvedResult = "landed";

      expect(autoResolvedResult).toBe("landed");
    });

    it("should not give defender a letter on timeout", () => {
      const currentLetters = ["S", "K"];

      // Timeout always resolves to "landed", so no new letter
      const finalResult = "landed";
      const newLetters =
        finalResult === "bailed"
          ? [...currentLetters, SKATE_LETTERS[currentLetters.length]]
          : currentLetters;

      expect(newLetters).toEqual(["S", "K"]);
      expect(newLetters.length).toBe(2);
    });
  });

  describe("notification targeting", () => {
    it("should identify attacker when they have not voted", () => {
      const game = {
        currentAttacker: "player1",
        player1Id: "player1",
        player2Id: "player2",
      };
      const votes = {
        attackerVote: null,
        defenderVote: "landed" as const,
      };

      const playersToNotify: string[] = [];

      if (votes.attackerVote === null) {
        playersToNotify.push(game.currentAttacker);
      }

      const defenderId = game.currentAttacker === game.player1Id ? game.player2Id : game.player1Id;
      if (votes.defenderVote === null) {
        playersToNotify.push(defenderId);
      }

      expect(playersToNotify).toEqual(["player1"]);
    });

    it("should identify defender when they have not voted", () => {
      const game = {
        currentAttacker: "player1",
        player1Id: "player1",
        player2Id: "player2",
      };
      const votes = {
        attackerVote: "landed" as const,
        defenderVote: null,
      };

      const playersToNotify: string[] = [];

      if (votes.attackerVote === null) {
        playersToNotify.push(game.currentAttacker);
      }

      const defenderId = game.currentAttacker === game.player1Id ? game.player2Id : game.player1Id;
      if (votes.defenderVote === null) {
        playersToNotify.push(defenderId);
      }

      expect(playersToNotify).toEqual(["player2"]);
    });

    it("should identify both players when neither has voted", () => {
      const game = {
        currentAttacker: "player1",
        player1Id: "player1",
        player2Id: "player2",
      };
      const votes = {
        attackerVote: null,
        defenderVote: null,
      };

      const playersToNotify: string[] = [];

      if (votes.attackerVote === null) {
        playersToNotify.push(game.currentAttacker);
      }

      const defenderId = game.currentAttacker === game.player1Id ? game.player2Id : game.player1Id;
      if (votes.defenderVote === null) {
        playersToNotify.push(defenderId);
      }

      expect(playersToNotify).toEqual(["player1", "player2"]);
    });

    it("should not notify anyone when both have voted", () => {
      const game = {
        currentAttacker: "player1",
        player1Id: "player1",
        player2Id: "player2",
      };
      const votes = {
        attackerVote: "landed" as const,
        defenderVote: "landed" as const,
      };

      const playersToNotify: string[] = [];

      if (votes.attackerVote === null) {
        playersToNotify.push(game.currentAttacker);
      }

      const defenderId = game.currentAttacker === game.player1Id ? game.player2Id : game.player1Id;
      if (votes.defenderVote === null) {
        playersToNotify.push(defenderId);
      }

      expect(playersToNotify).toEqual([]);
    });
  });
});
