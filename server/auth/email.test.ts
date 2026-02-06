import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSend, mockDebug } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockDebug: vi.fn(),
}));

// Default: no RESEND_API_KEY, so resend is null (uses debug logging fallback)
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
    warn: vi.fn(),
    error: vi.fn(),
    debug: mockDebug,
  },
}));

import { sendVerificationEmail, sendPasswordResetEmail } from "./email";

describe("sendVerificationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs verification URL when Resend is not configured", async () => {
    await sendVerificationEmail("test@example.com", "abc123", "Tony");
    expect(mockDebug).toHaveBeenCalledWith(
      expect.stringContaining("Verification email for test@example.com"),
      expect.objectContaining({
        verificationUrl: expect.stringContaining("verify-email?token=abc123"),
        name: "Tony",
        email: "test@example.com",
      })
    );
  });

  it("includes token in verification URL", async () => {
    await sendVerificationEmail("test@example.com", "my-token-123", "User");
    const logCall = mockDebug.mock.calls[0];
    expect(logCall[1].verificationUrl).toContain("token=my-token-123");
  });

  it("uses localhost URL in non-production", async () => {
    await sendVerificationEmail("test@example.com", "token", "User");
    const logCall = mockDebug.mock.calls[0];
    expect(logCall[1].verificationUrl).toContain("localhost:5000");
  });
});

describe("sendPasswordResetEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs reset URL when Resend is not configured", async () => {
    await sendPasswordResetEmail("test@example.com", "reset-token", "Tony");
    expect(mockDebug).toHaveBeenCalledWith(
      expect.stringContaining("Password reset email for test@example.com"),
      expect.objectContaining({
        resetUrl: expect.stringContaining("reset-password?token=reset-token"),
        name: "Tony",
        email: "test@example.com",
      })
    );
  });

  it("includes token in reset URL", async () => {
    await sendPasswordResetEmail("test@example.com", "xyz-789", "User");
    const logCall = mockDebug.mock.calls[0];
    expect(logCall[1].resetUrl).toContain("token=xyz-789");
  });
});
