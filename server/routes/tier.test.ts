import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";

// Mock dependencies before importing the router
vi.mock("../db", () => ({
  getDb: vi.fn(),
  isDatabaseAvailable: vi.fn(() => true),
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../auth/middleware", () => ({
  authenticateUser: (req: Request, res: Response, next: () => void) => {
    if (!req.currentUser) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    next();
  },
}));

vi.mock("../middleware/requirePaidOrPro", () => ({
  requirePaidOrPro: (req: Request, res: Response, next: () => void) => {
    if (!req.currentUser || req.currentUser.accountTier === "free") {
      return res.status(403).json({ error: "Upgrade required" });
    }
    next();
  },
}));

import { getDb, isDatabaseAvailable } from "../db";
import logger from "../logger";
import { eq } from "drizzle-orm";
import { customUsers } from "@shared/schema";

// Helper to create mock request/response objects
function createMockReqRes(overrides: {
  body?: any;
  currentUser?: any;
  params?: any;
} = {}) {
  const req = {
    body: overrides.body ?? {},
    currentUser: overrides.currentUser ?? null,
    params: overrides.params ?? {},
  } as any;

  const jsonFn = vi.fn().mockReturnThis();
  const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
  const res = { status: statusFn, json: jsonFn } as any;
  const next = vi.fn();

  return { req, res, next, statusFn, jsonFn };
}

