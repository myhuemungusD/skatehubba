import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockInfo, mockWarn, mockError, mockDebug, mockExecute, mockIsDatabaseAvailable } =
  vi.hoisted(() => ({
    mockInfo: vi.fn(),
    mockWarn: vi.fn(),
    mockError: vi.fn(),
    mockDebug: vi.fn(),
    mockExecute: vi.fn(),
    mockIsDatabaseAvailable: vi.fn(),
  }));

vi.mock("../logger", () => ({
  default: {
    info: mockInfo,
    warn: mockWarn,
    error: mockError,
    debug: mockDebug,
  },
}));

vi.mock("../db", () => ({
  getDb: () => ({ execute: mockExecute }),
  isDatabaseAvailable: mockIsDatabaseAvailable,
}));

import { getClientIP, AuditLogger, AUDIT_EVENTS, type AuditLogEntry } from "./audit";

describe("AUDIT_EVENTS", () => {
  it("contains authentication events", () => {
    expect(AUDIT_EVENTS.LOGIN_SUCCESS).toBe("AUTH_LOGIN_SUCCESS");
    expect(AUDIT_EVENTS.LOGIN_FAILURE).toBe("AUTH_LOGIN_FAILURE");
    expect(AUDIT_EVENTS.LOGOUT).toBe("AUTH_LOGOUT");
    expect(AUDIT_EVENTS.SESSION_CREATED).toBe("AUTH_SESSION_CREATED");
    expect(AUDIT_EVENTS.SESSION_EXPIRED).toBe("AUTH_SESSION_EXPIRED");
    expect(AUDIT_EVENTS.SESSION_INVALIDATED).toBe("AUTH_SESSION_INVALIDATED");
  });

  it("contains account management events", () => {
    expect(AUDIT_EVENTS.ACCOUNT_CREATED).toBe("ACCOUNT_CREATED");
    expect(AUDIT_EVENTS.ACCOUNT_LOCKED).toBe("ACCOUNT_LOCKED");
    expect(AUDIT_EVENTS.ACCOUNT_UNLOCKED).toBe("ACCOUNT_UNLOCKED");
    expect(AUDIT_EVENTS.ACCOUNT_DEACTIVATED).toBe("ACCOUNT_DEACTIVATED");
  });

  it("contains password events", () => {
    expect(AUDIT_EVENTS.PASSWORD_CHANGED).toBe("PASSWORD_CHANGED");
    expect(AUDIT_EVENTS.PASSWORD_RESET_REQUESTED).toBe("PASSWORD_RESET_REQUESTED");
    expect(AUDIT_EVENTS.PASSWORD_RESET_COMPLETED).toBe("PASSWORD_RESET_COMPLETED");
  });

  it("contains MFA events", () => {
    expect(AUDIT_EVENTS.MFA_ENABLED).toBe("MFA_ENABLED");
    expect(AUDIT_EVENTS.MFA_DISABLED).toBe("MFA_DISABLED");
    expect(AUDIT_EVENTS.MFA_CHALLENGE_SUCCESS).toBe("MFA_CHALLENGE_SUCCESS");
    expect(AUDIT_EVENTS.MFA_CHALLENGE_FAILURE).toBe("MFA_CHALLENGE_FAILURE");
  });

  it("contains security events", () => {
    expect(AUDIT_EVENTS.SUSPICIOUS_ACTIVITY).toBe("SECURITY_SUSPICIOUS_ACTIVITY");
    expect(AUDIT_EVENTS.RATE_LIMIT_EXCEEDED).toBe("SECURITY_RATE_LIMIT");
    expect(AUDIT_EVENTS.CSRF_VIOLATION).toBe("SECURITY_CSRF_VIOLATION");
    expect(AUDIT_EVENTS.INVALID_TOKEN).toBe("SECURITY_INVALID_TOKEN");
  });
});

