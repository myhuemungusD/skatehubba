import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreateURL, mockCanOpenURL, mockOpenURL } = vi.hoisted(() => ({
  mockCreateURL: vi.fn(),
  mockCanOpenURL: vi.fn(),
  mockOpenURL: vi.fn(),
}));

vi.mock("expo-linking", () => ({
  createURL: mockCreateURL,
  canOpenURL: mockCanOpenURL,
  openURL: mockOpenURL,
}));

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

import { createDeepLink, createUniversalLink, gameLink, challengeLink, openLink } from "../linking";

describe("linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createDeepLink", () => {
    it("calls Linking.createURL with path", () => {
      mockCreateURL.mockReturnValue("skatehubba://game/123");
      const result = createDeepLink("game/123");
      expect(mockCreateURL).toHaveBeenCalledWith("game/123");
      expect(result).toBe("skatehubba://game/123");
    });
  });

  describe("createUniversalLink", () => {
    it("prepends origin to path", () => {
      expect(createUniversalLink("/game/123")).toBe("https://skatehubba.com/game/123");
    });

    it("normalizes path without leading slash", () => {
      expect(createUniversalLink("game/123")).toBe("https://skatehubba.com/game/123");
    });
  });

  describe("gameLink", () => {
    it("produces correct game URL", () => {
      expect(gameLink("abc123")).toBe("https://skatehubba.com/game/abc123");
    });
  });

  describe("challengeLink", () => {
    it("produces correct challenge URL", () => {
      expect(challengeLink("chal456")).toBe("https://skatehubba.com/challenge/chal456");
    });
  });

  describe("openLink", () => {
    it("opens URL when supported", async () => {
      mockCanOpenURL.mockResolvedValue(true);
      mockOpenURL.mockResolvedValue(undefined);
      await openLink("https://example.com");
      expect(mockCanOpenURL).toHaveBeenCalledWith("https://example.com");
      expect(mockOpenURL).toHaveBeenCalledWith("https://example.com");
    });

    it("does not open URL when not supported", async () => {
      mockCanOpenURL.mockResolvedValue(false);
      await openLink("https://unsupported.com");
      expect(mockOpenURL).not.toHaveBeenCalled();
    });
  });
});
