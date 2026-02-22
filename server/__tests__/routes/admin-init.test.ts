/**
 * @fileoverview Unit tests for Firebase Admin SDK initialization (admin.ts)
 *
 * Tests:
 * - Initialization with service account JSON
 * - Initialization with explicit credentials
 * - Initialization with applicationDefault
 * - Failed FIREBASE_ADMIN_KEY parse
 * - Production app check logging
 * - Complete initialization failure
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger
vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock env with various configs
let mockEnv: any = {
  NODE_ENV: "test",
  FIREBASE_ADMIN_KEY: undefined,
  FIREBASE_PROJECT_ID: undefined,
  FIREBASE_CLIENT_EMAIL: undefined,
  FIREBASE_PRIVATE_KEY: undefined,
};

vi.mock("../../config/env", () => ({
  get env() {
    return mockEnv;
  },
}));

// Track firebase-admin calls
const mockCert = vi.fn().mockReturnValue({ type: "cert" });
const mockApplicationDefault = vi.fn().mockReturnValue({ type: "appDefault" });
const mockInitializeApp = vi.fn();

vi.mock("firebase-admin", () => ({
  default: {
    apps: [],
    credential: {
      cert: (...args: any[]) => mockCert(...args),
      applicationDefault: () => mockApplicationDefault(),
    },
    initializeApp: (...args: any[]) => mockInitializeApp(...args),
  },
}));

describe("admin.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = {
      NODE_ENV: "test",
      FIREBASE_ADMIN_KEY: undefined,
      FIREBASE_PROJECT_ID: undefined,
      FIREBASE_CLIENT_EMAIL: undefined,
      FIREBASE_PRIVATE_KEY: undefined,
    };
  });

  it("should use applicationDefault when no credentials provided", async () => {
    vi.resetModules();
    // Override apps to be empty array
    const admin = (await import("firebase-admin")).default;
    (admin as any).apps = [];

    await import("../../admin");

    expect(mockApplicationDefault).toHaveBeenCalled();
    expect(mockInitializeApp).toHaveBeenCalled();
  });

  it("should use cert with service account JSON when FIREBASE_ADMIN_KEY is valid JSON", async () => {
    vi.resetModules();
    mockEnv.FIREBASE_ADMIN_KEY = JSON.stringify({
      project_id: "test",
      client_email: "test@test.iam.gserviceaccount.com",
      private_key: "-----BEGIN MOCK KEY-----\ntest\n-----END MOCK KEY-----\n",
    });

    const admin = (await import("firebase-admin")).default;
    (admin as any).apps = [];

    await import("../../admin");

    expect(mockCert).toHaveBeenCalledWith(expect.objectContaining({ project_id: "test" }));
    expect(mockInitializeApp).toHaveBeenCalled();
  });

  it("should use cert with explicit credentials when provided", async () => {
    vi.resetModules();
    mockEnv.FIREBASE_PROJECT_ID = "my-project";
    mockEnv.FIREBASE_CLIENT_EMAIL = "test@test.iam.gserviceaccount.com";
    mockEnv.FIREBASE_PRIVATE_KEY = "-----BEGIN MOCK KEY-----\\ntest\\n-----END MOCK KEY-----\\n";

    const admin = (await import("firebase-admin")).default;
    (admin as any).apps = [];

    await import("../../admin");

    expect(mockCert).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "my-project",
        clientEmail: "test@test.iam.gserviceaccount.com",
      })
    );
    expect(mockInitializeApp).toHaveBeenCalled();
  });

  it("should handle invalid FIREBASE_ADMIN_KEY JSON gracefully", async () => {
    vi.resetModules();
    mockEnv.FIREBASE_ADMIN_KEY = "not-valid-json";

    const admin = (await import("firebase-admin")).default;
    (admin as any).apps = [];
    const logger = (await import("../../logger")).default;

    await import("../../admin");

    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to parse FIREBASE_ADMIN_KEY:",
      expect.any(Object)
    );
  });

  it("should handle initialization failure gracefully", async () => {
    vi.resetModules();

    const admin = (await import("firebase-admin")).default;
    (admin as any).apps = [];
    mockInitializeApp.mockImplementationOnce(() => {
      throw new Error("Firebase init failed");
    });
    const logger = (await import("../../logger")).default;

    await import("../../admin");

    expect(logger.warn).toHaveBeenCalledWith(
      "Firebase Admin initialization failed:",
      expect.any(Object)
    );
  });

  it("should not re-initialize when apps already exist", async () => {
    vi.resetModules();

    const admin = (await import("firebase-admin")).default;
    (admin as any).apps = [{ name: "[DEFAULT]" }];

    await import("../../admin");

    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it("should log App Check message in production", async () => {
    vi.resetModules();
    mockEnv.NODE_ENV = "production";

    const admin = (await import("firebase-admin")).default;
    (admin as any).apps = [];
    const logger = (await import("../../logger")).default;

    await import("../../admin");

    expect(logger.info).toHaveBeenCalledWith(
      "Firebase App Check enabled for server-side protection"
    );
  });
});
