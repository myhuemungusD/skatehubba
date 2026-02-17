/**
 * @fileoverview Unit tests for Email module
 * @module server/__tests__/email.test
 *
 * Tests:
 * - Successful email send (sendMail called with correct options, logger.info called)
 * - Failed email send (sendMail rejects, logger.error called, no throw)
 * - Email HTML contains subscriber data (firstName and email)
 */

import { vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — vi.hoisted ensures these are available when vi.mock factories run
// ============================================================================

const { mockSendMail, mockLoggerInfo, mockLoggerError } = vi.hoisted(() => ({
  mockSendMail: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

vi.mock("../logger", () => ({
  default: {
    info: mockLoggerInfo,
    warn: vi.fn(),
    error: mockLoggerError,
    debug: vi.fn(),
  },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../config/env", () => ({
  env: {
    EMAIL_USER: "test-user@gmail.com",
    EMAIL_APP_PASSWORD: "test-app-password",
  },
}));

// ============================================================================
// Imports — after mocks are declared
// ============================================================================

import { sendSubscriberNotification } from "../email";

// ============================================================================
// Tests
// ============================================================================

describe("sendSubscriberNotification", () => {
  const subscriberData = {
    firstName: "Tony",
    email: "tony@example.com",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMail.mockResolvedValue({ messageId: "test-id" });
  });

  describe("successful email send", () => {
    it("should call sendMail with correct mail options", async () => {
      await sendSubscriberNotification(subscriberData);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.from).toBe("test-user@gmail.com");
      expect(mailOptions.to).toBe("jason@skatehubba.com");
      expect(mailOptions.subject).toContain("New SkateHubba Subscriber");
    });

    it("should log success via logger.info", async () => {
      await sendSubscriberNotification(subscriberData);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Subscriber notification email sent successfully"
      );
    });

    it("should not call logger.error on success", async () => {
      await sendSubscriberNotification(subscriberData);

      expect(mockLoggerError).not.toHaveBeenCalled();
    });
  });

  describe("failed email send", () => {
    const sendError = new Error("SMTP connection failed");

    beforeEach(() => {
      mockSendMail.mockRejectedValue(sendError);
    });

    it("should call logger.error with failure message and error details", async () => {
      await sendSubscriberNotification(subscriberData);

      expect(mockLoggerError).toHaveBeenCalledWith("Failed to send subscriber notification email", {
        error: String(sendError),
      });
    });

    it("should not throw when sendMail rejects", async () => {
      await expect(sendSubscriberNotification(subscriberData)).resolves.toBeUndefined();
    });

    it("should not call logger.info on failure", async () => {
      await sendSubscriberNotification(subscriberData);

      expect(mockLoggerInfo).not.toHaveBeenCalled();
    });
  });

  describe("email HTML content", () => {
    it("should include subscriber firstName in the HTML body", async () => {
      await sendSubscriberNotification(subscriberData);

      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.html).toContain(subscriberData.firstName);
    });

    it("should include subscriber email in the HTML body", async () => {
      await sendSubscriberNotification(subscriberData);

      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.html).toContain(subscriberData.email);
    });

    it("should include both firstName and email for different subscriber data", async () => {
      const otherSubscriber = {
        firstName: "Nyjah",
        email: "nyjah@skatepark.com",
      };

      await sendSubscriberNotification(otherSubscriber);

      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.html).toContain("Nyjah");
      expect(mailOptions.html).toContain("nyjah@skatepark.com");
    });
  });
});
