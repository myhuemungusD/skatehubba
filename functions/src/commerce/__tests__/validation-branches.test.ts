/**
 * @fileoverview Branch-coverage tests for webhooks/validation.ts
 *
 * Targets the uncovered branch:
 * - Line 21: return pi.id when pi is a PaymentIntent object (not a string)
 */

import { describe, it, expect, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("../../firebaseAdmin", () => ({
  getAdminDb: vi.fn(),
}));

// ============================================================================
// Import after mocks
// ============================================================================

const { extractPaymentIntentId, findOrderByPaymentIntentId } = await import(
  "../webhooks/validation"
);

// ============================================================================
// Tests
// ============================================================================

describe("webhooks/validation — branch coverage", () => {
  describe("extractPaymentIntentId", () => {
    it("returns null for null input", () => {
      expect(extractPaymentIntentId(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(extractPaymentIntentId(undefined)).toBeNull();
    });

    it("returns the string directly when pi is a string", () => {
      expect(extractPaymentIntentId("pi_abc123")).toBe("pi_abc123");
    });

    it("returns pi.id when pi is a PaymentIntent object (line 21)", () => {
      const paymentIntent = {
        id: "pi_object_456",
        object: "payment_intent",
        amount: 1000,
        currency: "usd",
      } as any;

      expect(extractPaymentIntentId(paymentIntent)).toBe("pi_object_456");
    });

    it("returns pi.id for minimal PaymentIntent object", () => {
      const paymentIntent = { id: "pi_minimal" } as any;
      expect(extractPaymentIntentId(paymentIntent)).toBe("pi_minimal");
    });

    it("returns empty string for empty string input", () => {
      // Empty string is falsy, so returns null
      expect(extractPaymentIntentId("")).toBeNull();
    });
  });

  describe("findOrderByPaymentIntentId", () => {
    it("returns null when no matching order found", async () => {
      const { getAdminDb } = await import("../../firebaseAdmin");
      const mockCollection = {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
      (getAdminDb as any).mockReturnValue({
        collection: vi.fn().mockReturnValue(mockCollection),
      });

      const result = await findOrderByPaymentIntentId("pi_nonexistent");
      expect(result).toBeNull();
    });

    it("returns order ref and data when found", async () => {
      const mockRef = { id: "order-123", path: "orders/order-123" };
      const mockData = { status: "pending", stripePaymentIntentId: "pi_found" };
      const { getAdminDb } = await import("../../firebaseAdmin");
      const mockCollection = {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({
          empty: false,
          docs: [{ ref: mockRef, data: () => mockData }],
        }),
      };
      (getAdminDb as any).mockReturnValue({
        collection: vi.fn().mockReturnValue(mockCollection),
      });

      const result = await findOrderByPaymentIntentId("pi_found");
      expect(result).not.toBeNull();
      expect(result!.ref).toBe(mockRef);
      expect(result!.data).toEqual(mockData);
    });
  });
});
