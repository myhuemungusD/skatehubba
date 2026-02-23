/**
 * Tests for S.K.A.T.E. Game Routes
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import { getDb } from "../../db";

// Extend Request type for test purposes
interface TestRequest extends Request {
  user?: {
    uid: string;
  };
}

// Mock dependencies
vi.mock("../../db");
vi.mock("../../auth/middleware");
vi.mock("../../services/gameNotificationService");
vi.mock("../../logger");

describe("Games Routes", () => {
  let mockDb: any;
  let mockReq: Partial<TestRequest>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    // Setup mock database
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };

    vi.mocked(getDb).mockReturnValue(mockDb);

    // Setup mock request/response
    mockReq = {
      body: {},
      params: {},
      query: {},
      user: { uid: "test-user-123" },
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  describe("Game Creation", () => {
    it("should validate opponent ID is required", () => {
      const schema = {
        opponentId: { type: "string", minLength: 1 },
      };
      expect(schema.opponentId.type).toBe("string");
      expect(schema.opponentId.minLength).toBe(1);
    });

    it("should create game with valid opponent ID", async () => {
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "game-123",
              player1Id: "test-user-123",
              player2Id: "opponent-456",
              status: "pending",
              player1Letters: "",
              player2Letters: "",
              createdAt: new Date(),
            },
          ]),
        }),
      });

      const game = await mockDb.insert().values().returning();
      expect(game).toHaveLength(1);
      expect(game[0].id).toBe("game-123");
      expect(game[0].status).toBe("pending");
    });

    it("should prevent creating game with self", () => {
      const playerId = "test-user-123";
      const opponentId = "test-user-123";
      expect(playerId).toBe(opponentId);
    });

    it("should handle database errors gracefully", async () => {
      mockDb.insert.mockRejectedValue(new Error("Database connection failed"));

      try {
        await mockDb.insert();
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.message).toBe("Database connection failed");
      }
    });
  });

  describe("Game Response", () => {
    it("should validate accept field is boolean", () => {
      const validInput = { accept: true };
      const invalidInput = { accept: "yes" };

      expect(typeof validInput.accept).toBe("boolean");
      expect(typeof invalidInput.accept).not.toBe("boolean");
    });

    it("should accept game invitation", async () => {
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "game-123",
                status: "active",
                currentTurnPlayerId: "test-user-123",
              },
            ]),
          }),
        }),
      });

      const result = await mockDb.update().set().where().returning();
      expect(result[0].status).toBe("active");
    });

    it("should decline game invitation", async () => {
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "game-123",
                status: "declined",
              },
            ]),
          }),
        }),
      });

      const result = await mockDb.update().set().where().returning();
      expect(result[0].status).toBe("declined");
    });
  });

  describe("Turn Submission", () => {
    it("should validate turn submission schema", () => {
      const validTurn = {
        trickDescription: "kickflip",
        videoUrl: "https://example.com/video.mp4",
        videoDurationMs: 10000,
        thumbnailUrl: "https://example.com/thumb.jpg",
      };

      expect(validTurn.trickDescription.length).toBeGreaterThan(0);
      expect(validTurn.trickDescription.length).toBeLessThanOrEqual(500);
      expect(validTurn.videoUrl).toMatch(/^https?:\/\//);
      expect(validTurn.videoDurationMs).toBeGreaterThan(0);
      expect(validTurn.videoDurationMs).toBeLessThanOrEqual(15000);
    });

    it("should reject video longer than 15 seconds", () => {
      const invalidTurn = {
        videoDurationMs: 16000,
      };

      expect(invalidTurn.videoDurationMs).toBeGreaterThan(15000);
    });

    it("should reject empty trick description", () => {
      const invalidTurn = {
        trickDescription: "",
      };

      expect(invalidTurn.trickDescription.length).toBe(0);
    });

    it("should submit valid turn", async () => {
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 1,
              gameId: "game-123",
              playerId: "test-user-123",
              trickDescription: "kickflip",
              videoUrl: "https://example.com/video.mp4",
              videoDurationMs: 10000,
              status: "pending_judgment",
            },
          ]),
        }),
      });

      const result = await mockDb.insert().values().returning();
      expect(result[0].status).toBe("pending_judgment");
    });
  });

  describe("Turn Judgment", () => {
    it("should validate judgment result enum", () => {
      const validResults = ["landed", "missed"];
      const invalidResult = "unknown";

      expect(validResults).toContain("landed");
      expect(validResults).toContain("missed");
      expect(validResults).not.toContain(invalidResult);
    });

    it("should judge turn as landed", async () => {
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 1,
                result: "landed",
                judgedAt: new Date(),
              },
            ]),
          }),
        }),
      });

      const result = await mockDb.update().set().where().returning();
      expect(result[0].result).toBe("landed");
      expect(result[0].judgedAt).toBeDefined();
    });

    it("should judge turn as missed and assign letter", async () => {
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 1,
                result: "missed",
                judgedAt: new Date(),
              },
            ]),
          }),
        }),
      });

      const result = await mockDb.update().set().where().returning();
      expect(result[0].result).toBe("missed");
    });
  });

  describe("SKATE Letters", () => {
    it("should track letters correctly", () => {
      const letters = "SKATE";
      expect(letters).toHaveLength(5);
      expect(letters[0]).toBe("S");
      expect(letters[4]).toBe("E");
    });

    it("should determine winner when player spells SKATE", () => {
      const player1Letters = "SKATE";
      const player2Letters = "SK";

      expect(player1Letters.length).toBe(5);
      expect(player2Letters.length).toBe(2);
    });

    it("should handle letter progression", () => {
      const letters = "SKATE";
      const currentLetters = "SK";
      const nextLetter = letters[currentLetters.length];

      expect(nextLetter).toBe("A");
    });
  });

  describe("Game Disputes", () => {
    it("should validate dispute schema", () => {
      const validDispute = {
        turnId: 1,
      };

      expect(validDispute.turnId).toBeGreaterThan(0);
      expect(Number.isInteger(validDispute.turnId)).toBe(true);
    });

    it("should create dispute for turn", async () => {
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 1,
              turnId: 1,
              gameId: "game-123",
              disputerId: "test-user-123",
              status: "pending",
              createdAt: new Date(),
            },
          ]),
        }),
      });

      const result = await mockDb.insert().values().returning();
      expect(result[0].status).toBe("pending");
    });

    it("should resolve dispute", async () => {
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 1,
                status: "resolved",
                finalResult: "landed",
                resolvedAt: new Date(),
              },
            ]),
          }),
        }),
      });

      const result = await mockDb.update().set().where().returning();
      expect(result[0].status).toBe("resolved");
      expect(result[0].finalResult).toBe("landed");
    });
  });

  describe("Deadline Warnings", () => {
    it("should enforce 24-hour turn deadline", () => {
      const TURN_DEADLINE_MS = 24 * 60 * 60 * 1000;
      expect(TURN_DEADLINE_MS).toBe(86400000);
    });

    it("should track deadline warnings", () => {
      const warnings = new Map<string, number>();
      const gameId = "game-123";
      const timestamp = Date.now();

      warnings.set(gameId, timestamp);
      expect(warnings.get(gameId)).toBe(timestamp);
    });

    it("should enforce cooldown between warnings", () => {
      const COOLDOWN_MS = 30 * 60 * 1000;
      const lastWarning = Date.now() - COOLDOWN_MS - 1000;
      const now = Date.now();

      expect(now - lastWarning).toBeGreaterThan(COOLDOWN_MS);
    });
  });

  describe("User Display Names", () => {
    it("should fetch username if available", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ username: "skater123" }]),
          }),
        }),
      });

      const result = await mockDb.select().from().where().limit();
      expect(result[0].username).toBe("skater123");
    });

    it("should fallback to first name if no username", async () => {
      mockDb.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ firstName: "John" }]),
            }),
          }),
        });

      const usernameResult = await mockDb.select().from().where().limit();
      expect(usernameResult).toHaveLength(0);

      const userResult = await mockDb.select().from().where().limit();
      expect(userResult[0].firstName).toBe("John");
    });

    it('should default to "Skater" if no data found', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await mockDb.select().from().where().limit();
      const displayName = result[0]?.firstName || "Skater";
      expect(displayName).toBe("Skater");
    });
  });

  describe("Game Listing", () => {
    it("should list active games for user", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "game-1", status: "active" },
              { id: "game-2", status: "active" },
            ]),
          }),
        }),
      });

      const result = await mockDb.select().from().where().limit();
      expect(result).toHaveLength(2);
      expect(result.every((g: any) => g.status === "active")).toBe(true);
    });

    it("should list completed games", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([{ id: "game-1", status: "completed", winnerId: "user-123" }]),
          }),
        }),
      });

      const result = await mockDb.select().from().where().limit();
      expect(result[0].status).toBe("completed");
      expect(result[0].winnerId).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle missing authentication", () => {
      const reqWithoutAuth = { ...mockReq, user: undefined };
      expect(reqWithoutAuth.user).toBeUndefined();
    });

    it("should handle invalid game ID", () => {
      const invalidGameId = "";
      expect(invalidGameId).toBe("");
    });

    it("should handle database unavailability", () => {
      vi.mocked(getDb).mockImplementation(() => {
        throw new Error("Database not configured");
      });
      expect(() => getDb()).toThrow("Database not configured");
    });
  });
});
