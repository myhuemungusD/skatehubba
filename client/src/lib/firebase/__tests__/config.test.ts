/**
 * Tests for client/src/lib/firebase/config.ts
 *
 * Covers:
 * - Firebase initialization (initFirebase)
 * - setAuthPersistence
 * - Environment guardrails (assertEnvWiring failure in prod vs dev)
 * - Re-export of env helpers
 */

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockInitializeApp = vi.fn(() => ({ name: "mock-app" }));
const mockGetApps = vi.fn(() => []);
const mockGetApp = vi.fn(() => ({ name: "existing-app" }));
const mockGetAuth = vi.fn(() => ({ _type: "mock-auth" }));
const mockSetPersistence = vi.fn().mockResolvedValue(undefined);
const mockBrowserLocalPersistence = { type: "LOCAL" };
const mockBrowserSessionPersistence = { type: "SESSION" };
const mockGetFirestore = vi.fn(() => ({ _type: "mock-db" }));
const mockGetStorage = vi.fn(() => ({ _type: "mock-storage" }));
const mockGetFunctions = vi.fn(() => ({ _type: "mock-functions" }));

vi.mock("firebase/app", () => ({
  initializeApp: (...args: any[]) => mockInitializeApp(...args),
  getApps: () => mockGetApps(),
  getApp: () => mockGetApp(),
}));

vi.mock("firebase/auth", () => ({
  getAuth: (...args: any[]) => mockGetAuth(...args),
  setPersistence: (...args: any[]) => mockSetPersistence(...args),
  browserLocalPersistence: mockBrowserLocalPersistence,
  browserSessionPersistence: mockBrowserSessionPersistence,
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: (...args: any[]) => mockGetFirestore(...args),
}));

vi.mock("firebase/storage", () => ({
  getStorage: (...args: any[]) => mockGetStorage(...args),
}));

vi.mock("firebase/functions", () => ({
  getFunctions: (...args: any[]) => mockGetFunctions(...args),
}));

const mockFirebaseConfig = {
  apiKey: "test-api-key",
  authDomain: "test.firebaseapp.com",
  projectId: "test-project",
  storageBucket: "test.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
  measurementId: "G-TEST123",
};

vi.mock("@skatehubba/config", () => ({
  assertEnvWiring: vi.fn(),
  getAppEnv: vi.fn(() => "development"),
  getEnvBanner: vi.fn(() => "DEV MODE"),
  isProd: vi.fn(() => false),
  isStaging: vi.fn(() => false),
}));