describe("getClientIP", () => {
  it("extracts IP from x-forwarded-for header (first IP)", () => {
    const req = {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    };
    expect(getClientIP(req)).toBe("1.2.3.4");
  });

  it("handles x-forwarded-for as array", () => {
    const req = {
      headers: { "x-forwarded-for": ["10.0.0.1, 10.0.0.2"] },
    };
    expect(getClientIP(req)).toBe("10.0.0.1");
  });

  it("extracts IP from x-real-ip header", () => {
    const req = {
      headers: { "x-real-ip": "192.168.1.1" },
    };
    expect(getClientIP(req)).toBe("192.168.1.1");
  });

  it("handles x-real-ip as array", () => {
    const req = {
      headers: { "x-real-ip": ["172.16.0.1"] },
    };
    expect(getClientIP(req)).toBe("172.16.0.1");
  });

  it("falls back to req.ip", () => {
    const req = {
      headers: {},
      ip: "127.0.0.1",
    };
    expect(getClientIP(req)).toBe("127.0.0.1");
  });

  it("falls back to socket remoteAddress", () => {
    const req = {
      headers: {},
      socket: { remoteAddress: "::1" },
    };
    expect(getClientIP(req)).toBe("::1");
  });

  it("returns 'unknown' when no IP available", () => {
    const req = { headers: {} };
    expect(getClientIP(req)).toBe("unknown");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    const req = {
      headers: {
        "x-forwarded-for": "1.1.1.1",
        "x-real-ip": "2.2.2.2",
      },
    };
    expect(getClientIP(req)).toBe("1.1.1.1");
  });
});

describe("AuditLogger.log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDatabaseAvailable.mockReturnValue(true);
    mockExecute.mockResolvedValue(undefined);
  });

  it("logs successful events with logger.info", async () => {
    await AuditLogger.log({
      eventType: AUDIT_EVENTS.LOGIN_SUCCESS,
      userId: "u1",
      email: "test@example.com",
      ipAddress: "1.2.3.4",
      success: true,
    });
    expect(mockInfo).toHaveBeenCalledWith(
      "AUDIT: AUTH_LOGIN_SUCCESS",
      expect.objectContaining({ success: true })
    );
  });

  it("logs failed events with logger.warn", async () => {
    await AuditLogger.log({
      eventType: AUDIT_EVENTS.LOGIN_FAILURE,
      ipAddress: "1.2.3.4",
      success: false,
      errorMessage: "Invalid credentials",
    });
    expect(mockWarn).toHaveBeenCalledWith(
      "AUDIT: AUTH_LOGIN_FAILURE",
      expect.objectContaining({ success: false, error: "Invalid credentials" })
    );
  });

  it("writes to database when available", async () => {
    await AuditLogger.log({
      eventType: AUDIT_EVENTS.LOGIN_SUCCESS,
      userId: "u1",
      ipAddress: "1.2.3.4",
      success: true,
    });
    expect(mockExecute).toHaveBeenCalled();
  });

  it("skips database when not available", async () => {
    mockIsDatabaseAvailable.mockReturnValue(false);
    await AuditLogger.log({
      eventType: AUDIT_EVENTS.LOGIN_SUCCESS,
      ipAddress: "1.2.3.4",
      success: true,
    });
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDebug).toHaveBeenCalledWith("Database not available for audit logging");
  });

  it("handles database errors gracefully", async () => {
    mockExecute.mockRejectedValue(new Error("DB connection lost"));
    await AuditLogger.log({
      eventType: AUDIT_EVENTS.LOGIN_SUCCESS,
      ipAddress: "1.2.3.4",
      success: true,
    });
    expect(mockError).toHaveBeenCalledWith(
      "Failed to write audit log to database",
      expect.objectContaining({ error: "DB connection lost" })
    );
  });
});

