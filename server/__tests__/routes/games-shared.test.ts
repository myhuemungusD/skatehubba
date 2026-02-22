/**
 * @fileoverview Unit tests for games-shared module
 *
 * Covers:
 * - Constants: TURN_DEADLINE_MS, MAX_VIDEO_DURATION_MS, SKATE_LETTERS,
 *     deadlineWarningsSent, DEADLINE_WARNING_COOLDOWN_MS
 * - isGameOver: not over, player1 loses, player2 loses, partial letters, edge cases
 * - Validation schemas: createGameSchema, respondGameSchema, submitTurnSchema,
 *     judgeTurnSchema, disputeSchema, resolveDisputeSchema (valid + invalid input)
 * - getUserDisplayName re-export
 */

import { describe, it, expect, vi } from "vitest";

// =============================================================================
// Mocks — must be before imports
// =============================================================================

vi.mock("../../db", () => ({
  getDb: vi.fn(),
  getUserDisplayName: vi.fn().mockResolvedValue("TestUser"),
}));

vi.mock("../../config/constants", () => ({
  SKATE_LETTERS_TO_LOSE: 5,
}));

// =============================================================================
// Imports (dynamic to honour vi.mock hoisting)
// =============================================================================

const {
  TURN_DEADLINE_MS,
  MAX_VIDEO_DURATION_MS,
  SKATE_LETTERS,
  deadlineWarningsSent,
  DEADLINE_WARNING_COOLDOWN_MS,
  createGameSchema,
  respondGameSchema,
  submitTurnSchema,
  judgeTurnSchema,
  disputeSchema,
  resolveDisputeSchema,
  isGameOver,
  getUserDisplayName,
} = await import("../../routes/games-shared");

// =============================================================================
// Tests
// =============================================================================