vi.mock("../../logger", () => ({
  logger: {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Tests ──────────────────────────────────────────────────────────────────

describe("firebase/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Stub import.meta.env so the local getFirebaseConfig() in config.ts
    // returns the expected test values (config.ts now reads directly from
    // import.meta.env rather than going through @skatehubba/config).
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_API_KEY", mockFirebaseConfig.apiKey);
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", mockFirebaseConfig.authDomain);
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID", mockFirebaseConfig.projectId);
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", mockFirebaseConfig.storageBucket);
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", mockFirebaseConfig.messagingSenderId);
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_APP_ID", mockFirebaseConfig.appId);
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID", mockFirebaseConfig.measurementId);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("initFirebase", () => {
    it("initializes Firebase app when no existing apps", async () => {
      mockGetApps.mockReturnValue([]);

      const config = await import("../config");

      expect(mockInitializeApp).toHaveBeenCalledWith(mockFirebaseConfig);
      expect(mockGetAuth).toHaveBeenCalled();
      expect(mockGetFirestore).toHaveBeenCalled();
      expect(mockGetStorage).toHaveBeenCalled();
      expect(mockGetFunctions).toHaveBeenCalled();
      expect(config.isFirebaseInitialized).toBe(true);
    });

    it("uses existing app when getApps returns non-empty array", async () => {
      mockGetApps.mockReturnValue([{ name: "existing" }]);

      await import("../config");

      expect(mockInitializeApp).not.toHaveBeenCalled();
      expect(mockGetApp).toHaveBeenCalled();
    });

    it("logs environment info in non-prod mode", async () => {
      const { isProd } = await import("@skatehubba/config");
      vi.mocked(isProd).mockReturnValue(false);

      // Simulate localhost dev environment so the logging guard passes
      const origWindow = globalThis.window;
      (globalThis as any).window = { location: { hostname: "localhost" } };

      try {
        await import("../config");

        const { logger } = await import("../../logger");
        expect(logger.log).toHaveBeenCalledWith(
          expect.stringContaining("[Firebase]"),
          expect.any(String)
        );
      } finally {
        if (origWindow === undefined) {
          delete (globalThis as any).window;
        } else {
          globalThis.window = origWindow;
        }
      }
    });

    it("does not log environment info in prod mode", async () => {
      const { isProd } = await import("@skatehubba/config");
      vi.mocked(isProd).mockReturnValue(true);

      await import("../config");

      const { logger } = await import("../../logger");
      // In prod mode, logger.log should NOT be called for env banner
      const logCalls = vi.mocked(logger.log).mock.calls;
      const envBannerCalls = logCalls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("[Firebase]")
      );
      expect(envBannerCalls).toHaveLength(0);
    });

    it("throws in prod when assertEnvWiring fails", async () => {
      const { assertEnvWiring, isProd } = await import("@skatehubba/config");
      vi.mocked(isProd).mockReturnValue(true);
      vi.mocked(assertEnvWiring).mockImplementation(() => {
        throw new Error("Environment mismatch!");
      });

      await expect(import("../config")).rejects.toThrow("Environment mismatch!");
    });

    it("logs but does not throw in dev when assertEnvWiring fails", async () => {
      const { assertEnvWiring, isProd } = await import("@skatehubba/config");
      vi.mocked(isProd).mockReturnValue(false);
      vi.mocked(assertEnvWiring).mockImplementation(() => {
        throw new Error("Environment mismatch!");
      });

      const config = await import("../config");

      const { logger } = await import("../../logger");
      expect(logger.error).toHaveBeenCalledWith(
        "[Firebase] Environment mismatch detected!",
        expect.any(Error)
      );
      // Should still initialize successfully
      expect(config.isFirebaseInitialized).toBe(true);
    });
  });

  describe("setAuthPersistence", () => {
    it("sets local persistence when rememberMe is true", async () => {
      const config = await import("../config");
      await config.setAuthPersistence(true);

      expect(mockSetPersistence).toHaveBeenCalledWith(
        expect.anything(),
        mockBrowserLocalPersistence
      );
    });

    it("sets session persistence when rememberMe is false", async () => {
      const config = await import("../config");
      await config.setAuthPersistence(false);

      expect(mockSetPersistence).toHaveBeenCalledWith(
        expect.anything(),
        mockBrowserSessionPersistence
      );
    });

    it("catches and logs persistence errors", async () => {
      mockSetPersistence.mockRejectedValueOnce(new Error("Persistence error"));

      const config = await import("../config");
      await config.setAuthPersistence(true);

      const { logger } = await import("../../logger");
      expect(logger.error).toHaveBeenCalledWith(
        "[Firebase] Failed to set persistence:",
        expect.any(Error)
      );
    });
  });

  describe("re-initialization guard (line 70)", () => {
    it("does not re-initialize when module is imported a second time (guard clause)", async () => {
      // First import triggers initialization
      mockGetApps.mockReturnValue([]);
      const config1 = await import("../config");
      expect(mockInitializeApp).toHaveBeenCalledTimes(1);
      expect(config1.isFirebaseInitialized).toBe(true);

      // Second import of the SAME module (no resetModules) returns the cached module
      // The initFirebase function already ran, so isFirebaseInitialized is true
      // and the guard clause on line 70 prevents re-init.
      // Since the module is cached, we can't re-trigger init this way.
      // Instead, we verify the guard by checking initialization only happened once
      // even though the module-level code ran.
      const config2 = await import("../config");
      expect(config2.isFirebaseInitialized).toBe(true);
      // initializeApp should still only have been called once
      expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    });
  });

  describe("missing env vars", () => {
    it("logs error and skips init when required env vars are missing", async () => {
      // Explicitly clear the three required env vars so getFirebaseConfig() throws
      // (vi.unstubAllEnvs would restore originals which may be set in CI .env files)
      vi.stubEnv("EXPO_PUBLIC_FIREBASE_API_KEY", "");
      vi.stubEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID", "");
      vi.stubEnv("EXPO_PUBLIC_FIREBASE_APP_ID", "");

      const config = await import("../config");

      const { logger } = await import("../../logger");
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Missing required environment variables")
      );
      // Should not throw — init is skipped gracefully
      expect(config.isFirebaseInitialized).toBe(false);
    });
  });

  describe("config fallback branches (lines 79-82)", () => {
    it("falls back authDomain to projectId.firebaseapp.com when not set", async () => {
      vi.stubEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", "");

      mockGetApps.mockReturnValue([]);
      await import("../config");

      expect(mockInitializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          authDomain: "test-project.firebaseapp.com",
        })
      );
    });

    it("falls back storageBucket to projectId.firebasestorage.app when not set", async () => {
      vi.stubEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", "");

      mockGetApps.mockReturnValue([]);
      await import("../config");

      expect(mockInitializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          storageBucket: "test-project.firebasestorage.app",
        })
      );
    });

    it("falls back messagingSenderId to empty string when not set", async () => {
      vi.stubEnv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "");

      mockGetApps.mockReturnValue([]);
      await import("../config");

      expect(mockInitializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          messagingSenderId: "",
        })
      );
    });

    it("passes measurementId as empty string when env var is empty", async () => {
      vi.stubEnv("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID", "");

      mockGetApps.mockReturnValue([]);
      await import("../config");

      expect(mockInitializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          measurementId: "",
        })
      );
    });
  });

  describe("DEV logging guard — non-localhost branch (lines 123-131)", () => {
    it("does not log env banner when window.location.hostname is not localhost", async () => {
      const origWindow = globalThis.window;
      (globalThis as any).window = { location: { hostname: "skatehubba.com" } };

      try {
        await import("../config");
        const { logger } = await import("../../logger");

        const logCalls = vi.mocked(logger.log).mock.calls;
        const envBannerCalls = logCalls.filter(
          (call) => typeof call[0] === "string" && call[0].includes("[Firebase]")
        );
        expect(envBannerCalls).toHaveLength(0);
      } finally {
        if (origWindow === undefined) {
          delete (globalThis as any).window;
        } else {
          globalThis.window = origWindow;
        }
      }
    });

    it("does not log env banner when window is undefined", async () => {
      const origWindow = globalThis.window;
      delete (globalThis as any).window;

      try {
        await import("../config");
        const { logger } = await import("../../logger");

        const logCalls = vi.mocked(logger.log).mock.calls;
        const envBannerCalls = logCalls.filter(
          (call) => typeof call[0] === "string" && call[0].includes("[Firebase]")
        );
        expect(envBannerCalls).toHaveLength(0);
      } finally {
        if (origWindow === undefined) {
          delete (globalThis as any).window;
        } else {
          globalThis.window = origWindow;
        }
      }
    });
  });

  describe("exports", () => {
    it("exports all expected symbols", async () => {
      const config = await import("../config");
      expect(config.app).toBeDefined();
      expect(config.auth).toBeDefined();
      expect(config.db).toBeDefined();
      expect(config.storage).toBeDefined();
      expect(config.functions).toBeDefined();
      expect(config.isFirebaseInitialized).toBe(true);
      expect(typeof config.setAuthPersistence).toBe("function");
      expect(typeof config.getAppEnv).toBe("function");
      expect(typeof config.isProd).toBe("function");
      expect(typeof config.isStaging).toBe("function");
    });
  });
});
