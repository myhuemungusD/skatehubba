/**
 * Integration tests for Email Service
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  sendWelcomeEmail,
  sendPaymentReceiptEmail,
  sendWeeklyDigestEmail,
  sendGameEventEmail,
} from "../emailService";

// Mock Resend
vi.mock("resend", () => {
  return {
    Resend: class {
      emails = {
        send: vi.fn().mockResolvedValue({ id: "email-123" }),
      };
    },
  };
});

// Mock logger
vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock env
vi.mock("../../config/env", () => ({
  env: {
    RESEND_API_KEY: "test-key",
    NODE_ENV: "test",
    PRODUCTION_URL: "https://test.com",
  },
}));

describe("Email Service Integration", () => {
  describe("sendWelcomeEmail", () => {
    it("should send welcome email successfully", async () => {
      const result = await sendWelcomeEmail("test@example.com", "John");

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should include user name in email", async () => {
      const result = await sendWelcomeEmail("test@example.com", "Jane");

      expect(result.success).toBe(true);
    });

    it("should handle email addresses", async () => {
      const result = await sendWelcomeEmail("user+test@example.com", "User");

      expect(result.success).toBe(true);
    });
  });

  describe("sendPaymentReceiptEmail", () => {
    it("should send payment receipt", async () => {
      const result = await sendPaymentReceiptEmail("test@example.com", "John", {
        amount: "$9.99",
        tier: "Pro",
        date: "2024-01-01",
        transactionId: "tx_123",
      });

      expect(result.success).toBe(true);
    });

    it("should work without transaction ID", async () => {
      const result = await sendPaymentReceiptEmail("test@example.com", "Jane", {
        amount: "$19.99",
        tier: "Premium",
        date: "2024-01-01",
      });

      expect(result.success).toBe(true);
    });

    it("should handle different tiers", async () => {
      const proResult = await sendPaymentReceiptEmail("test@example.com", "User", {
        amount: "$9.99",
        tier: "Pro",
        date: "2024-01-01",
      });

      expect(proResult.success).toBe(true);
    });
  });

  describe("sendWeeklyDigestEmail", () => {
    it("should send digest with activity", async () => {
      const result = await sendWeeklyDigestEmail("test@example.com", "John", {
        gamesPlayed: 10,
        gamesWon: 6,
        spotsVisited: 3,
        pendingChallenges: 2,
      });

      expect(result.success).toBe(true);
    });

    it("should send digest with no activity", async () => {
      const result = await sendWeeklyDigestEmail("test@example.com", "Jane", {
        gamesPlayed: 0,
        gamesWon: 0,
        spotsVisited: 0,
        pendingChallenges: 0,
      });

      expect(result.success).toBe(true);
    });

    it("should handle pending challenges", async () => {
      const result = await sendWeeklyDigestEmail("test@example.com", "User", {
        gamesPlayed: 5,
        gamesWon: 3,
        spotsVisited: 2,
        pendingChallenges: 5,
      });

      expect(result.success).toBe(true);
    });

    it("should show appropriate CTA for pending challenges", async () => {
      const result = await sendWeeklyDigestEmail("test@example.com", "User", {
        gamesPlayed: 0,
        gamesWon: 0,
        spotsVisited: 0,
        pendingChallenges: 3,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("sendGameEventEmail", () => {
    it("should send challenge received email", async () => {
      const result = await sendGameEventEmail("test@example.com", "John", {
        type: "challenge_received",
        opponentName: "Jane",
        gameId: "game-123",
      });

      expect(result.success).toBe(true);
    });

    it("should send your turn email", async () => {
      const result = await sendGameEventEmail("test@example.com", "John", {
        type: "your_turn",
        opponentName: "Jane",
        gameId: "game-123",
      });

      expect(result.success).toBe(true);
    });

    it("should send game over (won) email", async () => {
      const result = await sendGameEventEmail("test@example.com", "John", {
        type: "game_over",
        opponentName: "Jane",
        gameId: "game-123",
        won: true,
      });

      expect(result.success).toBe(true);
    });

    it("should send game over (lost) email", async () => {
      const result = await sendGameEventEmail("test@example.com", "John", {
        type: "game_over",
        opponentName: "Jane",
        gameId: "game-123",
        won: false,
      });

      expect(result.success).toBe(true);
    });

    it("should handle missing opponent name", async () => {
      const result = await sendGameEventEmail("test@example.com", "John", {
        type: "challenge_received",
        gameId: "game-123",
      });

      expect(result.success).toBe(true);
    });
  });
});
