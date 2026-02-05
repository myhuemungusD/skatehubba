import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so the mock fn is available during vi.mock hoisting
const { mockInfo } = vi.hoisted(() => ({
  mockInfo: vi.fn(),
}));

vi.mock("../logger", () => ({
  default: {
    child: vi.fn(() => ({
      info: mockInfo,
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
  createChildLogger: vi.fn(() => ({
    info: mockInfo,
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { logAuditEvent } from "./auditLog";

describe("logAuditEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs audit event with all fields", () => {
    logAuditEvent({
      userId: "user1",
      ip: "192.168.1.1",
      action: "login",
      metadata: { browser: "Chrome" },
    });

    expect(mockInfo).toHaveBeenCalledWith(
      "Audit event",
      expect.objectContaining({
        userId: "user1",
        ip: "192.168.1.1",
        action: "login",
        metadata: { browser: "Chrome" },
      })
    );
  });

  it("logs audit event without optional fields", () => {
    logAuditEvent({ action: "system_startup" });

    expect(mockInfo).toHaveBeenCalledWith(
      "Audit event",
      expect.objectContaining({
        action: "system_startup",
      })
    );
  });

  it("logs with null ip", () => {
    logAuditEvent({ userId: "u1", ip: null, action: "logout" });

    expect(mockInfo).toHaveBeenCalledWith(
      "Audit event",
      expect.objectContaining({
        userId: "u1",
        ip: null,
        action: "logout",
      })
    );
  });

  it("excludes metadata key when not provided", () => {
    logAuditEvent({ action: "test" });

    const payload = mockInfo.mock.calls[0][1];
    expect(payload).not.toHaveProperty("metadata");
  });
});
