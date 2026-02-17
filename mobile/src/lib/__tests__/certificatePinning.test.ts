import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the config dependencies — all from the main entry point
// since the mobile tsconfig uses moduleResolution: "node"
vi.mock("@skatehubba/config", () => ({
  getAppEnv: vi.fn().mockReturnValue("local"),
  isProd: vi.fn().mockReturnValue(false),
  getCertificatePinningConfig: vi.fn().mockReturnValue({
    enabled: false,
    domains: [],
    pinExpiration: "",
    allowDebugOverrides: true,
  }),
  isDomainAllowed: vi.fn().mockReturnValue(true),
}));

import {
  getAppEnv,
  isProd,
  getCertificatePinningConfig,
  isDomainAllowed,
} from "@skatehubba/config";
import {
  initCertificatePinning,
  validateRequestDomain,
  reportPossiblePinningFailure,
  onPinningFailure,
  getRecentFailures,
  isPinningEnabled,
} from "../certificatePinning";

const mockGetAppEnv = getAppEnv as ReturnType<typeof vi.fn>;
const mockIsProd = isProd as ReturnType<typeof vi.fn>;
const mockGetConfig = getCertificatePinningConfig as ReturnType<typeof vi.fn>;
const mockIsDomainAllowed = isDomainAllowed as ReturnType<typeof vi.fn>;