describe("games-shared", () => {
  // ===========================================================================
  // Constants
  // ===========================================================================

  describe("constants", () => {
    it("TURN_DEADLINE_MS is 24 hours in ms", () => {
      expect(TURN_DEADLINE_MS).toBe(24 * 60 * 60 * 1000);
      expect(TURN_DEADLINE_MS).toBe(86_400_000);
    });

    it("MAX_VIDEO_DURATION_MS is 15 seconds", () => {
      expect(MAX_VIDEO_DURATION_MS).toBe(15_000);
    });

    it("SKATE_LETTERS is the string 'SKATE'", () => {
      expect(SKATE_LETTERS).toBe("SKATE");
      expect(SKATE_LETTERS).toHaveLength(5);
    });

    it("deadlineWarningsSent is a Map", () => {
      expect(deadlineWarningsSent).toBeInstanceOf(Map);
    });

    it("DEADLINE_WARNING_COOLDOWN_MS is 30 minutes in ms", () => {
      expect(DEADLINE_WARNING_COOLDOWN_MS).toBe(30 * 60 * 1000);
      expect(DEADLINE_WARNING_COOLDOWN_MS).toBe(1_800_000);
    });
  });

  // ===========================================================================
  // isGameOver
  // ===========================================================================

  describe("isGameOver", () => {
    it("returns not over when both players have no letters", () => {
      const result = isGameOver("", "");
      expect(result).toEqual({ over: false, loserId: null });
    });

    it("returns not over when players have partial letters", () => {
      const result = isGameOver("SK", "SKA");
      expect(result).toEqual({ over: false, loserId: null });
    });

    it("returns not over with 4 letters (one short)", () => {
      const result = isGameOver("SKAT", "S");
      expect(result).toEqual({ over: false, loserId: null });
    });

    it("returns not over when both have 4 letters", () => {
      const result = isGameOver("SKAT", "SKAT");
      expect(result).toEqual({ over: false, loserId: null });
    });

    it("returns player1 loses when player1 has exactly 5 letters", () => {
      const result = isGameOver("SKATE", "");
      expect(result).toEqual({ over: true, loserId: "player1" });
    });

    it("returns player1 loses when player1 has 5 letters and player2 has some", () => {
      const result = isGameOver("SKATE", "SK");
      expect(result).toEqual({ over: true, loserId: "player1" });
    });

    it("returns player2 loses when player2 has exactly 5 letters", () => {
      const result = isGameOver("", "SKATE");
      expect(result).toEqual({ over: true, loserId: "player2" });
    });

    it("returns player2 loses when player2 has 5 letters and player1 has some", () => {
      const result = isGameOver("SKA", "SKATE");
      expect(result).toEqual({ over: true, loserId: "player2" });
    });

    it("returns player1 loses when player1 has more than 5 letters (edge)", () => {
      const result = isGameOver("SKATEEE", "SK");
      expect(result).toEqual({ over: true, loserId: "player1" });
    });

    it("player1 checked first — if both have 5+, player1 is the loser", () => {
      const result = isGameOver("SKATE", "SKATE");
      expect(result).toEqual({ over: true, loserId: "player1" });
    });

    it("returns not over with single letter each", () => {
      const result = isGameOver("S", "S");
      expect(result).toEqual({ over: false, loserId: null });
    });
  });

  // ===========================================================================
  // getUserDisplayName re-export
  // ===========================================================================

  describe("getUserDisplayName", () => {
    it("is a function re-exported from the db module", () => {
      expect(typeof getUserDisplayName).toBe("function");
    });
  });

  // ===========================================================================
  // Validation Schemas
  // ===========================================================================

  describe("Validation Schemas", () => {
    // =========================================================================
    // createGameSchema
    // =========================================================================
    describe("createGameSchema", () => {
      it("accepts valid opponentId", () => {
        const result = createGameSchema.safeParse({ opponentId: "user-abc" });
        expect(result.success).toBe(true);
      });

      it("rejects missing opponentId", () => {
        const result = createGameSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      it("rejects empty opponentId", () => {
        const result = createGameSchema.safeParse({ opponentId: "" });
        expect(result.success).toBe(false);
      });

      it("rejects non-string opponentId", () => {
        const result = createGameSchema.safeParse({ opponentId: 123 });
        expect(result.success).toBe(false);
      });
    });

    // =========================================================================
    // respondGameSchema
    // =========================================================================
    describe("respondGameSchema", () => {
      it("accepts accept: true", () => {
        const result = respondGameSchema.safeParse({ accept: true });
        expect(result.success).toBe(true);
      });

      it("accepts accept: false", () => {
        const result = respondGameSchema.safeParse({ accept: false });
        expect(result.success).toBe(true);
      });

      it("rejects non-boolean accept", () => {
        const result = respondGameSchema.safeParse({ accept: "yes" });
        expect(result.success).toBe(false);
      });

      it("rejects missing accept", () => {
        const result = respondGameSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      it("rejects numeric accept", () => {
        const result = respondGameSchema.safeParse({ accept: 1 });
        expect(result.success).toBe(false);
      });
    });

    // =========================================================================
    // submitTurnSchema
    // =========================================================================
    describe("submitTurnSchema", () => {
      const validInput = {
        trickDescription: "Kickflip",
        videoUrl: "https://example.com/video.mp4",
        videoDurationMs: 5000,
      };

      it("accepts valid input without thumbnailUrl", () => {
        const result = submitTurnSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it("accepts valid input with thumbnailUrl", () => {
        const result = submitTurnSchema.safeParse({
          ...validInput,
          thumbnailUrl: "https://example.com/thumb.jpg",
        });
        expect(result.success).toBe(true);
      });

      it("rejects empty trickDescription", () => {
        const result = submitTurnSchema.safeParse({ ...validInput, trickDescription: "" });
        expect(result.success).toBe(false);
      });

      it("rejects trickDescription over 500 chars", () => {
        const result = submitTurnSchema.safeParse({
          ...validInput,
          trickDescription: "x".repeat(501),
        });
        expect(result.success).toBe(false);
      });

      it("accepts trickDescription at exactly 500 chars", () => {
        const result = submitTurnSchema.safeParse({
          ...validInput,
          trickDescription: "x".repeat(500),
        });
        expect(result.success).toBe(true);
      });

      it("rejects invalid videoUrl", () => {
        const result = submitTurnSchema.safeParse({ ...validInput, videoUrl: "not-a-url" });
        expect(result.success).toBe(false);
      });

      it("rejects videoDurationMs of 0", () => {
        const result = submitTurnSchema.safeParse({ ...validInput, videoDurationMs: 0 });
        expect(result.success).toBe(false);
      });

      it("rejects videoDurationMs exceeding MAX_VIDEO_DURATION_MS", () => {
        const result = submitTurnSchema.safeParse({ ...validInput, videoDurationMs: 16000 });
        expect(result.success).toBe(false);
      });

      it("accepts videoDurationMs at exactly MAX_VIDEO_DURATION_MS (15000)", () => {
        const result = submitTurnSchema.safeParse({ ...validInput, videoDurationMs: 15000 });
        expect(result.success).toBe(true);
      });

      it("accepts videoDurationMs of 1 (minimum)", () => {
        const result = submitTurnSchema.safeParse({ ...validInput, videoDurationMs: 1 });
        expect(result.success).toBe(true);
      });

      it("rejects non-integer videoDurationMs", () => {
        const result = submitTurnSchema.safeParse({ ...validInput, videoDurationMs: 5.5 });
        expect(result.success).toBe(false);
      });

      it("rejects negative videoDurationMs", () => {
        const result = submitTurnSchema.safeParse({ ...validInput, videoDurationMs: -1 });
        expect(result.success).toBe(false);
      });

      it("rejects missing required fields", () => {
        const result = submitTurnSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      it("rejects invalid thumbnailUrl", () => {
        const result = submitTurnSchema.safeParse({
          ...validInput,
          thumbnailUrl: "not-a-url",
        });
        expect(result.success).toBe(false);
      });

      it("rejects videoUrl over 500 chars", () => {
        const result = submitTurnSchema.safeParse({
          ...validInput,
          videoUrl: "https://example.com/" + "a".repeat(500),
        });
        expect(result.success).toBe(false);
      });
    });

    // =========================================================================
    // judgeTurnSchema
    // =========================================================================
    describe("judgeTurnSchema", () => {
      it("accepts result 'landed'", () => {
        const result = judgeTurnSchema.safeParse({ result: "landed" });
        expect(result.success).toBe(true);
      });

      it("accepts result 'missed'", () => {
        const result = judgeTurnSchema.safeParse({ result: "missed" });
        expect(result.success).toBe(true);
      });

      it("rejects invalid result value", () => {
        const result = judgeTurnSchema.safeParse({ result: "unknown" });
        expect(result.success).toBe(false);
      });

      it("rejects missing result", () => {
        const result = judgeTurnSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      it("rejects numeric result", () => {
        const result = judgeTurnSchema.safeParse({ result: 1 });
        expect(result.success).toBe(false);
      });
    });

    // =========================================================================
    // disputeSchema
    // =========================================================================
    describe("disputeSchema", () => {
      it("accepts valid positive integer turnId", () => {
        const result = disputeSchema.safeParse({ turnId: 42 });
        expect(result.success).toBe(true);
      });

      it("rejects zero turnId", () => {
        const result = disputeSchema.safeParse({ turnId: 0 });
        expect(result.success).toBe(false);
      });

      it("rejects negative turnId", () => {
        const result = disputeSchema.safeParse({ turnId: -1 });
        expect(result.success).toBe(false);
      });

      it("rejects non-integer turnId", () => {
        const result = disputeSchema.safeParse({ turnId: 3.5 });
        expect(result.success).toBe(false);
      });

      it("rejects missing turnId", () => {
        const result = disputeSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      it("rejects string turnId", () => {
        const result = disputeSchema.safeParse({ turnId: "42" });
        expect(result.success).toBe(false);
      });
    });

    // =========================================================================
    // resolveDisputeSchema
    // =========================================================================
    describe("resolveDisputeSchema", () => {
      it("accepts valid disputeId and finalResult 'landed'", () => {
        const result = resolveDisputeSchema.safeParse({ disputeId: 1, finalResult: "landed" });
        expect(result.success).toBe(true);
      });

      it("accepts valid disputeId and finalResult 'missed'", () => {
        const result = resolveDisputeSchema.safeParse({ disputeId: 5, finalResult: "missed" });
        expect(result.success).toBe(true);
      });

      it("rejects zero disputeId", () => {
        const result = resolveDisputeSchema.safeParse({ disputeId: 0, finalResult: "landed" });
        expect(result.success).toBe(false);
      });

      it("rejects negative disputeId", () => {
        const result = resolveDisputeSchema.safeParse({ disputeId: -1, finalResult: "landed" });
        expect(result.success).toBe(false);
      });

      it("rejects invalid finalResult", () => {
        const result = resolveDisputeSchema.safeParse({ disputeId: 1, finalResult: "draw" });
        expect(result.success).toBe(false);
      });

      it("rejects missing fields entirely", () => {
        const result = resolveDisputeSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      it("rejects missing finalResult", () => {
        const result = resolveDisputeSchema.safeParse({ disputeId: 1 });
        expect(result.success).toBe(false);
      });

      it("rejects missing disputeId", () => {
        const result = resolveDisputeSchema.safeParse({ finalResult: "landed" });
        expect(result.success).toBe(false);
      });

      it("rejects non-integer disputeId", () => {
        const result = resolveDisputeSchema.safeParse({ disputeId: 1.5, finalResult: "landed" });
        expect(result.success).toBe(false);
      });
    });
  });
});
