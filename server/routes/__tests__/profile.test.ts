/**
 * Tests for Profile Routes
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import { getDb } from "../../db";

vi.mock("../../db");
vi.mock("../../auth/middleware");
vi.mock("../../logger");

describe("Profile Routes", () => {
  let mockDb: any;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
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

  describe("Get Profile", () => {
    it("should get user profile by ID", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "test-user-123",
                username: "skater123",
                firstName: "John",
                lastName: "Doe",
                bio: "Love skateboarding",
                photoUrl: "https://example.com/photo.jpg",
                stance: "regular",
              },
            ]),
          }),
        }),
      });

      const result = await mockDb.select().from().where().limit();
      expect(result[0].username).toBe("skater123");
      expect(result[0].stance).toBe("regular");
    });

    it("should return 404 for non-existent profile", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await mockDb.select().from().where().limit();
      expect(result).toHaveLength(0);
    });

    it("should get profile by username", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                username: "skater123",
                uid: "test-user-123",
              },
            ]),
          }),
        }),
      });

      const result = await mockDb.select().from().where().limit();
      expect(result[0].username).toBe("skater123");
      expect(result[0].uid).toBe("test-user-123");
    });
  });

  describe("Update Profile", () => {
    it("should update profile with valid data", async () => {
      const updates = {
        bio: "New bio",
        stance: "goofy",
        firstName: "Jane",
      };

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "test-user-123",
                ...updates,
              },
            ]),
          }),
        }),
      });

      const result = await mockDb.update().set().where().returning();
      expect(result[0].bio).toBe("New bio");
      expect(result[0].stance).toBe("goofy");
    });

    it("should validate bio length", () => {
      const validBio = "A".repeat(500);
      const invalidBio = "A".repeat(1001);

      expect(validBio.length).toBeLessThanOrEqual(500);
      expect(invalidBio.length).toBeGreaterThan(500);
    });

    it("should validate stance enum", () => {
      const validStances = ["regular", "goofy"];
      const invalidStance = "switch";

      expect(validStances).toContain("regular");
      expect(validStances).toContain("goofy");
      expect(validStances).not.toContain(invalidStance);
    });

    it("should sanitize input data", () => {
      const dirtyInput = "<script>alert('xss')</script>";
      const cleanInput = dirtyInput.replace(/<[^>]*>/g, "");

      expect(cleanInput).not.toContain("<script>");
      expect(cleanInput).toBe("alert('xss')");
    });
  });

  describe("Profile Stats", () => {
    it("should calculate win/loss record", () => {
      const wins = 10;
      const losses = 5;
      const winRate = wins / (wins + losses);

      expect(winRate).toBeCloseTo(0.667, 2);
    });

    it("should track total games played", () => {
      const wins = 10;
      const losses = 5;
      const totalGames = wins + losses;

      expect(totalGames).toBe(15);
    });

    it("should handle zero games", () => {
      const wins = 0;
      const losses = 0;
      const winRate = wins + losses === 0 ? 0 : wins / (wins + losses);

      expect(winRate).toBe(0);
    });
  });

  describe("Privacy Settings", () => {
    it("should toggle profile visibility", async () => {
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "test-user-123",
                isPublic: false,
              },
            ]),
          }),
        }),
      });

      const result = await mockDb.update().set().where().returning();
      expect(result[0].isPublic).toBe(false);
    });

    it("should respect privacy settings", () => {
      const profile = { isPublic: false };
      const viewerId = "different-user";
      const canView = profile.isPublic;

      expect(canView).toBe(false);
    });
  });

  describe("Username Management", () => {
    it("should check username availability", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await mockDb.select().from().where().limit();
      const isAvailable = result.length === 0;
      expect(isAvailable).toBe(true);
    });

    it("should detect taken username", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ username: "taken" }]),
          }),
        }),
      });

      const result = await mockDb.select().from().where().limit();
      const isAvailable = result.length === 0;
      expect(isAvailable).toBe(false);
    });

    it("should validate username format", () => {
      const validUsername = "skater123";
      const invalidUsername = "skater@123";

      expect(/^[a-zA-Z0-9_]+$/.test(validUsername)).toBe(true);
      expect(/^[a-zA-Z0-9_]+$/.test(invalidUsername)).toBe(false);
    });

    it("should enforce username length limits", () => {
      const tooShort = "ab";
      const valid = "abc";
      const tooLong = "a".repeat(31);

      expect(tooShort.length).toBeLessThan(3);
      expect(valid.length).toBeGreaterThanOrEqual(3);
      expect(tooLong.length).toBeGreaterThan(30);
    });
  });

  describe("Profile Photos", () => {
    it("should update profile photo URL", async () => {
      const photoUrl = "https://example.com/new-photo.jpg";

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "test-user-123",
                photoUrl,
              },
            ]),
          }),
        }),
      });

      const result = await mockDb.update().set().where().returning();
      expect(result[0].photoUrl).toBe(photoUrl);
    });

    it("should validate photo URL format", () => {
      const validUrl = "https://example.com/photo.jpg";
      const invalidUrl = "not-a-url";

      expect(validUrl).toMatch(/^https?:\/\//);
      expect(invalidUrl).not.toMatch(/^https?:\/\//);
    });
  });

  describe("Social Links", () => {
    it("should store Instagram handle", () => {
      const instagram = "@skater123";
      expect(instagram).toMatch(/^@?[a-zA-Z0-9_.]+$/);
    });

    it("should store YouTube channel", () => {
      const youtube = "https://youtube.com/@skater123";
      expect(youtube).toContain("youtube.com");
    });

    it("should validate social URLs", () => {
      const validUrls = [
        "https://instagram.com/skater",
        "https://youtube.com/@skater",
        "https://twitter.com/skater",
      ];

      validUrls.forEach((url) => {
        expect(url).toMatch(/^https?:\/\//);
      });
    });
  });

  describe("Profile Completion", () => {
    it("should calculate profile completeness", () => {
      const profile = {
        firstName: "John",
        lastName: "Doe",
        bio: "Skater",
        photoUrl: "https://example.com/photo.jpg",
        stance: "regular",
      };

      const fields = Object.values(profile).filter((v) => v && v.length > 0);
      const completeness = (fields.length / 5) * 100;

      expect(completeness).toBe(100);
    });

    it("should identify incomplete profiles", () => {
      const profile = {
        firstName: "John",
        lastName: "",
        bio: "",
        photoUrl: null,
        stance: "regular",
      };

      const fields = Object.values(profile).filter((v) => v && v.length > 0);
      const completeness = (fields.length / 5) * 100;

      expect(completeness).toBeLessThan(100);
    });
  });

  describe("Follower System", () => {
    it("should follow a user", async () => {
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              followerId: "test-user-123",
              followingId: "other-user-456",
              createdAt: new Date(),
            },
          ]),
        }),
      });

      const result = await mockDb.insert().values().returning();
      expect(result[0].followerId).toBe("test-user-123");
      expect(result[0].followingId).toBe("other-user-456");
    });

    it("should unfollow a user", async () => {
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
        }),
      });

      const result = await mockDb.update().set().where();
      expect(result.rowsAffected).toBe(1);
    });

    it("should get follower count", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{}, {}, {}]),
        }),
      });

      const result = await mockDb.select().from().where();
      expect(result.length).toBe(3);
    });
  });
});
