import { describe, it, expect } from "vitest";

/**
 * Tests the deep link parameter extraction + validation pattern used by all
 * three deep-linkable screens (game/[id], challenge/[id], profile/[uid]).
 *
 * Each screen follows the same logic:
 *   const validated = raw && REGEX.test(raw) ? raw : null;
 *   const isInvalidId = !!raw && !validated;
 */

const VALID_GAME_ID = /^[a-zA-Z0-9]{20}$/;
const VALID_CHALLENGE_ID = /^[a-zA-Z0-9]{20}$/;
const VALID_UID = /^[a-zA-Z0-9]{20,128}$/;

/** Mirrors the validation pattern used in screen components */
function validateParam(
  raw: string | undefined,
  regex: RegExp
): { validated: string | null; isInvalid: boolean } {
  const validated = raw && regex.test(raw) ? raw : null;
  const isInvalid = !!raw && !validated;
  return { validated, isInvalid };
}

describe("deep link parameter validation", () => {
  describe("game ID derivation", () => {
    it("returns gameId when raw param is valid", () => {
      const result = validateParam("AbCdEfGhIj1234567890", VALID_GAME_ID);
      expect(result.validated).toBe("AbCdEfGhIj1234567890");
      expect(result.isInvalid).toBe(false);
    });

    it("returns null + isInvalid when raw param is invalid", () => {
      const result = validateParam("not-a-valid-id!", VALID_GAME_ID);
      expect(result.validated).toBeNull();
      expect(result.isInvalid).toBe(true);
    });

    it("returns null + not invalid when raw param is undefined", () => {
      const result = validateParam(undefined, VALID_GAME_ID);
      expect(result.validated).toBeNull();
      expect(result.isInvalid).toBe(false);
    });

    it("returns null + not invalid when raw param is empty", () => {
      const result = validateParam("", VALID_GAME_ID);
      expect(result.validated).toBeNull();
      expect(result.isInvalid).toBe(false);
    });

    it("flags path traversal as invalid", () => {
      const result = validateParam("../../../etc/passwd", VALID_GAME_ID);
      expect(result.validated).toBeNull();
      expect(result.isInvalid).toBe(true);
    });
  });

  describe("challenge ID derivation", () => {
    it("returns challengeId when raw param is valid", () => {
      const result = validateParam("XyZ1234567890AbCdEfG", VALID_CHALLENGE_ID);
      expect(result.validated).toBe("XyZ1234567890AbCdEfG");
      expect(result.isInvalid).toBe(false);
    });

    it("returns null + isInvalid when raw param is invalid", () => {
      const result = validateParam("short", VALID_CHALLENGE_ID);
      expect(result.validated).toBeNull();
      expect(result.isInvalid).toBe(true);
    });

    it("returns null + not invalid when raw param is undefined", () => {
      const result = validateParam(undefined, VALID_CHALLENGE_ID);
      expect(result.validated).toBeNull();
      expect(result.isInvalid).toBe(false);
    });
  });

  describe("profile UID derivation", () => {
    it("returns uid when raw param is valid (20 chars)", () => {
      const result = validateParam("a".repeat(20), VALID_UID);
      expect(result.validated).toBe("a".repeat(20));
      expect(result.isInvalid).toBe(false);
    });

    it("returns uid when raw param is valid (128 chars)", () => {
      const result = validateParam("B".repeat(128), VALID_UID);
      expect(result.validated).toBe("B".repeat(128));
      expect(result.isInvalid).toBe(false);
    });

    it("returns null + isInvalid when raw param is too short", () => {
      const result = validateParam("a".repeat(19), VALID_UID);
      expect(result.validated).toBeNull();
      expect(result.isInvalid).toBe(true);
    });

    it("returns null + isInvalid when raw param is too long", () => {
      const result = validateParam("a".repeat(129), VALID_UID);
      expect(result.validated).toBeNull();
      expect(result.isInvalid).toBe(true);
    });

    it("returns null + not invalid when raw param is undefined", () => {
      const result = validateParam(undefined, VALID_UID);
      expect(result.validated).toBeNull();
      expect(result.isInvalid).toBe(false);
    });

    it("flags special characters as invalid", () => {
      const result = validateParam("abc_def@ghi.jkl!mnop", VALID_UID);
      expect(result.validated).toBeNull();
      expect(result.isInvalid).toBe(true);
    });
  });
});
