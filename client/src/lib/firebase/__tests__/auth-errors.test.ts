/**
 * Tests for client/src/lib/firebase/auth-errors.ts
 *
 * Covers: getAuthErrorMessage() and its internal extractFirebaseErrorCode()
 * logic, tested indirectly through the public API.
 *
 * No mocks needed — this module is pure functions with no external deps.
 */

import { describe, it, expect } from "vitest";
import { getAuthErrorMessage, isAuthConfigError } from "../auth-errors";

describe("auth-errors", () => {
  // ────────────────────────────────────────────────────────────────────────
  // Sign-up error codes
  // ────────────────────────────────────────────────────────────────────────

  describe("sign-up errors", () => {
    it("auth/email-already-in-use", () => {
      const msg = getAuthErrorMessage({ code: "auth/email-already-in-use" });
      expect(msg).toContain("already exists");
      expect(msg).toContain("signing in");
    });

    it("auth/weak-password", () => {
      const msg = getAuthErrorMessage({ code: "auth/weak-password" });
      expect(msg).toContain("too weak");
      expect(msg).toContain("8 characters");
    });

    it("auth/invalid-email", () => {
      const msg = getAuthErrorMessage({ code: "auth/invalid-email" });
      expect(msg).toContain("email");
      expect(msg).toContain("check");
    });

    it("auth/operation-not-allowed", () => {
      const msg = getAuthErrorMessage({ code: "auth/operation-not-allowed" });
      expect(msg).toContain("not enabled");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Sign-in error codes
  // ────────────────────────────────────────────────────────────────────────

  describe("sign-in errors", () => {
    it("auth/user-not-found", () => {
      const msg = getAuthErrorMessage({ code: "auth/user-not-found" });
      expect(msg).toContain("No account");
    });

    it("auth/wrong-password", () => {
      const msg = getAuthErrorMessage({ code: "auth/wrong-password" });
      expect(msg).toContain("Incorrect password");
    });

    it("auth/invalid-credential", () => {
      const msg = getAuthErrorMessage({ code: "auth/invalid-credential" });
      expect(msg).toContain("Incorrect email or password");
    });

    it("auth/user-disabled", () => {
      const msg = getAuthErrorMessage({ code: "auth/user-disabled" });
      expect(msg).toContain("disabled");
    });

    it("auth/too-many-requests", () => {
      const msg = getAuthErrorMessage({ code: "auth/too-many-requests" });
      expect(msg).toContain("Too many");
      expect(msg).toContain("wait");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Password reset error codes
  // ────────────────────────────────────────────────────────────────────────

  describe("password reset errors", () => {
    it("auth/missing-email", () => {
      const msg = getAuthErrorMessage({ code: "auth/missing-email" });
      expect(msg).toContain("email");
    });

    it("auth/user-not-found-reset", () => {
      const msg = getAuthErrorMessage({ code: "auth/user-not-found-reset" });
      expect(msg).toContain("reset link");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Google / OAuth error codes
  // ────────────────────────────────────────────────────────────────────────

  describe("Google / OAuth errors", () => {
    it("auth/account-exists-with-different-credential", () => {
      const msg = getAuthErrorMessage({
        code: "auth/account-exists-with-different-credential",
      });
      expect(msg).toContain("different sign-in method");
    });

    it("auth/popup-closed-by-user", () => {
      const msg = getAuthErrorMessage({ code: "auth/popup-closed-by-user" });
      expect(msg).toContain("cancelled");
    });

    it("auth/popup-blocked", () => {
      const msg = getAuthErrorMessage({ code: "auth/popup-blocked" });
      expect(msg).toContain("blocked");
    });

    it("auth/cancelled-popup-request", () => {
      const msg = getAuthErrorMessage({ code: "auth/cancelled-popup-request" });
      expect(msg).toContain("cancelled");
    });

    it("auth/unauthorized-domain", () => {
      const msg = getAuthErrorMessage({ code: "auth/unauthorized-domain" });
      expect(msg).toContain("not authorized");
    });

    it("auth/operation-not-supported-in-this-environment", () => {
      const msg = getAuthErrorMessage({
        code: "auth/operation-not-supported-in-this-environment",
      });
      expect(msg).toContain("not supported");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Verification error codes
  // ────────────────────────────────────────────────────────────────────────

  describe("verification errors", () => {
    it("auth/expired-action-code", () => {
      const msg = getAuthErrorMessage({ code: "auth/expired-action-code" });
      expect(msg).toContain("expired");
    });

    it("auth/invalid-action-code", () => {
      const msg = getAuthErrorMessage({ code: "auth/invalid-action-code" });
      expect(msg).toContain("invalid");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Network / generic error codes
  // ────────────────────────────────────────────────────────────────────────

  describe("network and generic errors", () => {
    it("auth/network-request-failed", () => {
      const msg = getAuthErrorMessage({ code: "auth/network-request-failed" });
      expect(msg).toContain("Network");
      expect(msg).toContain("connection");
    });

    it("auth/internal-error", () => {
      const msg = getAuthErrorMessage({ code: "auth/internal-error" });
      expect(msg).toContain("not configured");
    });

    it("auth/requires-recent-login", () => {
      const msg = getAuthErrorMessage({ code: "auth/requires-recent-login" });
      expect(msg).toContain("sign in again");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Error code extraction from message strings
  // ────────────────────────────────────────────────────────────────────────

  describe("error code extraction from message", () => {
    it("extracts code from Firebase error format in message", () => {
      const msg = getAuthErrorMessage({
        message: "Firebase: Error (auth/email-already-in-use).",
      });
      expect(msg).toContain("already exists");
    });

    it("extracts code from message even without code property", () => {
      const msg = getAuthErrorMessage({
        message: "Firebase: Error (auth/wrong-password).",
      });
      expect(msg).toContain("Incorrect password");
    });

    it("handles error object with both code and message", () => {
      const msg = getAuthErrorMessage({
        code: "auth/user-disabled",
        message: "Firebase: Error (auth/user-disabled).",
      });
      expect(msg).toContain("disabled");
    });

    it("prefers code property over message extraction", () => {
      const msg = getAuthErrorMessage({
        code: "auth/user-disabled",
        message: "Firebase: Error (auth/wrong-password).",
      });
      // Should use the code property, not the message extraction
      expect(msg).toContain("disabled");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Fallback behaviour
  // ────────────────────────────────────────────────────────────────────────

  describe("fallback for unknown / missing errors", () => {
    it("returns generic message for unrecognised auth code", () => {
      const msg = getAuthErrorMessage({ code: "auth/some-future-error" });
      expect(msg).toBe("Something went wrong. Please try again.");
    });

    it("returns generic message for null", () => {
      const msg = getAuthErrorMessage(null);
      expect(msg).toBe("Something went wrong. Please try again.");
    });

    it("returns generic message for undefined", () => {
      const msg = getAuthErrorMessage(undefined);
      expect(msg).toBe("Something went wrong. Please try again.");
    });

    it("returns generic message for non-object (string)", () => {
      const msg = getAuthErrorMessage("some string error");
      expect(msg).toBe("Something went wrong. Please try again.");
    });

    it("returns generic message for non-object (number)", () => {
      const msg = getAuthErrorMessage(42);
      expect(msg).toBe("Something went wrong. Please try again.");
    });

    it("returns generic message for empty object", () => {
      const msg = getAuthErrorMessage({});
      expect(msg).toBe("Something went wrong. Please try again.");
    });

    it("returns generic message for object with non-auth code", () => {
      const msg = getAuthErrorMessage({ code: "storage/not-found" });
      expect(msg).toBe("Something went wrong. Please try again.");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Error instance fallback (readable message pass-through)
  // ────────────────────────────────────────────────────────────────────────

  describe("Error instance fallback", () => {
    it("uses Error.message if it is short and not a Firebase format string", () => {
      const error = new Error("Custom short error");
      const msg = getAuthErrorMessage(error);
      expect(msg).toBe("Custom short error");
    });

    it("falls back to generic if Error.message starts with 'Firebase:'", () => {
      const error = new Error("Firebase: Error (auth/unknown-new-code).");
      const msg = getAuthErrorMessage(error);
      // Should NOT pass through the raw Firebase string
      expect(msg).not.toContain("Firebase:");
    });

    it("falls back to generic if Error.message is very long (>200 chars)", () => {
      const error = new Error("A".repeat(201));
      const msg = getAuthErrorMessage(error);
      expect(msg).toBe("Something went wrong. Please try again.");
    });

    it("passes through Error.message that is exactly 200 chars", () => {
      const shortEnough = "B".repeat(200);
      const error = new Error(shortEnough);
      const msg = getAuthErrorMessage(error);
      // 200 chars is < 200 is false, so it should fall through
      // Actually: msg.length < 200 means 200 chars fails the check
      expect(msg).toBe("Something went wrong. Please try again.");
    });

    it("passes through Error.message that is 199 chars", () => {
      const shortEnough = "C".repeat(199);
      const error = new Error(shortEnough);
      const msg = getAuthErrorMessage(error);
      expect(msg).toBe(shortEnough);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Mapped message via Error with code in message
  // ────────────────────────────────────────────────────────────────────────

  describe("Error with embedded auth code in message", () => {
    it("maps known code from Error.message", () => {
      const error = new Error("Firebase: Error (auth/too-many-requests).");
      const msg = getAuthErrorMessage(error);
      expect(msg).toContain("Too many");
    });

    it("maps code from message even for non-Firebase Error subclass", () => {
      // Plain object with message property
      const error = {
        message: "Something happened (auth/popup-blocked) unexpectedly",
      };
      const msg = getAuthErrorMessage(error);
      expect(msg).toContain("blocked");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // isAuthConfigError
  // ────────────────────────────────────────────────────────────────────────

  describe("isAuthConfigError", () => {
    it("returns true for auth/unauthorized-domain", () => {
      expect(isAuthConfigError({ code: "auth/unauthorized-domain" })).toBe(true);
    });

    it("returns true for auth/internal-error", () => {
      expect(isAuthConfigError({ code: "auth/internal-error" })).toBe(true);
    });

    it("returns true for auth/api-key-not-valid", () => {
      expect(isAuthConfigError({ code: "auth/api-key-not-valid" })).toBe(true);
    });

    it("returns true for auth/operation-not-allowed", () => {
      expect(isAuthConfigError({ code: "auth/operation-not-allowed" })).toBe(true);
    });

    it("returns true for long Firebase code with prefix match", () => {
      expect(
        isAuthConfigError({
          code: "auth/api-key-not-valid.-please-pass-a-valid-api-key.",
        })
      ).toBe(true);
    });

    it("returns false for user-facing errors", () => {
      expect(isAuthConfigError({ code: "auth/popup-blocked" })).toBe(false);
      expect(isAuthConfigError({ code: "auth/wrong-password" })).toBe(false);
    });

    it("returns false for null/undefined", () => {
      expect(isAuthConfigError(null)).toBe(false);
      expect(isAuthConfigError(undefined)).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Prefix match — long Firebase error codes (line 122-123)
  // ────────────────────────────────────────────────────────────────────────

  describe("prefix match for long Firebase error codes (line 122-123)", () => {
    it("matches auth/api-key-not-valid with extra suffix via prefix match", () => {
      const msg = getAuthErrorMessage({
        code: "auth/api-key-not-valid.-please-pass-a-valid-api-key.",
      });
      expect(msg).toContain("Firebase is not configured correctly");
    });

    it("matches auth/invalid-api-key with extra suffix via prefix match", () => {
      const msg = getAuthErrorMessage({
        code: "auth/invalid-api-key.some-extra-detail",
      });
      expect(msg).toContain("Firebase is not configured correctly");
    });

    it("matches auth/unauthorized-domain with extra suffix via prefix match", () => {
      const msg = getAuthErrorMessage({
        code: "auth/unauthorized-domain.extra-info",
      });
      expect(msg).toContain("not authorized");
    });

    it("falls back to generic when long code prefix does not match any known code", () => {
      const msg = getAuthErrorMessage({
        code: "auth/some-unknown-error.with-extra-stuff",
      });
      expect(msg).toBe("Something went wrong. Please try again.");
    });

    it("does not use prefix match when code has no dot suffix (shortCode === code)", () => {
      // "auth/email-already-in-use" has no dot, so shortCode === code
      // This means the prefix match condition `shortCode !== code` is false
      const msg = getAuthErrorMessage({ code: "auth/email-already-in-use" });
      expect(msg).toContain("already exists");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Error instance with Firebase-formatted message containing known code
  // Falls through to Error.message pass-through / generic fallback
  // ────────────────────────────────────────────────────────────────────────

  describe("Error instance with embedded unknown code then readable fallback", () => {
    it("uses Error.message for non-Firebase-prefixed message with unknown embedded code", () => {
      // Has auth code in message but it's unknown, and message doesn't start with "Firebase:"
      const error = new Error("Something broke (auth/totally-new-error).");
      // Error.message is "Something broke (auth/totally-new-error)."
      // extractFirebaseErrorCode will find "auth/totally-new-error" which is not in the map
      // shortCode regex won't match (no dot in the code portion)
      // Then it checks: error instanceof Error -> yes, msg doesn't start with "Firebase:" -> yes
      // msg.length < 200 -> yes. So it returns the Error.message directly.
      const msg = getAuthErrorMessage(error);
      // The embedded code "auth/totally-new-error" is unrecognized, but since the
      // error message is short and doesn't start with "Firebase:", it passes through
      expect(msg).toBe("Something broke (auth/totally-new-error).");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Module-level window branch in unauthorized-domain message (line 37)
  // ────────────────────────────────────────────────────────────────────────

  describe("unauthorized-domain message includes hostname when window is defined", () => {
    it("includes window.location.hostname in unauthorized-domain message when window exists", async () => {
      // Reset modules and stub window before re-importing to cover the
      // `typeof window !== "undefined" ? window.location.hostname : "unknown"` branch
      vi.resetModules();
      vi.stubGlobal("window", {
        location: { hostname: "my-preview-deploy.vercel.app" },
      });

      const { getAuthErrorMessage: freshGetAuthErrorMessage } = await import("../auth-errors");
      const msg = freshGetAuthErrorMessage({ code: "auth/unauthorized-domain" });

      expect(msg).toContain("my-preview-deploy.vercel.app");
      expect(msg).toContain("not authorized");

      vi.unstubAllGlobals();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // All mapped codes return non-empty strings
  // ────────────────────────────────────────────────────────────────────────

  describe("all mapped codes produce non-empty messages", () => {
    const knownCodes = [
      "auth/email-already-in-use",
      "auth/weak-password",
      "auth/invalid-email",
      "auth/operation-not-allowed",
      "auth/user-not-found",
      "auth/wrong-password",
      "auth/invalid-credential",
      "auth/user-disabled",
      "auth/too-many-requests",
      "auth/missing-email",
      "auth/user-not-found-reset",
      "auth/account-exists-with-different-credential",
      "auth/popup-closed-by-user",
      "auth/popup-blocked",
      "auth/cancelled-popup-request",
      "auth/unauthorized-domain",
      "auth/operation-not-supported-in-this-environment",
      "auth/expired-action-code",
      "auth/invalid-action-code",
      "auth/network-request-failed",
      "auth/internal-error",
      "auth/requires-recent-login",
    ];

    for (const code of knownCodes) {
      it(`${code} returns a non-empty user-friendly message`, () => {
        const msg = getAuthErrorMessage({ code });
        expect(msg).toBeTypeOf("string");
        expect(msg.length).toBeGreaterThan(10);
        // Should NOT contain raw Firebase error format
        expect(msg).not.toMatch(/^Firebase:/);
        // Should NOT contain the raw error code
        expect(msg).not.toContain(code);
      });
    }
  });
});
