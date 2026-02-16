import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSend, mockWarn } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockWarn: vi.fn(),
}));

// Default: no RESEND_API_KEY, so resend is null (uses warn logging fallback)
vi.mock("../config/env", () => ({
  env: {
    RESEND_API_KEY: "",
    NODE_ENV: "test",
    PRODUCTION_URL: "https://skatehubba.com",
  },
}));

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: mockSend };
  },
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: mockWarn,
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { sendVerificationEmail, sendPasswordResetEmail } from "./email";

describe("sendVerificationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warns when Resend is not configured (no PII in message)", async () => {
    await sendVerificationEmail("test@example.com", "abc123", "Tony");
    expect(mockWarn).toHaveBeenCalledWith(
      "Verification email not sent (RESEND_API_KEY not configured)",
      expect.objectContaining({ email: "test@example.com" })
    );
  });

  it("does not leak verification token in log context", async () => {
    await sendVerificationEmail("test@example.com", "my-token-123", "User");
    const logCall = mockWarn.mock.calls[0];
    // Structured context should contain email but NOT the token URL
    expect(logCall[1]).not.toHaveProperty("verificationUrl");
    expect(JSON.stringify(logCall[1])).not.toContain("my-token-123");
  });

  it("does not interpolate email into log message string", async () => {
    await sendVerificationEmail("test@example.com", "token", "User");
    const logMessage = mockWarn.mock.calls[0][0];
    expect(logMessage).not.toContain("test@example.com");
  });
});

describe("sendPasswordResetEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warns when Resend is not configured (no PII in message)", async () => {
    await sendPasswordResetEmail("test@example.com", "reset-token", "Tony");
    expect(mockWarn).toHaveBeenCalledWith(
      "Password reset email not sent (RESEND_API_KEY not configured)",
      expect.objectContaining({ email: "test@example.com" })
    );
  });

  it("does not leak reset token in log context", async () => {
    await sendPasswordResetEmail("test@example.com", "xyz-789", "User");
    const logCall = mockWarn.mock.calls[0];
    expect(logCall[1]).not.toHaveProperty("resetUrl");
    expect(JSON.stringify(logCall[1])).not.toContain("xyz-789");
  });
});
