/**
 * @fileoverview Unit tests for server/routes.ts (registerRoutes)
 *
 * After extracting inline handlers into dedicated route modules, routes.ts is
 * now a thin orchestrator that mounts sub-routers.  This test verifies that
 * every expected sub-router is mounted at the correct path.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — all vi.mock() calls MUST appear before any import of the module
// under test so Vitest can hoist them.
// ============================================================================

// -- auth routes --
vi.mock("../../auth/routes", () => ({ setupAuthRoutes: vi.fn() }));

// -- auth middleware --
vi.mock("../../auth/middleware", () => ({
  authenticateUser: vi.fn((_r: any, _s: any, n: any) => n()),
  requireEmailVerification: vi.fn((_r: any, _s: any, n: any) => n()),
  requireRecentAuth: vi.fn((_req: any, _res: any, next: any) => next()),
}));

// -- middleware --
vi.mock("../../middleware/requirePaidOrPro", () => ({
  requirePaidOrPro: vi.fn((_r: any, _s: any, n: any) => n()),
}));
vi.mock("../../middleware/bandwidth", () => ({
  bandwidthDetection: vi.fn((_r: any, _s: any, n: any) => n()),
}));

// -- sub-routers (existing) --
vi.mock("../../routes/analytics", () => ({ analyticsRouter: vi.fn() }));
vi.mock("../../routes/metrics", () => ({ metricsRouter: vi.fn() }));
vi.mock("../../routes/moderation", () => ({ moderationRouter: vi.fn() }));
vi.mock("../../routes/admin", () => ({ adminRouter: vi.fn() }));
vi.mock("../../routes/profile", () => ({ profileRouter: vi.fn() }));
vi.mock("../../routes/games", () => ({
  gamesRouter: vi.fn(),
}));
vi.mock("../../routes/trickmint", () => ({ trickmintRouter: vi.fn() }));
vi.mock("../../routes/tier", () => ({ tierRouter: vi.fn() }));
vi.mock("../../routes/stripeWebhook", () => ({
  stripeWebhookRouter: vi.fn(),
}));
vi.mock("../../routes/notifications", () => ({
  notificationsRouter: vi.fn(),
}));
vi.mock("../../routes/remoteSkate", () => ({
  remoteSkateRouter: vi.fn(),
}));

// -- sub-routers (newly extracted) --
vi.mock("../../routes/spots", () => ({ spotsRouter: vi.fn() }));
vi.mock("../../routes/posts", () => ({ postsRouter: vi.fn() }));
vi.mock("../../routes/users", () => ({ usersRouter: vi.fn() }));
vi.mock("../../routes/matchmaking", () => ({ matchmakingRouter: vi.fn() }));
vi.mock("../../routes/betaSignup", () => ({ betaSignupRouter: vi.fn() }));
vi.mock("../../routes/stats", () => ({ statsRouter: vi.fn() }));
vi.mock("../../routes/cron", () => ({ cronRouter: vi.fn() }));

// ============================================================================
// Dynamic imports (after all mocks are registered)
// ============================================================================

const { registerRoutes } = await import("../../routes");

// ============================================================================
// Helpers
// ============================================================================

function buildMockApp() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    use: vi.fn(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("registerRoutes", () => {
  let mockApp: ReturnType<typeof buildMockApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = buildMockApp();
    registerRoutes(mockApp as any);
  });

  it("should register routes without throwing", () => {
    const app = buildMockApp();
    expect(() => registerRoutes(app as any)).not.toThrow();
  });

  describe("sub-router mounting", () => {
    it("should mount all pre-existing sub-routers via app.use()", () => {
      const useCalls = mockApp.use.mock.calls.map((c: any[]) => c[0]);
      expect(useCalls).toContain("/api/analytics");
      expect(useCalls).toContain("/api/metrics");
      expect(useCalls).toContain("/api");
      expect(useCalls).toContain("/api/admin");
      expect(useCalls).toContain("/api/profile");
      expect(useCalls).toContain("/api/games");
      expect(useCalls).toContain("/api/trickmint");
      expect(useCalls).toContain("/api/tier");
      expect(useCalls).toContain("/webhooks/stripe");
      expect(useCalls).toContain("/api/notifications");
      expect(useCalls).toContain("/api/remote-skate");
    });

    it("should mount all newly extracted sub-routers via app.use()", () => {
      const useCalls = mockApp.use.mock.calls.map((c: any[]) => c[0]);
      expect(useCalls).toContain("/api/spots");
      expect(useCalls).toContain("/api/posts");
      expect(useCalls).toContain("/api/users");
      expect(useCalls).toContain("/api/matchmaking");
      expect(useCalls).toContain("/api/beta-signup");
      expect(useCalls).toContain("/api/stats");
      expect(useCalls).toContain("/api/cron");
    });

    it("should not register any inline route handlers via app.get or app.post", () => {
      expect(mockApp.get).not.toHaveBeenCalled();
      expect(mockApp.post).not.toHaveBeenCalled();
    });
  });
});