describe("AuditLogger helper methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDatabaseAvailable.mockReturnValue(true);
    mockExecute.mockResolvedValue(undefined);
  });

  it("logLoginSuccess logs with correct event type and metadata", async () => {
    await AuditLogger.logLoginSuccess("u1", "test@test.com", "1.2.3.4", "Mozilla/5.0", "google");
    expect(mockInfo).toHaveBeenCalledWith(
      "AUDIT: AUTH_LOGIN_SUCCESS",
      expect.objectContaining({
        userId: "u1",
        email: "test@test.com",
        success: true,
        metadata: { provider: "google" },
      })
    );
  });

  it("logLoginSuccess uses firebase as default provider", async () => {
    await AuditLogger.logLoginSuccess("u1", "test@test.com", "1.2.3.4");
    expect(mockInfo).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        metadata: { provider: "firebase" },
      })
    );
  });

  it("logLoginFailure logs failure event", async () => {
    await AuditLogger.logLoginFailure("bad@test.com", "1.2.3.4", "Mozilla/5.0", "Invalid password");
    expect(mockWarn).toHaveBeenCalledWith(
      "AUDIT: AUTH_LOGIN_FAILURE",
      expect.objectContaining({
        email: "bad@test.com",
        success: false,
        error: "Invalid password",
      })
    );
  });

  it("logLogout logs success event", async () => {
    await AuditLogger.logLogout("u1", "test@test.com", "1.2.3.4");
    expect(mockInfo).toHaveBeenCalledWith(
      "AUDIT: AUTH_LOGOUT",
      expect.objectContaining({ userId: "u1", success: true })
    );
  });

  it("logAccountLocked logs with attempt count", async () => {
    await AuditLogger.logAccountLocked("u1", "test@test.com", "1.2.3.4", 5);
    expect(mockInfo).toHaveBeenCalledWith(
      "AUDIT: ACCOUNT_LOCKED",
      expect.objectContaining({
        metadata: { failedAttempts: 5, reason: "max_attempts_exceeded" },
      })
    );
  });

  it("logPasswordChanged logs success event", async () => {
    await AuditLogger.logPasswordChanged("u1", "test@test.com", "1.2.3.4");
    expect(mockInfo).toHaveBeenCalledWith(
      "AUDIT: PASSWORD_CHANGED",
      expect.objectContaining({ success: true })
    );
  });

  it("logPasswordResetRequested always logs success to prevent enumeration", async () => {
    await AuditLogger.logPasswordResetRequested("test@test.com", "1.2.3.4", false);
    expect(mockInfo).toHaveBeenCalledWith(
      "AUDIT: PASSWORD_RESET_REQUESTED",
      expect.objectContaining({
        success: true,
        metadata: { accountFound: false },
      })
    );
  });

  it("logMfaEvent maps 'enabled' correctly", async () => {
    await AuditLogger.logMfaEvent("u1", "test@test.com", "1.2.3.4", "enabled");
    expect(mockInfo).toHaveBeenCalledWith(
      "AUDIT: MFA_ENABLED",
      expect.objectContaining({ success: true })
    );
  });

  it("logMfaEvent maps 'failure' to unsuccessful event", async () => {
    await AuditLogger.logMfaEvent("u1", "test@test.com", "1.2.3.4", "failure");
    expect(mockWarn).toHaveBeenCalledWith(
      "AUDIT: MFA_CHALLENGE_FAILURE",
      expect.objectContaining({ success: false })
    );
  });

  it("logMfaEvent maps 'success' correctly", async () => {
    await AuditLogger.logMfaEvent("u1", "test@test.com", "1.2.3.4", "success");
    expect(mockInfo).toHaveBeenCalledWith(
      "AUDIT: MFA_CHALLENGE_SUCCESS",
      expect.objectContaining({ success: true })
    );
  });

  it("logMfaEvent maps 'disabled' correctly", async () => {
    await AuditLogger.logMfaEvent("u1", "test@test.com", "1.2.3.4", "disabled");
    expect(mockInfo).toHaveBeenCalledWith(
      "AUDIT: MFA_DISABLED",
      expect.objectContaining({ success: true })
    );
  });

  it("logSuspiciousActivity logs failure event", async () => {
    await AuditLogger.logSuspiciousActivity("1.2.3.4", "Brute force detected", { attempts: 100 });
    expect(mockWarn).toHaveBeenCalledWith(
      "AUDIT: SECURITY_SUSPICIOUS_ACTIVITY",
      expect.objectContaining({
        success: false,
        error: "Brute force detected",
        metadata: { attempts: 100 },
      })
    );
  });

  it("logSessionsInvalidated logs with reason", async () => {
    await AuditLogger.logSessionsInvalidated("u1", "test@test.com", "1.2.3.4", "password_change");
    expect(mockInfo).toHaveBeenCalledWith(
      "AUDIT: AUTH_SESSION_INVALIDATED",
      expect.objectContaining({
        success: true,
        metadata: { reason: "password_change" },
      })
    );
  });
});
