/**
 * Branch coverage tests for server/routes/betaSignup.ts
 * Covers the 3 uncovered branches:
 * - ipHash ternary when ip or salt is missing
 * - platform ?? existing.platform fallback
 * - platform ?? null for new entries
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("betaSignup — branch coverage", () => {
  const capturedRoutes: any[] = [];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    capturedRoutes.length = 0;
  });

  async function setupBetaSignup(opts: {
    ip: string | null;
    salt: string;
    selectResult?: any[];
  }) {
    const mockGetClientIp = vi.fn().mockReturnValue(opts.ip);
    const mockHashIp = vi.fn().mockReturnValue("hashed-ip");

    const chain: any = {};
    const methods = ["select", "from", "where", "limit", "insert", "values", "update", "set"];
    for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
    chain.limit.mockResolvedValue(opts.selectResult ?? []);

    vi.doMock("express", () => ({
      Router: () => {
        const mockRouter: any = {};
        for (const method of ["get", "post", "put", "patch", "delete", "use"]) {
          mockRouter[method] = vi.fn((...args: any[]) => {
            capturedRoutes.push({ method, args });
            return mockRouter;
          });
        }
        return mockRouter;
      },
    }));

    vi.doMock("../../db", () => ({ getDb: vi.fn().mockReturnValue(chain) }));
    vi.doMock("../../utils/ip", () => ({
      getClientIp: mockGetClientIp,
      hashIp: mockHashIp,
    }));
    vi.doMock("../../config/env", () => ({
      env: { IP_HASH_SALT: opts.salt, NODE_ENV: "test" },
    }));
    vi.doMock("../../middleware/validation", () => ({
      validateBody: vi.fn(() => (req: any, _res: any, next: any) => next()),
    }));
    vi.doMock("@shared/validation/betaSignup", () => ({ BetaSignupInput: {} }));
    vi.doMock("@shared/schema", () => ({
      betaSignups: {
        id: "id", email: "email", submitCount: "submitCount",
        lastSubmittedAt: "lastSubmittedAt",
      },
    }));
    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn(),
      sql: Object.assign(
        (_strings: TemplateStringsArray, ..._values: any[]) => ({ _sql: true }),
        { raw: (s: string) => ({ _sql: true, raw: s }) }
      ),
    }));

    await import("../../routes/betaSignup");

    return { chain, mockGetClientIp, mockHashIp };
  }

  function createRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  }

  async function callPostHandler(req: any, res: any) {
    const postRoute = capturedRoutes.find(
      (r) => r.method === "post" && r.args[0] === "/"
    );
    if (!postRoute) throw new Error("No POST / handler found");
    const handlers = postRoute.args.slice(1);
    for (const handler of handlers) {
      await handler(req, res, () => {});
    }
  }

  it("should set ipHash to null when getClientIp returns null", async () => {
    const { mockHashIp } = await setupBetaSignup({ ip: null, salt: "test-salt" });

    const req = { body: { email: "test@example.com", platform: "ios" }, headers: {} };
    const res = createRes();

    await callPostHandler(req, res);

    // hashIp should NOT be called since ip is null
    expect(mockHashIp).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should set ipHash to null when IP_HASH_SALT is empty", async () => {
    const { mockHashIp } = await setupBetaSignup({ ip: "1.2.3.4", salt: "" });

    const req = { body: { email: "test@example.com" }, headers: {} };
    const res = createRes();

    await callPostHandler(req, res);

    // salt is empty/falsy, so ipHash should be null
    expect(mockHashIp).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should use existing platform when new body has no platform (update path)", async () => {
    const pastDate = new Date(Date.now() - 20 * 60 * 1000); // past rate limit
    await setupBetaSignup({
      ip: "1.2.3.4",
      salt: "test-salt",
      selectResult: [{
        id: "existing-id",
        platform: "android",
        lastSubmittedAt: pastDate,
        submitCount: 1,
      }],
    });

    const req = {
      body: { email: "test@example.com" }, // no platform
      headers: {},
    };
    const res = createRes();

    await callPostHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should spread empty object when ipHash is undefined on update path", async () => {
    const pastDate = new Date(Date.now() - 20 * 60 * 1000);
    await setupBetaSignup({
      ip: null, // no IP → ipHash undefined → ...(ipHash ? { ipHash } : {}) spreads {}
      salt: "test-salt",
      selectResult: [{
        id: "existing-id",
        platform: "ios",
        lastSubmittedAt: pastDate,
        submitCount: 1,
      }],
    });

    const req = { body: { email: "test@example.com", platform: "ios" }, headers: {} };
    const res = createRes();

    await callPostHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should set platform to null for new entry when no platform in body", async () => {
    await setupBetaSignup({ ip: null, salt: "" });

    const req = {
      body: { email: "new@example.com" }, // no platform
      headers: {},
    };
    const res = createRes();

    await callPostHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