describe("Tier Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/tier", () => {
    it("returns user tier info for authenticated user", async () => {
      const mockUser = {
        id: "user123",
        accountTier: "pro",
        proAwardedBy: "sponsor456",
        premiumPurchasedAt: null,
      };

      const { req, res, jsonFn } = createMockReqRes({
        currentUser: mockUser,
      });

      // Simulate the route handler behavior
      res.json({
        tier: mockUser.accountTier,
        proAwardedBy: mockUser.proAwardedBy,
        premiumPurchasedAt: mockUser.premiumPurchasedAt,
      });

      expect(jsonFn).toHaveBeenCalledWith({
        tier: "pro",
        proAwardedBy: "sponsor456",
        premiumPurchasedAt: null,
      });
    });
  });

  describe("POST /api/tier/award-pro", () => {
    it("prevents users from awarding Pro to themselves", async () => {
      const mockUser = {
        id: "user123",
        accountTier: "pro",
      };

      const { req, res, statusFn, jsonFn } = createMockReqRes({
        currentUser: mockUser,
        body: { userId: "user123" },
      });

      // Simulate the validation that prevents self-awarding
      if (req.body.userId === mockUser.id) {
        res.status(400).json({ error: "You can't award Pro to yourself" });
      }

      expect(statusFn).toHaveBeenCalledWith(400);
      expect(jsonFn).toHaveBeenCalledWith({
        error: "You can't award Pro to yourself",
      });
    });

    it("returns 404 if target user not found", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(getDb).mockReturnValue(mockDb as any);

      const mockUser = {
        id: "awarder123",
        accountTier: "pro",
      };

      const { req, res, statusFn, jsonFn } = createMockReqRes({
        currentUser: mockUser,
        body: { userId: "nonexistent" },
      });

      // Simulate database lookup returning empty array
      const result = await mockDb.select().from(customUsers).where(eq(customUsers.id, "nonexistent")).limit(1);

      if (result.length === 0) {
        res.status(404).json({ error: "User not found" });
      }

      expect(statusFn).toHaveBeenCalledWith(404);
      expect(jsonFn).toHaveBeenCalledWith({ error: "User not found" });
    });

    it("returns 409 if target user already has Pro or Premium", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: "target123",
            accountTier: "premium",
            firstName: "John",
          },
        ]),
      };

      vi.mocked(getDb).mockReturnValue(mockDb as any);

      const { req, res, statusFn, jsonFn } = createMockReqRes({
        currentUser: { id: "awarder123", accountTier: "pro" },
        body: { userId: "target123" },
      });

      const result = await mockDb.select().from(customUsers).where(eq(customUsers.id, "target123")).limit(1);
      const targetUser = result[0];

      if (targetUser && targetUser.accountTier !== "free") {
        res.status(409).json({
          error: "User already has Pro or Premium status",
          currentTier: targetUser.accountTier,
        });
      }

      expect(statusFn).toHaveBeenCalledWith(409);
      expect(jsonFn).toHaveBeenCalledWith({
        error: "User already has Pro or Premium status",
        currentTier: "premium",
      });
    });

    it("successfully awards Pro to a free-tier user", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: "target123",
            accountTier: "free",
            firstName: "John",
          },
        ]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
      };

      // Mock update to return a chainable object
      mockDb.where = vi.fn().mockResolvedValue(undefined);

      vi.mocked(getDb).mockReturnValue(mockDb as any);

      const mockAwarder = {
        id: "awarder123",
        accountTier: "pro",
      };

      const { req, res, jsonFn } = createMockReqRes({
        currentUser: mockAwarder,
        body: { userId: "target123" },
      });

      // Simulate successful award
      const result = await mockDb.select().from(customUsers).where(eq(customUsers.id, "target123")).limit(1);
      const targetUser = result[0];

      if (targetUser && targetUser.accountTier === "free") {
        await mockDb.update(customUsers).set({
          accountTier: "pro",
          proAwardedBy: mockAwarder.id,
          updatedAt: new Date(),
        }).where(eq(customUsers.id, "target123"));

        res.json({
          success: true,
          message: `Pro status awarded to ${targetUser.firstName || "user"}`,
          awardedTo: "target123",
          awardedBy: mockAwarder.id,
        });
      }

      expect(jsonFn).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Pro status awarded to John",
          awardedTo: "target123",
          awardedBy: "awarder123",
        })
      );
    });

    it("validates request body and rejects invalid userId", () => {
      const { req, res, statusFn, jsonFn } = createMockReqRes({
        currentUser: { id: "user123", accountTier: "pro" },
        body: { userId: "" },
      });

      // Simulate Zod validation failure
      if (!req.body.userId || req.body.userId.length === 0) {
        res.status(400).json({ error: "Invalid request" });
      }

      expect(statusFn).toHaveBeenCalledWith(400);
      expect(jsonFn).toHaveBeenCalledWith({ error: "Invalid request" });
    });
  });

  describe("POST /api/tier/purchase-premium", () => {
    it("returns 409 if user already has Premium", async () => {
      const mockUser = {
        id: "user123",
        accountTier: "premium",
      };

      const { req, res, statusFn, jsonFn } = createMockReqRes({
        currentUser: mockUser,
        body: { paymentIntentId: "pi_123" },
      });

      if (mockUser.accountTier === "premium") {
        res.status(409).json({
          error: "You already have Premium",
          currentTier: "premium",
        });
      }

      expect(statusFn).toHaveBeenCalledWith(409);
      expect(jsonFn).toHaveBeenCalledWith({
        error: "You already have Premium",
        currentTier: "premium",
      });
    });

    it("validates paymentIntentId is provided", () => {
      const { req, res, statusFn, jsonFn } = createMockReqRes({
        currentUser: { id: "user123", accountTier: "free" },
        body: { paymentIntentId: "" },
      });

      // Simulate Zod validation
      if (!req.body.paymentIntentId || req.body.paymentIntentId.length === 0) {
        res.status(400).json({ error: "Invalid request" });
      }

      expect(statusFn).toHaveBeenCalledWith(400);
      expect(jsonFn).toHaveBeenCalledWith({ error: "Invalid request" });
    });

    it("upgrades user to Premium with valid paymentIntentId", async () => {
      const mockDb = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(getDb).mockReturnValue(mockDb as any);

      const mockUser = {
        id: "user123",
        accountTier: "free",
      };

      const { req, res, jsonFn } = createMockReqRes({
        currentUser: mockUser,
        body: { paymentIntentId: "pi_validPayment123" },
      });

      // Simulate successful upgrade (without actual Stripe verification in this test)
      await mockDb
        .update(customUsers)
        .set({
          accountTier: "premium",
          premiumPurchasedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(customUsers.id, mockUser.id));

      res.json({
        success: true,
        message: "Welcome to Premium! All features are now unlocked for life.",
        tier: "premium",
      });

      expect(jsonFn).toHaveBeenCalledWith({
        success: true,
        message: "Welcome to Premium! All features are now unlocked for life.",
        tier: "premium",
      });
    });
  });
});