describe("certificatePinning runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAppEnv.mockReturnValue("local");
    mockIsProd.mockReturnValue(false);
    mockGetConfig.mockReturnValue({
      enabled: false,
      domains: [],
      pinExpiration: "",
      allowDebugOverrides: true,
    });
    mockIsDomainAllowed.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initCertificatePinning", () => {
    it("initializes without error in local environment", () => {
      expect(() => initCertificatePinning()).not.toThrow();
    });

    it("initializes with enabled config in production", () => {
      mockGetConfig.mockReturnValue({
        enabled: true,
        domains: [{ hostname: "api.skatehubba.com", pins: [], includeSubdomains: false }],
        pinExpiration: "2027-06-01",
        allowDebugOverrides: false,
      });

      expect(() => initCertificatePinning()).not.toThrow();
    });
  });

  describe("validateRequestDomain", () => {
    it("allows all domains in local environment", () => {
      mockGetAppEnv.mockReturnValue("local");

      const result = validateRequestDomain("https://anything.example.com/api/test");

      expect(result.allowed).toBe(true);
    });

    it("allows domains in the allowlist in production", () => {
      mockGetAppEnv.mockReturnValue("prod");
      mockIsDomainAllowed.mockReturnValue(true);

      const result = validateRequestDomain("https://api.skatehubba.com/api/spots");

      expect(result.allowed).toBe(true);
      expect(result.hostname).toBe("api.skatehubba.com");
    });

    it("rejects domains not in the allowlist in production", () => {
      mockGetAppEnv.mockReturnValue("prod");
      mockIsDomainAllowed.mockReturnValue(false);

      const result = validateRequestDomain("https://evil.attacker.com/steal-tokens");

      expect(result.allowed).toBe(false);
      expect(result.hostname).toBe("evil.attacker.com");
      expect(result.reason).toContain("not in the allowed domains list");
    });

    it("allows relative URLs (no hostname to check)", () => {
      mockGetAppEnv.mockReturnValue("prod");

      const result = validateRequestDomain("/api/spots");

      expect(result.allowed).toBe(true);
    });

    it("records failure events for rejected domains", () => {
      mockGetAppEnv.mockReturnValue("prod");
      mockIsDomainAllowed.mockReturnValue(false);

      validateRequestDomain("https://evil.com/api");

      const failures = getRecentFailures();
      expect(failures.length).toBeGreaterThan(0);
      expect(failures[failures.length - 1].hostname).toBe("evil.com");
    });

    it("handles invalid URLs gracefully", () => {
      mockGetAppEnv.mockReturnValue("prod");

      const result = validateRequestDomain("not-a-valid-url");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Could not parse hostname");
    });
  });

  describe("onPinningFailure", () => {
    it("notifies listeners on domain rejection", () => {
      mockGetAppEnv.mockReturnValue("prod");
      mockIsDomainAllowed.mockReturnValue(false);

      const listener = vi.fn();
      const unsubscribe = onPinningFailure(listener);

      validateRequestDomain("https://evil.com/api");

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: "evil.com",
          reason: "Domain not in allowlist",
        })
      );

      unsubscribe();
    });

    it("unsubscribe stops notifications", () => {
      mockGetAppEnv.mockReturnValue("prod");
      mockIsDomainAllowed.mockReturnValue(false);

      const listener = vi.fn();
      const unsubscribe = onPinningFailure(listener);
      unsubscribe();

      validateRequestDomain("https://evil.com/api");

      expect(listener).not.toHaveBeenCalled();
    });

    it("does not crash when listener throws", () => {
      mockGetAppEnv.mockReturnValue("prod");
      mockIsDomainAllowed.mockReturnValue(false);

      const badListener = vi.fn().mockImplementation(() => {
        throw new Error("listener crash");
      });
      const unsubscribe = onPinningFailure(badListener);

      expect(() => {
        validateRequestDomain("https://evil.com/api");
      }).not.toThrow();

      unsubscribe();
    });
  });

  describe("reportPossiblePinningFailure", () => {
    it("records TLS-related errors when pinning is enabled", () => {
      mockGetConfig.mockReturnValue({
        enabled: true,
        domains: [{ hostname: "api.skatehubba.com", pins: [], includeSubdomains: false }],
        pinExpiration: "2027-06-01",
        allowDebugOverrides: false,
      });

      // Re-init to pick up the enabled config
      initCertificatePinning();

      const initialCount = getRecentFailures().length;

      reportPossiblePinningFailure(
        "https://api.skatehubba.com/api/spots",
        new Error("javax.net.ssl.SSLHandshakeException: certificate chain error")
      );

      const failures = getRecentFailures();
      expect(failures.length).toBe(initialCount + 1);
      expect(failures[failures.length - 1].reason).toContain("SSLHandshakeException");
    });

    it("ignores non-TLS errors", () => {
      mockGetConfig.mockReturnValue({
        enabled: true,
        domains: [{ hostname: "api.skatehubba.com", pins: [], includeSubdomains: false }],
        pinExpiration: "2027-06-01",
        allowDebugOverrides: false,
      });

      initCertificatePinning();

      const initialCount = getRecentFailures().length;

      reportPossiblePinningFailure("https://api.skatehubba.com/api/spots", new Error("timeout"));

      expect(getRecentFailures().length).toBe(initialCount);
    });

    it("does nothing when pinning is disabled", () => {
      mockGetConfig.mockReturnValue({
        enabled: false,
        domains: [],
        pinExpiration: "",
        allowDebugOverrides: true,
      });

      initCertificatePinning();

      const initialCount = getRecentFailures().length;

      reportPossiblePinningFailure("https://api.skatehubba.com/api/spots", new Error("SSL error"));

      expect(getRecentFailures().length).toBe(initialCount);
    });
  });

  describe("isPinningEnabled", () => {
    it("returns false when disabled", () => {
      mockGetConfig.mockReturnValue({
        enabled: false,
        domains: [],
        pinExpiration: "",
        allowDebugOverrides: true,
      });

      initCertificatePinning();

      expect(isPinningEnabled()).toBe(false);
    });

    it("returns true when enabled", () => {
      mockGetConfig.mockReturnValue({
        enabled: true,
        domains: [{ hostname: "api.skatehubba.com", pins: [], includeSubdomains: false }],
        pinExpiration: "2027-06-01",
        allowDebugOverrides: false,
      });

      initCertificatePinning();

      expect(isPinningEnabled()).toBe(true);
    });
  });

  describe("URL redaction", () => {
    it("redacts query parameters from failure events", () => {
      mockGetAppEnv.mockReturnValue("prod");
      mockIsDomainAllowed.mockReturnValue(false);

      validateRequestDomain("https://evil.com/api/data?token=secret123&user=john");

      const failures = getRecentFailures();
      const lastFailure = failures[failures.length - 1];
      expect(lastFailure.url).not.toContain("secret123");
      expect(lastFailure.url).not.toContain("token=");
      expect(lastFailure.url).toBe("https://evil.com/api/data");
    });
  });
});
