/**
 * Coverage test for server/admin.ts — uncovered line 34
 *
 * Line 34: `logger.warn("Server-side App Check initialization failed:", { appCheckError });`
 * This is inside a try/catch at line 30-35, within the production block.
 * The try block at line 31 just logs info, and line 33 catches if that throws.
 *
 * Looking at the source:
 *   if (env.NODE_ENV === "production") {
 *     try {
 *       logger.info("Firebase App Check enabled for server-side protection");
 *     } catch (appCheckError) {
 *       logger.warn("Server-side App Check initialization failed:", { appCheckError });  // line 34
 *     }
 *   }
 *
 * To hit line 34, we need:
 * - NODE_ENV === "production"
 * - logger.info to throw during the App Check block
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

describe("admin.ts — line 34 (App Check catch block)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("catches App Check initialization failure in production", async () => {
    let infoCallCount = 0;
    const mockWarn = vi.fn();
    const mockInfo = vi.fn().mockImplementation((msg: string) => {
      infoCallCount++;
      // The first logger.info call is "Firebase Admin SDK initialized" — let it pass
      // The second logger.info call is "Firebase App Check enabled..." — make it throw
      if (infoCallCount === 2) {
        throw new Error("App Check logger crash");
      }
    });

    vi.doMock("../logger", () => ({
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

    vi.doMock("../config/env", () => ({
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
    const mockApplicationDefault = vi.fn().mockReturnValue({ type: "appDefault" });

    vi.doMock("firebase-admin", () => ({
      default: {
        apps: [], // Empty so initialization runs
        credential: {
          cert: mockCert,
          applicationDefault: mockApplicationDefault,
        },
        initializeApp: mockInitializeApp,
      },
    }));

    await import("../admin");

    // The warn should be called with App Check failure message
    expect(mockWarn).toHaveBeenCalledWith(
      "Server-side App Check initialization failed:",
      expect.objectContaining({ appCheckError: expect.any(Error) })
    );
  });
});
