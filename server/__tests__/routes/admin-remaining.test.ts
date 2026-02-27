/**
 * Coverage test for server/admin.ts — ADC failure path
 *
 * When no valid Firebase credentials are provided (no FIREBASE_ADMIN_KEY,
 * no individual env vars), admin.ts falls back to Application Default
 * Credentials. If ADC also fails, it should log a descriptive warning
 * telling the user which env vars to set.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

describe("admin.ts — ADC failure path", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("warns when ADC fallback also fails", async () => {
    const mockWarn = vi.fn();
    const mockInfo = vi.fn();

    vi.doMock("../../logger", () => ({
      default: {
        info: mockInfo,
        warn: mockWarn,
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

    vi.doMock("../../config/env", () => ({
      env: {
        NODE_ENV: "production",
        FIREBASE_ADMIN_KEY: undefined,
        FIREBASE_PROJECT_ID: undefined,
        FIREBASE_CLIENT_EMAIL: undefined,
        FIREBASE_PRIVATE_KEY: undefined,
      },
    }));

    const mockInitializeApp = vi.fn();
    const mockCert = vi.fn().mockReturnValue({ type: "cert" });
    const mockApplicationDefault = vi.fn().mockImplementation(() => {
      throw new Error("Could not load the default credentials");
    });

    vi.doMock("firebase-admin", () => ({
      default: {
        apps: [],
        credential: {
          cert: mockCert,
          applicationDefault: mockApplicationDefault,
        },
        initializeApp: mockInitializeApp,
      },
    }));

    await import("../../admin");

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("Firebase Admin SDK could not initialize"),
      expect.objectContaining({ adcError: expect.any(Error) })
    );
  });
});
