/**
 * @fileoverview Additional branch coverage for client/src/lib/firebase/config.ts
 *
 * Covers uncovered branches:
 * - Lines 65-77: getFirebaseConfig() when required env vars are missing (throws Error)
 * - Lines 117-121: initFirebase() catch block when getFirebaseConfig() throws (logs error, returns early)
 * - Line 80: authDomain fallback when not set
 * - Line 82: storageBucket fallback when not set
 * - Line 83: messagingSenderId fallback when not set
 */

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockInitializeApp = vi.fn(() => ({ name: "mock-app" }));
const mockGetApps = vi.fn(() => []);
const mockGetApp = vi.fn(() => ({ name: "existing-app" }));
const mockGetAuth = vi.fn(() => ({ _type: "mock-auth" }));
const mockSetPersistence = vi.fn().mockResolvedValue(undefined);
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
  browserLocalPersistence: { type: "LOCAL" },
  browserSessionPersistence: { type: "SESSION" },
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

describe("firebase/config — missing env vars branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("logs error and returns early when apiKey is missing (lines 65-77, 117-121)", async () => {
    // Set projectId and appId but NOT apiKey
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_API_KEY", "");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID", "test-project");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_APP_ID", "1:123:web:abc");

    const config = await import("../config");

    const { logger } = await import("../../logger");
    // getFirebaseConfig() throws, initFirebase() catches and logs
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Missing required environment variables")
    );
    // Firebase should NOT be initialized
    expect(config.isFirebaseInitialized).toBe(false);
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it("logs error when projectId is missing", async () => {
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_API_KEY", "test-key");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID", "");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_APP_ID", "1:123:web:abc");

    const config = await import("../config");

    const { logger } = await import("../../logger");
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("EXPO_PUBLIC_FIREBASE_PROJECT_ID")
    );
    expect(config.isFirebaseInitialized).toBe(false);
  });

  it("logs error when appId is missing", async () => {
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_API_KEY", "test-key");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID", "test-project");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_APP_ID", "");

    const config = await import("../config");

    const { logger } = await import("../../logger");
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("EXPO_PUBLIC_FIREBASE_APP_ID")
    );
    expect(config.isFirebaseInitialized).toBe(false);
  });

  it("logs error listing all missing vars when all three are missing", async () => {
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_API_KEY", "");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID", "");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_APP_ID", "");

    await import("../config");

    const { logger } = await import("../../logger");
    const errorCall = vi.mocked(logger.error).mock.calls[0]?.[0];
    expect(errorCall).toContain("EXPO_PUBLIC_FIREBASE_API_KEY");
    expect(errorCall).toContain("EXPO_PUBLIC_FIREBASE_PROJECT_ID");
    expect(errorCall).toContain("EXPO_PUBLIC_FIREBASE_APP_ID");
  });

  it("uses fallback authDomain when not set (line 80)", async () => {
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_API_KEY", "test-key");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", "");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID", "my-project");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", "my-bucket");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "12345");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_APP_ID", "1:123:web:abc");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID", "");

    mockGetApps.mockReturnValue([]);

    await import("../config");

    expect(mockInitializeApp).toHaveBeenCalledWith(
      expect.objectContaining({
        authDomain: "my-project.firebaseapp.com",
      })
    );
  });

  it("uses fallback storageBucket when not set (line 82)", async () => {
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_API_KEY", "test-key");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", "test.firebaseapp.com");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID", "my-project");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", "");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "12345");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_APP_ID", "1:123:web:abc");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID", "");

    mockGetApps.mockReturnValue([]);

    await import("../config");

    expect(mockInitializeApp).toHaveBeenCalledWith(
      expect.objectContaining({
        storageBucket: "my-project.firebasestorage.app",
      })
    );
  });

  it("uses empty string for messagingSenderId when not set (line 83)", async () => {
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_API_KEY", "test-key");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", "test.firebaseapp.com");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID", "my-project");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", "my-bucket");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_APP_ID", "1:123:web:abc");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID", "");

    mockGetApps.mockReturnValue([]);

    await import("../config");

    expect(mockInitializeApp).toHaveBeenCalledWith(
      expect.objectContaining({
        messagingSenderId: "",
      })
    );
  });
});
