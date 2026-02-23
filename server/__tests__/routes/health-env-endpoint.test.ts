/**
 * Tests for the GET /api/health/env diagnostic endpoint.
 *
 * Covers every branch in the handler:
 *   - HTTP 200 vs 503 (allRequiredSet × dbHealth)
 *   - checkVars: set:true (present), set:false (absent), set:false (whitespace-only)
 *   - firebaseAdminSdk: "initialized" | "not_initialized" | "error"
 *   - gitBranch / gitSha present vs null
 *   - vercelEnv present vs null
 *   - nodeEnv present vs null
 *   - full response shape
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Stable mocks (must be hoisted before any import) ──────────────────────────

vi.mock("../../logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../../config/env", () => ({
  env: { DATABASE_URL: "mock://test", NODE_ENV: "test" },
}));

let mockDbQueryError: Error | null = null;
let mockGetDbShouldThrow = false;

vi.mock("../../db", () => ({
  getDb: () => {
    if (mockGetDbShouldThrow) throw new Error("Database not configured");
    return {
      execute: async () => {
        if (mockDbQueryError) throw mockDbQueryError;
        return "ok";
      },
    };
  },
  isDatabaseAvailable: () => !mockGetDbShouldThrow,
}));

vi.mock("../../redis", () => ({ getRedisClient: () => null }));
vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray) => ({ _sql: strings.join("?") }),
}));
vi.mock("../../services/videoTranscoder", () => ({
  checkFfmpegAvailable: async () => ({ ffmpeg: true, ffprobe: true }),
}));
vi.mock("../../auth/middleware", () => ({
  authenticateUser: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

// ── Controllable firebase-admin mock ──────────────────────────────────────────
// The env route does `await import("firebase-admin")` on every request. Vitest
// returns the same module-cache object, so mutating its properties per-test
// gives full control over all three SDK status branches.
const mockFirebaseAdmin: { default: { apps: unknown[] } | null } = {
  default: { apps: [] },
};
vi.mock("firebase-admin", () => mockFirebaseAdmin);

// ── Import after mocks are wired ──────────────────────────────────────────────
const { registerMonitoringRoutes } = await import("../../monitoring/index");

// ── Env-var keys touched by the route ─────────────────────────────────────────
const ENV_KEYS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "JWT_SECRET",
  "MFA_ENCRYPTION_KEY",
  "FIREBASE_ADMIN_KEY",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
  "VERCEL_ENV",
  "VERCEL_GIT_COMMIT_REF",
  "VERCEL_GIT_COMMIT_SHA",
] as const;

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeMockRes() {
  let statusCode = 200;
  const jsonPayloads: unknown[] = [];
  const res: {
    statusCode: number;
    on: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    _json: () => Record<string, unknown>;
  } = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(v: number) {
      statusCode = v;
    },
    on: vi.fn(() => res),
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((data: unknown) => {
      jsonPayloads.push(data);
      return res;
    }),
    _json: () => jsonPayloads[0] as Record<string, unknown>,
  };
  return res;
}

function buildRoutes() {
  const routes: Record<string, (...args: unknown[]) => unknown> = {};
  const app = {
    get: vi.fn((path: string, ...handlers: Array<(...a: unknown[]) => unknown>) => {
      routes[path] = handlers[handlers.length - 1];
    }),
  };
  registerMonitoringRoutes(app as never);
  return routes;
}

/** Minimal set of required server vars */
const REQUIRED_VALS: Partial<Record<(typeof ENV_KEYS)[number], string>> = {
  DATABASE_URL: "postgresql://host/db",
  SESSION_SECRET: "s".repeat(32),
  JWT_SECRET: "j".repeat(32),
};

// ── State reset ───────────────────────────────────────────────────────────────

let savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

beforeEach(() => {
  // Snapshot and clear all env keys the route reads so tests are hermetic.
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  mockGetDbShouldThrow = false;
  mockDbQueryError = null;
  mockFirebaseAdmin.default = { apps: [] };
});

