/**
 * Branch coverage tests for server/services/emailService.ts
 * Lines 203 (pendingChallenges > 0) and 283 (opponentName fallback)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn().mockResolvedValue({ data: { id: "msg-1" } });

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: mockSend };
  },
}));

vi.mock("../../config/env", () => ({
  env: {
    RESEND_API_KEY: "re_test_key",
    NODE_ENV: "test",
    PRODUCTION_URL: "https://skatehubba.com",
  },
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { sendWeeklyDigestEmail, sendGameEventEmail } = await import(
  "../../services/emailService"
);

describe("emailService branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: "msg-1" } });
  });

  it("line 203: renders pending challenges row when pendingChallenges > 0", async () => {
    const result = await sendWeeklyDigestEmail("a@b.com", "Test", {
      gamesPlayed: 5,
      gamesWon: 2,
      spotsVisited: 3,
      pendingChallenges: 2,
    });

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalled();
    const html = mockSend.mock.calls[0][0].html;
    expect(html).toContain("Pending Challenges");
    expect(html).toContain("Answer Challenges");
  });

  it("line 283: uses 'Your opponent' fallback when opponentName is undefined", async () => {
    const result = await sendGameEventEmail("a@b.com", "Test", {
      type: "your_turn",
      gameId: "game-1",
      // no opponentName
    });

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalled();
    const html = mockSend.mock.calls[0][0].html;
    expect(html).toContain("Your opponent");
  });
});
