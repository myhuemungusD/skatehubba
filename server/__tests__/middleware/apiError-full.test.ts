/**
 * @fileoverview Unit tests for apiError utility
 *
 * Tests:
 * - sendError: basic call, with details, without details (empty object), with empty details (should not include)
 * - Each Errors method: verify status code, error code, message, defaults
 * - Errors.validation: includes issues in details
 * - Errors.rateLimited: custom message
 * - Errors.dbUnavailable: fixed message
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendError, Errors } from "../../utils/apiError";

// =============================================================================
// Helpers
// =============================================================================

function mockResponse(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// =============================================================================
// Tests
// =============================================================================

describe("apiError", () => {
  let res: any;

  beforeEach(() => {
    res = mockResponse();
  });

  // ===========================================================================
  // sendError
  // ===========================================================================

  describe("sendError", () => {
    it("sends a basic error response with status, error, and message", () => {
      sendError(res, 400, "BAD_REQUEST", "Something went wrong.");

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "BAD_REQUEST",
        message: "Something went wrong.",
      });
    });

    it("includes details when provided with non-empty object", () => {
      sendError(res, 422, "VALIDATION_ERROR", "Invalid input.", {
        field: "email",
        reason: "required",
      });

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({
        error: "VALIDATION_ERROR",
        message: "Invalid input.",
        details: { field: "email", reason: "required" },
      });
    });

    it("does not include details when details is undefined", () => {
      sendError(res, 500, "INTERNAL_ERROR", "Unexpected failure.", undefined);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "INTERNAL_ERROR",
        message: "Unexpected failure.",
      });
      // Verify details key is not present
      const jsonArg = (res.json as any).mock.calls[0][0];
      expect(jsonArg).not.toHaveProperty("details");
    });

    it("does not include details when details is an empty object", () => {
      sendError(res, 404, "NOT_FOUND", "Resource missing.", {});

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "NOT_FOUND",
        message: "Resource missing.",
      });
      // Verify details key is not present
      const jsonArg = (res.json as any).mock.calls[0][0];
      expect(jsonArg).not.toHaveProperty("details");
    });

    it("returns the response object for chaining", () => {
      const result = sendError(res, 400, "TEST", "Test message.");
      expect(result).toBe(res);
    });
  });

  // ===========================================================================
  // Errors.badRequest
  // ===========================================================================

  describe("Errors.badRequest", () => {
    it("sends 400 with given error and message", () => {
      Errors.badRequest(res, "INVALID_INPUT", "Input is invalid.");

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "INVALID_INPUT",
        message: "Input is invalid.",
      });
    });

    it("includes details when provided", () => {
      Errors.badRequest(res, "MISSING_FIELD", "Field required.", {
        field: "name",
      });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "MISSING_FIELD",
        message: "Field required.",
        details: { field: "name" },
      });
    });
  });

  // ===========================================================================
  // Errors.validation
  // ===========================================================================

  describe("Errors.validation", () => {
    it("sends 400 with default error and message, includes issues in details", () => {
      const issues = {
        fieldErrors: { email: ["Required"] },
        formErrors: [],
      };

      Errors.validation(res, issues);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: { issues },
      });
    });

    it("accepts custom error code and message", () => {
      const issues = ["field1 is required"];

      Errors.validation(res, issues, "CUSTOM_VALIDATION", "Custom message.");

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "CUSTOM_VALIDATION",
        message: "Custom message.",
        details: { issues },
      });
    });

    it("wraps issues inside details object", () => {
      Errors.validation(res, { foo: "bar" });

      const jsonArg = (res.json as any).mock.calls[0][0];
      expect(jsonArg.details).toEqual({ issues: { foo: "bar" } });
    });
  });

  // ===========================================================================
  // Errors.unauthorized
  // ===========================================================================

  describe("Errors.unauthorized", () => {
    it("sends 401 with default error and message", () => {
      Errors.unauthorized(res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "UNAUTHORIZED",
        message: "Authentication required.",
      });
    });

    it("accepts custom error and message", () => {
      Errors.unauthorized(res, "TOKEN_EXPIRED", "Your token has expired.");

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "TOKEN_EXPIRED",
        message: "Your token has expired.",
      });
    });
  });

  // ===========================================================================
  // Errors.forbidden
  // ===========================================================================

  describe("Errors.forbidden", () => {
    it("sends 403 with default error and message", () => {
      Errors.forbidden(res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "FORBIDDEN",
        message: "Insufficient permissions.",
      });
    });

    it("accepts custom error and message", () => {
      Errors.forbidden(res, "ADMIN_ONLY", "Admin access required.");

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "ADMIN_ONLY",
        message: "Admin access required.",
      });
    });
  });

  // ===========================================================================
  // Errors.notFound
  // ===========================================================================

  describe("Errors.notFound", () => {
    it("sends 404 with default error and message", () => {
      Errors.notFound(res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "NOT_FOUND",
        message: "Resource not found.",
      });
    });

    it("accepts custom error and message", () => {
      Errors.notFound(res, "USER_NOT_FOUND", "User does not exist.");

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "USER_NOT_FOUND",
        message: "User does not exist.",
      });
    });
  });

  // ===========================================================================
  // Errors.conflict
  // ===========================================================================

  describe("Errors.conflict", () => {
    it("sends 409 with given error and message", () => {
      Errors.conflict(res, "DUPLICATE", "Resource already exists.");

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: "DUPLICATE",
        message: "Resource already exists.",
      });
    });

    it("includes details when provided", () => {
      Errors.conflict(res, "ALREADY_PREMIUM", "Already premium.", {
        currentTier: "premium",
      });

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: "ALREADY_PREMIUM",
        message: "Already premium.",
        details: { currentTier: "premium" },
      });
    });
  });

  // ===========================================================================
  // Errors.tooLarge
  // ===========================================================================

  describe("Errors.tooLarge", () => {
    it("sends 413 with default error and message", () => {
      Errors.tooLarge(res);

      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith({
        error: "PAYLOAD_TOO_LARGE",
        message: "Payload too large.",
      });
    });

    it("accepts custom error and message", () => {
      Errors.tooLarge(res, "FILE_TOO_LARGE", "File exceeds 10MB limit.");

      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith({
        error: "FILE_TOO_LARGE",
        message: "File exceeds 10MB limit.",
      });
    });
  });

  // ===========================================================================
  // Errors.rateLimited
  // ===========================================================================

  describe("Errors.rateLimited", () => {
    it("sends 429 with default message and fixed error code", () => {
      Errors.rateLimited(res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      });
    });

    it("accepts custom message", () => {
      Errors.rateLimited(res, "Slow down, cowboy.");

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: "RATE_LIMITED",
        message: "Slow down, cowboy.",
      });
    });

    it("includes details when provided", () => {
      Errors.rateLimited(res, "Rate limited.", { retryAfter: 60 });

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: "RATE_LIMITED",
        message: "Rate limited.",
        details: { retryAfter: 60 },
      });
    });
  });

  // ===========================================================================
  // Errors.internal
  // ===========================================================================

  describe("Errors.internal", () => {
    it("sends 500 with default error and message", () => {
      Errors.internal(res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      });
    });

    it("accepts custom error and message", () => {
      Errors.internal(res, "DB_FAILURE", "Database query failed.");

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "DB_FAILURE",
        message: "Database query failed.",
      });
    });
  });

  // ===========================================================================
  // Errors.dbUnavailable
  // ===========================================================================

  describe("Errors.dbUnavailable", () => {
    it("sends 503 with fixed error and message (no customization)", () => {
      Errors.dbUnavailable(res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: "DATABASE_UNAVAILABLE",
        message: "Database unavailable. Please try again shortly.",
      });
    });

    it("does not include details", () => {
      Errors.dbUnavailable(res);

      const jsonArg = (res.json as any).mock.calls[0][0];
      expect(jsonArg).not.toHaveProperty("details");
    });
  });

  // ===========================================================================
  // Errors.unavailable
  // ===========================================================================

  describe("Errors.unavailable", () => {
    it("sends 503 with default error and message", () => {
      Errors.unavailable(res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: "SERVICE_UNAVAILABLE",
        message: "Service temporarily unavailable.",
      });
    });

    it("accepts custom error and message", () => {
      Errors.unavailable(res, "MAINTENANCE", "Under maintenance.");

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: "MAINTENANCE",
        message: "Under maintenance.",
      });
    });
  });
});