afterEach(() => {
  // Restore original env state.
  for (const key of ENV_KEYS) {
    const original = savedEnv[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP status: 200 vs 503
// ─────────────────────────────────────────────────────────────────────────────

describe("/api/health/env — HTTP status", () => {
  it("returns 200 when all required vars are set and DB is up", async () => {
    Object.assign(process.env, REQUIRED_VALS);
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 503 when required vars are missing (DB up)", async () => {
    // No env vars set — all three required vars absent.
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    expect(res.status).toHaveBeenCalledWith(503);
  });

  it("returns 503 when DB is down even if all required vars are set", async () => {
    Object.assign(process.env, REQUIRED_VALS);
    mockGetDbShouldThrow = true;
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    expect(res.status).toHaveBeenCalledWith(503);
  });

  it("returns 503 when DB query throws even if all required vars are set", async () => {
    Object.assign(process.env, REQUIRED_VALS);
    mockDbQueryError = new Error("connection reset");
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    expect(res.status).toHaveBeenCalledWith(503);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkVars: set:true / set:false / whitespace
// ─────────────────────────────────────────────────────────────────────────────

describe("/api/health/env — var presence reporting", () => {
  it("reports set:true for a var that is present and non-empty", async () => {
    Object.assign(process.env, REQUIRED_VALS);
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    const data = res._json();
    const dbEntry = (data.serverRequired as Array<{ name: string; set: boolean }>).find(
      (v) => v.name === "DATABASE_URL"
    );
    expect(dbEntry?.set).toBe(true);
  });

  it("reports set:false for a var that is absent", async () => {
    // DATABASE_URL not set (deleted in beforeEach)
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    const data = res._json();
    const dbEntry = (data.serverRequired as Array<{ name: string; set: boolean }>).find(
      (v) => v.name === "DATABASE_URL"
    );
    expect(dbEntry?.set).toBe(false);
  });

  it("reports set:false for a var that is set to whitespace only", async () => {
    Object.assign(process.env, REQUIRED_VALS);
    process.env.DATABASE_URL = "   "; // whitespace-only → treated as missing
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    const data = res._json();
    const dbEntry = (data.serverRequired as Array<{ name: string; set: boolean }>).find(
      (v) => v.name === "DATABASE_URL"
    );
    expect(dbEntry?.set).toBe(false);
  });

  it("reports Firebase Admin and client vars in the response", async () => {
    process.env.FIREBASE_PROJECT_ID = "my-project";
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY = "AIza...";
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    const data = res._json();
    const adminEntry = (data.firebaseAdmin as Array<{ name: string; set: boolean }>).find(
      (v) => v.name === "FIREBASE_PROJECT_ID"
    );
    expect(adminEntry?.set).toBe(true);
    const clientEntry = (data.firebaseClient as Array<{ name: string; set: boolean }>).find(
      (v) => v.name === "EXPO_PUBLIC_FIREBASE_API_KEY"
    );
    expect(clientEntry?.set).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Firebase Admin SDK initialization status
// ─────────────────────────────────────────────────────────────────────────────

describe("/api/health/env — firebaseAdminSdk status", () => {
  it("reports 'initialized' when firebase-admin has at least one app", async () => {
    mockFirebaseAdmin.default = { apps: [{}] };
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    expect(res._json().firebaseAdminSdk).toBe("initialized");
  });

  it("reports 'not_initialized' when firebase-admin has no apps", async () => {
    mockFirebaseAdmin.default = { apps: [] };
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    expect(res._json().firebaseAdminSdk).toBe("not_initialized");
  });

  it("reports 'error' when accessing firebase-admin throws", async () => {
    // Null default causes adminModule.default.apps to throw TypeError.
    (mockFirebaseAdmin as { default: null }).default = null;
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    expect(res._json().firebaseAdminSdk).toBe("error");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Git context: gitBranch / gitSha
// ─────────────────────────────────────────────────────────────────────────────

describe("/api/health/env — git context fields", () => {
  it("includes gitBranch and a 7-char gitSha when Vercel commit vars are set", async () => {
    process.env.VERCEL_GIT_COMMIT_REF = "feature/my-branch";
    process.env.VERCEL_GIT_COMMIT_SHA = "abc1234567890def";
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    const data = res._json();
    expect(data.gitBranch).toBe("feature/my-branch");
    expect(data.gitSha).toBe("abc1234"); // sliced to 7
  });

  it("gitBranch and gitSha are null when Vercel commit vars are absent", async () => {
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    const data = res._json();
    expect(data.gitBranch).toBeNull();
    expect(data.gitSha).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// vercelEnv and nodeEnv
// ─────────────────────────────────────────────────────────────────────────────

describe("/api/health/env — vercelEnv / nodeEnv", () => {
  it("includes vercelEnv from VERCEL_ENV when set", async () => {
    process.env.VERCEL_ENV = "preview";
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    expect(res._json().vercelEnv).toBe("preview");
  });

  it("vercelEnv is null when VERCEL_ENV is absent", async () => {
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    expect(res._json().vercelEnv).toBeNull();
  });

  it("nodeEnv reflects the current NODE_ENV value", async () => {
    // NODE_ENV is always set by the Node.js/Vitest process; verify it's forwarded.
    const expected = process.env.NODE_ENV ?? null;
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    expect(res._json().nodeEnv).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Response shape
// ─────────────────────────────────────────────────────────────────────────────

describe("/api/health/env — response shape", () => {
  it("response contains all expected top-level fields", async () => {
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    const data = res._json();
    expect(data).toHaveProperty("timestamp");
    expect(data).toHaveProperty("vercelEnv");
    expect(data).toHaveProperty("nodeEnv");
    expect(data).toHaveProperty("gitBranch");
    expect(data).toHaveProperty("gitSha");
    expect(data).toHaveProperty("serverRequired");
    expect(data).toHaveProperty("serverProductionRequired");
    expect(data).toHaveProperty("firebaseAdmin");
    expect(data).toHaveProperty("firebaseClient");
    expect(data).toHaveProperty("database");
    expect(data).toHaveProperty("firebaseAdminSdk");
  });

  it("serverRequired array contains exactly DATABASE_URL, SESSION_SECRET, JWT_SECRET", async () => {
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    const names = (res._json().serverRequired as Array<{ name: string }>).map((v) => v.name);
    expect(names).toEqual(["DATABASE_URL", "SESSION_SECRET", "JWT_SECRET"]);
  });

  it("firebaseClient array contains all six EXPO_PUBLIC_ Firebase keys", async () => {
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    const names = (res._json().firebaseClient as Array<{ name: string }>).map((v) => v.name);
    expect(names).toContain("EXPO_PUBLIC_FIREBASE_API_KEY");
    expect(names).toContain("EXPO_PUBLIC_FIREBASE_APP_ID");
    expect(names).toHaveLength(6);
  });

  it("database field reflects the live DB check result", async () => {
    mockDbQueryError = new Error("timeout");
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    const db = res._json().database as { status: string; detail?: string };
    expect(db.status).toBe("down");
    expect(db.detail).toContain("timeout");
  });

  it("serverProductionRequired contains MFA_ENCRYPTION_KEY with requiredIn='production'", async () => {
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    const prodRequired = res._json().serverProductionRequired as Array<{
      name: string;
      set: boolean;
      requiredIn: string;
    }>;
    expect(prodRequired).toHaveLength(1);
    expect(prodRequired[0].name).toBe("MFA_ENCRYPTION_KEY");
    expect(prodRequired[0].requiredIn).toBe("production");
  });

  it("firebaseAdmin array includes FIREBASE_ADMIN_KEY as the first entry", async () => {
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    const names = (res._json().firebaseAdmin as Array<{ name: string }>).map((v) => v.name);
    expect(names[0]).toBe("FIREBASE_ADMIN_KEY");
    expect(names).toContain("FIREBASE_PROJECT_ID");
    expect(names).toContain("FIREBASE_CLIENT_EMAIL");
    expect(names).toContain("FIREBASE_PRIVATE_KEY");
    expect(names).toHaveLength(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Production-only requirements (MFA_ENCRYPTION_KEY)
// ─────────────────────────────────────────────────────────────────────────────

describe("/api/health/env — production-only requirements", () => {
  it("returns 200 in non-production even when MFA_ENCRYPTION_KEY is absent", async () => {
    // NODE_ENV defaults to "test" in vitest — isProduction=false, so MFA is optional.
    Object.assign(process.env, REQUIRED_VALS);
    // MFA_ENCRYPTION_KEY deliberately not set.
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 503 in production when MFA_ENCRYPTION_KEY is absent", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      Object.assign(process.env, REQUIRED_VALS);
      // MFA_ENCRYPTION_KEY deliberately not set.
      const routes = buildRoutes();
      const res = makeMockRes();

      await routes["/api/health/env"]({}, res);

      expect(res.status).toHaveBeenCalledWith(503);
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("returns 200 in production when MFA_ENCRYPTION_KEY is set", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      Object.assign(process.env, REQUIRED_VALS);
      process.env.MFA_ENCRYPTION_KEY = "m".repeat(32);
      const routes = buildRoutes();
      const res = makeMockRes();

      await routes["/api/health/env"]({}, res);

      expect(res.status).toHaveBeenCalledWith(200);
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("reports MFA_ENCRYPTION_KEY set:true when it is present", async () => {
    process.env.MFA_ENCRYPTION_KEY = "m".repeat(32);
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    const prodRequired = res._json().serverProductionRequired as Array<{
      name: string;
      set: boolean;
    }>;
    const mfa = prodRequired.find((v) => v.name === "MFA_ENCRYPTION_KEY");
    expect(mfa?.set).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE_ADMIN_KEY detection
// ─────────────────────────────────────────────────────────────────────────────

describe("/api/health/env — FIREBASE_ADMIN_KEY detection", () => {
  it("reports FIREBASE_ADMIN_KEY set:true when it is present", async () => {
    process.env.FIREBASE_ADMIN_KEY = '{"type":"service_account"}';
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    const adminEntry = (res._json().firebaseAdmin as Array<{ name: string; set: boolean }>).find(
      (v) => v.name === "FIREBASE_ADMIN_KEY"
    );
    expect(adminEntry?.set).toBe(true);
  });

  it("reports FIREBASE_ADMIN_KEY set:false when it is absent", async () => {
    // FIREBASE_ADMIN_KEY deleted in beforeEach
    const routes = buildRoutes();
    const res = makeMockRes();

    await routes["/api/health/env"]({}, res);

    const adminEntry = (res._json().firebaseAdmin as Array<{ name: string; set: boolean }>).find(
      (v) => v.name === "FIREBASE_ADMIN_KEY"
    );
    expect(adminEntry?.set).toBe(false);
  });
});
