import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../env", () => ({
  getAppEnv: vi.fn(),
  getEnvOptional: vi.fn(),
}));

import { getAppEnv, getEnvOptional } from "../env";
import {
  getCertificatePinningConfig,
  getAllowedApiDomains,
  isDomainAllowed,
  isValidSpkiPin,
} from "../certificatePinning";

const mockGetAppEnv = getAppEnv as ReturnType<typeof vi.fn>;
const mockGetEnvOptional = getEnvOptional as ReturnType<typeof vi.fn>;

describe("certificatePinning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getCertificatePinningConfig", () => {
    it("returns disabled config in local environment", () => {
      mockGetAppEnv.mockReturnValue("local");
      mockGetEnvOptional.mockReturnValue(undefined);

      const config = getCertificatePinningConfig();

      expect(config.enabled).toBe(false);
      expect(config.domains).toHaveLength(0);
      expect(config.allowDebugOverrides).toBe(true);
    });

    it("returns disabled config when pins are not set in prod", () => {
      mockGetAppEnv.mockReturnValue("prod");
      mockGetEnvOptional.mockReturnValue(undefined);

      const config = getCertificatePinningConfig();

      expect(config.enabled).toBe(false);
      expect(config.domains).toHaveLength(0);
    });

    it("returns enabled config when production pins are configured", () => {
      mockGetAppEnv.mockReturnValue("prod");
      mockGetEnvOptional.mockImplementation((key: string) => {
        const env: Record<string, string> = {
          EXPO_PUBLIC_CERT_PIN_API_PRIMARY: "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg=",
          EXPO_PUBLIC_CERT_PIN_API_BACKUP: "Vjs8r4z+80wjNcr1YKepWQboSIRi63WsWXhIMN+eWys=",
        };
        return env[key] ?? undefined;
      });

      const config = getCertificatePinningConfig();

      expect(config.enabled).toBe(true);
      expect(config.domains).toHaveLength(1);
      expect(config.domains[0].hostname).toBe("api.skatehubba.com");
      expect(config.domains[0].pins).toHaveLength(2);
      expect(config.domains[0].pins[0].isPrimary).toBe(true);
      expect(config.domains[0].pins[1].isPrimary).toBe(false);
      expect(config.allowDebugOverrides).toBe(false);
    });

    it("returns enabled config for staging when staging pins are set", () => {
      mockGetAppEnv.mockReturnValue("staging");
      mockGetEnvOptional.mockImplementation((key: string) => {
        const env: Record<string, string> = {
          EXPO_PUBLIC_CERT_PIN_STAGING_PRIMARY: "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=",
          EXPO_PUBLIC_CERT_PIN_STAGING_BACKUP: "lCppFqbkrlJ3EcVFAkeip0+44VaoJUymbnOaEUk7tEU=",
        };
        return env[key] ?? undefined;
      });

      const config = getCertificatePinningConfig();

      expect(config.enabled).toBe(true);
      expect(config.domains).toHaveLength(1);
      expect(config.domains[0].hostname).toBe("staging-api.skatehubba.com");
    });

    it("ignores PLACEHOLDER pin values", () => {
      mockGetAppEnv.mockReturnValue("prod");
      mockGetEnvOptional.mockImplementation((key: string) => {
        const env: Record<string, string> = {
          EXPO_PUBLIC_CERT_PIN_API_PRIMARY: "PLACEHOLDER",
          EXPO_PUBLIC_CERT_PIN_API_BACKUP: "PLACEHOLDER",
        };
        return env[key] ?? undefined;
      });

      const config = getCertificatePinningConfig();

      expect(config.enabled).toBe(false);
    });

    it("uses custom expiration from env var", () => {
      mockGetAppEnv.mockReturnValue("prod");
      mockGetEnvOptional.mockImplementation((key: string) => {
        const env: Record<string, string> = {
          EXPO_PUBLIC_CERT_PIN_API_PRIMARY: "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg=",
          EXPO_PUBLIC_CERT_PIN_API_BACKUP: "Vjs8r4z+80wjNcr1YKepWQboSIRi63WsWXhIMN+eWys=",
          EXPO_PUBLIC_CERT_PIN_EXPIRATION: "2028-12-31",
        };
        return env[key] ?? undefined;
      });

      const config = getCertificatePinningConfig();

      expect(config.pinExpiration).toBe("2028-12-31");
    });

    it("requires both primary and backup pins", () => {
      mockGetAppEnv.mockReturnValue("prod");
      mockGetEnvOptional.mockImplementation((key: string) => {
        const env: Record<string, string> = {
          EXPO_PUBLIC_CERT_PIN_API_PRIMARY: "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg=",
        };
        return env[key] ?? undefined;
      });

      const config = getCertificatePinningConfig();

      expect(config.enabled).toBe(false);
    });
  });

  describe("getAllowedApiDomains", () => {
    it("returns production domains for prod", () => {
      mockGetAppEnv.mockReturnValue("prod");

      const domains = getAllowedApiDomains("prod");

      expect(domains).toContain("api.skatehubba.com");
      expect(domains).toContain("firestore.googleapis.com");
      expect(domains).toContain("securetoken.googleapis.com");
    });

    it("returns staging domains for staging", () => {
      mockGetAppEnv.mockReturnValue("staging");

      const domains = getAllowedApiDomains("staging");

      expect(domains).toContain("staging-api.skatehubba.com");
      expect(domains).not.toContain("api.skatehubba.com");
    });

    it("returns empty list for local", () => {
      mockGetAppEnv.mockReturnValue("local");

      const domains = getAllowedApiDomains("local");

      expect(domains).toHaveLength(0);
    });
  });

  describe("isDomainAllowed", () => {
    it("allows all domains in local environment", () => {
      mockGetAppEnv.mockReturnValue("local");

      expect(isDomainAllowed("any-domain.example.com", "local")).toBe(true);
      expect(isDomainAllowed("evil.attacker.com", "local")).toBe(true);
    });

    it("allows api.skatehubba.com in production", () => {
      mockGetAppEnv.mockReturnValue("prod");

      expect(isDomainAllowed("api.skatehubba.com", "prod")).toBe(true);
    });

    it("rejects unknown domains in production", () => {
      mockGetAppEnv.mockReturnValue("prod");

      expect(isDomainAllowed("evil.attacker.com", "prod")).toBe(false);
      expect(isDomainAllowed("staging-api.skatehubba.com", "prod")).toBe(false);
    });

    it("allows Firebase domains in production", () => {
      mockGetAppEnv.mockReturnValue("prod");

      expect(isDomainAllowed("firestore.googleapis.com", "prod")).toBe(true);
      expect(isDomainAllowed("securetoken.googleapis.com", "prod")).toBe(true);
    });

    it("allows localhost in staging but not production", () => {
      mockGetAppEnv.mockReturnValue("staging");
      expect(isDomainAllowed("localhost", "staging")).toBe(true);

      mockGetAppEnv.mockReturnValue("prod");
      expect(isDomainAllowed("localhost", "prod")).toBe(false);
    });
  });

  describe("isValidSpkiPin", () => {
    it("accepts valid base64 SHA-256 pins", () => {
      expect(isValidSpkiPin("YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg=")).toBe(true);
      expect(isValidSpkiPin("Vjs8r4z+80wjNcr1YKepWQboSIRi63WsWXhIMN+eWys=")).toBe(true);
    });

    it("rejects pins that are too short", () => {
      expect(isValidSpkiPin("hashA=")).toBe(false);
      expect(isValidSpkiPin("short")).toBe(false);
    });

    it("rejects pins that are too long", () => {
      expect(isValidSpkiPin("YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2FuihgEXTRA=")).toBe(false);
    });

    it("rejects pins without base64 padding", () => {
      expect(isValidSpkiPin("YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg")).toBe(false);
    });

    it("rejects pins with invalid characters", () => {
      expect(isValidSpkiPin("YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLM!BgFF2Fui$=")).toBe(false);
    });

    it("rejects empty strings", () => {
      expect(isValidSpkiPin("")).toBe(false);
    });
  });

  describe("pin validation", () => {
    it("rejects invalid-format pin from env var", () => {
      mockGetAppEnv.mockReturnValue("prod");
      mockGetEnvOptional.mockImplementation((key: string) => {
        const env: Record<string, string> = {
          EXPO_PUBLIC_CERT_PIN_API_PRIMARY: "not-a-valid-hash",
          EXPO_PUBLIC_CERT_PIN_API_BACKUP: "also-not-valid",
        };
        return env[key] ?? undefined;
      });

      const config = getCertificatePinningConfig();

      expect(config.enabled).toBe(false);
    });

    it("rejects duplicate primary and backup pins", () => {
      const samePin = "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg=";
      mockGetAppEnv.mockReturnValue("prod");
      mockGetEnvOptional.mockImplementation((key: string) => {
        const env: Record<string, string> = {
          EXPO_PUBLIC_CERT_PIN_API_PRIMARY: samePin,
          EXPO_PUBLIC_CERT_PIN_API_BACKUP: samePin,
        };
        return env[key] ?? undefined;
      });

      const config = getCertificatePinningConfig();

      expect(config.enabled).toBe(false);
      expect(config.domains).toHaveLength(0);
    });
  });
});
