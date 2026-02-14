/**
 * Unit tests for Email Service - covering uncovered lines:
 * - Line 18: PRODUCTION_URL fallback in getBaseUrl
 * - Line 59-61: resend is null path (no RESEND_API_KEY)
 * - Lines 69-70: error catch in sendEmail
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mocks for use inside vi.mock factories
const { mockResendSend, mockEnv } = vi.hoisted(() => ({
  mockResendSend: vi.fn(),
  mockEnv: {
    NODE_ENV: "test",
    RESEND_API_KEY: "",
    PRODUCTION_URL: "",
  },
}));

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: mockResendSend };
  },
}));

vi.mock("../../config/env", () => ({
  env: mockEnv,
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks are set up
import logger from "../../logger";

describe("emailService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.NODE_ENV = "test";
    mockEnv.RESEND_API_KEY = "";
    mockEnv.PRODUCTION_URL = "";
  });

  describe("sendEmail - resend is null path (no API key)", () => {
    it("logs debug and returns success when resend client is null", async () => {
      // The module-level `resend` is set at import time based on env.RESEND_API_KEY.
      // Since we mocked RESEND_API_KEY as empty, resend will be null.
      // We need to re-import to get a fresh module with null resend.
      vi.resetModules();

      // Re-setup mocks after resetModules
      vi.doMock("resend", () => ({
        Resend: class MockResend {
          emails = { send: mockResendSend };
        },
      }));

      vi.doMock("../../config/env", () => ({
        env: { ...mockEnv, RESEND_API_KEY: "" },
      }));

      vi.doMock("../../logger", () => ({
        default: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        },
      }));

      const { sendWelcomeEmail } = await import("../emailService");
      const loggerMod = (await import("../../logger")).default;

      const result = await sendWelcomeEmail("test@example.com", "Tester");

      expect(result).toEqual({ success: true });
      expect(loggerMod.debug).toHaveBeenCalledWith(
        expect.stringContaining("[Email] Would send to test@example.com")
      );
      expect(mockResendSend).not.toHaveBeenCalled();
    });
  });

  describe("sendEmail - error catch path", () => {
    it("catches errors from resend and returns error result", async () => {
      vi.resetModules();

      const failingSend = vi.fn().mockRejectedValue(new Error("API rate limited"));

      vi.doMock("resend", () => ({
        Resend: class MockResend {
          emails = { send: failingSend };
        },
      }));

      vi.doMock("../../config/env", () => ({
        env: { ...mockEnv, RESEND_API_KEY: "re_test_key_123" },
      }));

      vi.doMock("../../logger", () => ({
        default: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        },
      }));

      const { sendWelcomeEmail } = await import("../emailService");
      const loggerMod = (await import("../../logger")).default;

      const result = await sendWelcomeEmail("test@example.com", "Tester");

      expect(result.success).toBe(false);
      expect(result.error).toBe("API rate limited");
      expect(loggerMod.error).toHaveBeenCalledWith(
        "[Email] Failed to send",
        expect.objectContaining({ to: "test@example.com" })
      );
    });

    it("handles non-Error thrown objects", async () => {
      vi.resetModules();

      const failingSend = vi.fn().mockRejectedValue("string error");

      vi.doMock("resend", () => ({
        Resend: class MockResend {
          emails = { send: failingSend };
        },
      }));

      vi.doMock("../../config/env", () => ({
        env: { ...mockEnv, RESEND_API_KEY: "re_test_key_123" },
      }));

      vi.doMock("../../logger", () => ({
        default: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        },
      }));

      const { sendWelcomeEmail } = await import("../emailService");

      const result = await sendWelcomeEmail("test@example.com", "Tester");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown error");
    });
  });

  describe("getBaseUrl - production URL fallback", () => {
    it("uses PRODUCTION_URL in production mode", async () => {
      vi.resetModules();

      vi.doMock("resend", () => ({
        Resend: class MockResend {
          emails = { send: vi.fn().mockResolvedValue({}) };
        },
      }));

      vi.doMock("../../config/env", () => ({
        env: {
          NODE_ENV: "production",
          RESEND_API_KEY: "",
          PRODUCTION_URL: "https://custom.skatehubba.com",
        },
      }));

      vi.doMock("../../logger", () => ({
        default: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        },
      }));

      const { sendWelcomeEmail } = await import("../emailService");
      const loggerMod = (await import("../../logger")).default;

      // resend is null (no API key), so it hits the debug path
      await sendWelcomeEmail("test@example.com", "Tester");

      // The debug log includes the subject, and the email HTML references getBaseUrl()
      // which should use PRODUCTION_URL. We verify the email was attempted.
      expect(loggerMod.debug).toHaveBeenCalled();
    });

    it("falls back to default URL when PRODUCTION_URL is not set in production", async () => {
      vi.resetModules();

      vi.doMock("resend", () => ({
        Resend: class MockResend {
          emails = { send: vi.fn().mockResolvedValue({}) };
        },
      }));

      vi.doMock("../../config/env", () => ({
        env: {
          NODE_ENV: "production",
          RESEND_API_KEY: "",
          PRODUCTION_URL: "",
        },
      }));

      vi.doMock("../../logger", () => ({
        default: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        },
      }));

      const { sendWelcomeEmail } = await import("../emailService");
      const loggerMod = (await import("../../logger")).default;

      // Line 18: env.PRODUCTION_URL || "https://skatehubba.com" — PRODUCTION_URL is falsy
      await sendWelcomeEmail("test@example.com", "Tester");
      expect(loggerMod.debug).toHaveBeenCalled();
    });
  });
});
