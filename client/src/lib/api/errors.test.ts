import { ApiError, isApiError, normalizeApiError, getUserFriendlyMessage } from "./errors";

describe("ApiError", () => {
  it("creates an error with correct properties", () => {
    const err = new ApiError("test", "RATE_LIMIT", 429, { detail: "slow down" });
    expect(err.message).toBe("test");
    expect(err.code).toBe("RATE_LIMIT");
    expect(err.status).toBe(429);
    expect(err.details).toEqual({ detail: "slow down" });
    expect(err.name).toBe("ApiError");
    expect(err).toBeInstanceOf(Error);
  });

  it("works without optional params", () => {
    const err = new ApiError("msg", "UNKNOWN");
    expect(err.status).toBeUndefined();
    expect(err.details).toBeUndefined();
  });
});

describe("isApiError", () => {
  it("returns true for ApiError instances", () => {
    expect(isApiError(new ApiError("test", "UNKNOWN"))).toBe(true);
  });

  it("returns false for plain errors", () => {
    expect(isApiError(new Error("test"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isApiError(null)).toBe(false);
    expect(isApiError("string")).toBe(false);
    expect(isApiError(42)).toBe(false);
  });
});

describe("normalizeApiError", () => {
  it("maps code from payload", () => {
    const err = normalizeApiError({
      status: 500,
      payload: { code: "RATE_LIMIT_EXCEEDED" },
    });
    expect(err.code).toBe("RATE_LIMIT");
  });

  it("maps REPLAY code from payload", () => {
    const err = normalizeApiError({ payload: { code: "REPLAY_DETECTED" } });
    expect(err.code).toBe("REPLAY_DETECTED");
  });

  it("maps NONCE to REPLAY_DETECTED", () => {
    const err = normalizeApiError({ payload: { code: "NONCE_REUSED" } });
    expect(err.code).toBe("REPLAY_DETECTED");
  });

  it("maps QUOTA code", () => {
    const err = normalizeApiError({ payload: { code: "QUOTA_LIMIT" } });
    expect(err.code).toBe("QUOTA_EXCEEDED");
  });

  it("maps BANNED code", () => {
    const err = normalizeApiError({ payload: { code: "USER_BANNED" } });
    expect(err.code).toBe("BANNED");
  });

  it("maps UNAUTHORIZED/AUTH code", () => {
    const err = normalizeApiError({ payload: { code: "UNAUTHORIZED" } });
    expect(err.code).toBe("UNAUTHORIZED");
    const err2 = normalizeApiError({ payload: { code: "AUTH_REQUIRED" } });
    expect(err2.code).toBe("UNAUTHORIZED");
  });

  it("maps VALIDATION/INVALID code", () => {
    const err = normalizeApiError({ payload: { code: "VALIDATION_FAILED" } });
    expect(err.code).toBe("VALIDATION_ERROR");
    const err2 = normalizeApiError({ payload: { code: "INVALID_INPUT" } });
    expect(err2.code).toBe("VALIDATION_ERROR");
  });

  it("returns UNKNOWN for unrecognized code", () => {
    const err = normalizeApiError({ payload: { code: "SOMETHING_ELSE" } });
    expect(err.code).toBe("UNKNOWN");
  });

  it("falls back to status-based code when no payload code", () => {
    expect(normalizeApiError({ status: 401 }).code).toBe("UNAUTHORIZED");
    expect(normalizeApiError({ status: 403 }).code).toBe("UNAUTHORIZED");
    expect(normalizeApiError({ status: 429 }).code).toBe("RATE_LIMIT");
    expect(normalizeApiError({ status: 400 }).code).toBe("VALIDATION_ERROR");
    expect(normalizeApiError({ status: 500 }).code).toBe("UNKNOWN");
  });

  it("extracts message from payload.message", () => {
    const err = normalizeApiError({ payload: { message: "custom msg" } });
    expect(err.message).toBe("custom msg");
  });

  it("extracts message from payload.error string", () => {
    const err = normalizeApiError({ payload: { error: "error msg" } });
    expect(err.message).toBe("error msg");
  });

  it("extracts message from string payload", () => {
    const err = normalizeApiError({ payload: "string error" });
    expect(err.message).toBe("string error");
  });

  it("falls back to statusText", () => {
    const err = normalizeApiError({ statusText: "Not Found" });
    expect(err.message).toBe("Not Found");
  });

  it("falls back to default message", () => {
    const err = normalizeApiError({});
    expect(err.message).toBe("Something went wrong. Please try again.");
  });

  it("uses 502/503 status fallback message for service unavailable", () => {
    const err502 = normalizeApiError({ status: 502 });
    expect(err502.message).toBe("Service temporarily unavailable. Please try again shortly.");
    const err503 = normalizeApiError({ status: 503 });
    expect(err503.message).toBe("Service temporarily unavailable. Please try again shortly.");
  });

  it("uses 500 status fallback message for server error", () => {
    const err = normalizeApiError({ status: 500 });
    expect(err.message).toBe("Server error. Please try again later.");
  });

  it("uses 504 status fallback message for gateway timeout", () => {
    const err = normalizeApiError({ status: 504 });
    expect(err.message).toBe("Request timed out. Please try again.");
  });

  it("returns undefined message from extractMessage when object has no message or error fields", () => {
    // payload is an object but has neither .message nor .error as strings
    const err = normalizeApiError({ payload: { data: 123 }, statusText: "Fallback" });
    expect(err.message).toBe("Fallback");
  });

  it("returns undefined from extractMessage for null payload", () => {
    const err = normalizeApiError({ payload: null, statusText: "StatusFallback" });
    expect(err.message).toBe("StatusFallback");
  });

  it("returns fallback when payload is a number (not null, not string, not object) (line 53 false branch)", () => {
    const err = normalizeApiError({ payload: 42, statusText: "NumberFallback" });
    expect(err.message).toBe("NumberFallback");
  });

  it("returns undefined from extractCode when payload has no code and error is not a string or object", () => {
    // payload.code is a number (not string), payload.error is a number (not string or object)
    const err = normalizeApiError({ payload: { code: 123, error: 456 }, status: 500 });
    expect(err.code).toBe("UNKNOWN");
  });

  it("extractCode returns undefined from nested error object when nested code is not a string", () => {
    // error is an object, but nested.code is a number
    const err = normalizeApiError({ payload: { error: { code: 999 } }, status: 500 });
    expect(err.code).toBe("UNKNOWN");
  });

  it("extracts code from nested error object", () => {
    const err = normalizeApiError({
      payload: { error: { code: "RATE_LIMIT_HIT" } },
    });
    expect(err.code).toBe("RATE_LIMIT");
  });

  it("uses error string as code fallback", () => {
    const err = normalizeApiError({
      payload: { error: "BANNED_USER" },
    });
    expect(err.code).toBe("BANNED");
  });
});

describe("getUserFriendlyMessage", () => {
  it("returns correct message for RATE_LIMIT", () => {
    const err = new ApiError("test", "RATE_LIMIT");
    expect(getUserFriendlyMessage(err)).toContain("breather");
  });

  it("returns correct message for REPLAY_DETECTED", () => {
    const err = new ApiError("test", "REPLAY_DETECTED");
    expect(getUserFriendlyMessage(err)).toContain("duplicate");
  });

  it("returns correct message for QUOTA_EXCEEDED", () => {
    const err = new ApiError("test", "QUOTA_EXCEEDED");
    expect(getUserFriendlyMessage(err)).toContain("limit");
  });

  it("returns correct message for BANNED", () => {
    const err = new ApiError("test", "BANNED");
    expect(getUserFriendlyMessage(err)).toContain("restricted");
  });

  it("returns correct message for UNAUTHORIZED", () => {
    const err = new ApiError("test", "UNAUTHORIZED");
    expect(getUserFriendlyMessage(err)).toContain("sign in");
  });

  it("returns correct message for VALIDATION_ERROR", () => {
    const err = new ApiError("test", "VALIDATION_ERROR");
    expect(getUserFriendlyMessage(err)).toContain("Double-check");
  });

  it("returns fallback for UNKNOWN", () => {
    const err = new ApiError("test", "UNKNOWN");
    expect(getUserFriendlyMessage(err)).toContain("Unexpected");
  });

  it("returns correct message for TIMEOUT", () => {
    const err = new ApiError("test", "TIMEOUT");
    expect(getUserFriendlyMessage(err)).toContain("took too long");
  });

  it("returns correct message for NETWORK_ERROR", () => {
    const err = new ApiError("test", "NETWORK_ERROR");
    expect(getUserFriendlyMessage(err)).toContain("Network error");
  });

  it("returns distance/radius message for TOO_FAR with valid numeric details", () => {
    const err = new ApiError("Too far", "TOO_FAR", 403, {
      distance: 250,
      radius: 100,
    });
    const msg = getUserFriendlyMessage(err);
    expect(msg).toContain("250m away");
    expect(msg).toContain("within 100m");
    expect(msg).toContain("Move closer");
  });

  it("returns generic TOO_FAR message when details are missing", () => {
    const err = new ApiError("Too far", "TOO_FAR", 403);
    const msg = getUserFriendlyMessage(err);
    expect(msg).toBe("You're too far from this spot. Move closer and try again.");
  });

  it("returns generic TOO_FAR message when distance/radius are not numbers", () => {
    const err = new ApiError("Too far", "TOO_FAR", 403, {
      distance: "far",
      radius: "close",
    });
    const msg = getUserFriendlyMessage(err);
    expect(msg).toBe("You're too far from this spot. Move closer and try again.");
  });

  it("returns generic TOO_FAR message when details is empty object", () => {
    const err = new ApiError("Too far", "TOO_FAR", 403, {});
    const msg = getUserFriendlyMessage(err);
    expect(msg).toBe("You're too far from this spot. Move closer and try again.");
  });

  it("maps TOO_FAR code from payload", () => {
    const err = normalizeApiError({ payload: { code: "TOO_FAR" } });
    expect(err.code).toBe("TOO_FAR");
  });
});
