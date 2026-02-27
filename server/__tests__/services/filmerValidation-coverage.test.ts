/**
 * @fileoverview Coverage tests for filmerRequests/validation.ts
 *
 * Targets uncovered line:
 * - Line 13: ensureTrust throws FilmerRequestError when trustLevel < TRUST_LEVEL_REQUIRED
 */

import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@shared/schema", () => ({
  customUsers: {},
  userProfiles: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { ensureTrust } = await import("../../services/filmerRequests/validation");
const { FilmerRequestError } = await import("../../services/filmerRequests/types");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("filmerRequests/validation — ensureTrust", () => {
  it("throws FilmerRequestError with INSUFFICIENT_TRUST when trust level is below required (line 13)", () => {
    expect(() => ensureTrust(0)).toThrow(FilmerRequestError);

    try {
      ensureTrust(0);
    } catch (err: any) {
      expect(err).toBeInstanceOf(FilmerRequestError);
      expect(err.code).toBe("INSUFFICIENT_TRUST");
      expect(err.message).toBe("Insufficient trust level");
      expect(err.status).toBe(403);
    }
  });

  it("does not throw when trust level meets the required threshold", () => {
    // TRUST_LEVEL_REQUIRED is 1, so passing 1 should not throw
    expect(() => ensureTrust(1)).not.toThrow();
  });

  it("does not throw when trust level exceeds the required threshold", () => {
    expect(() => ensureTrust(100)).not.toThrow();
  });
});
