/**
 * @fileoverview Unit tests for server/routes/posts.ts (postsRouter)
 *
 * Tests POST /api/posts — create a post
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("../services/moderationStore", () => ({ createPost: vi.fn() }));

vi.mock("../auth/middleware", () => ({
  authenticateUser: vi.fn((_r: any, _s: any, n: any) => n()),
}));

vi.mock("../middleware/requirePaidOrPro", () => ({
  requirePaidOrPro: vi.fn((_r: any, _s: any, n: any) => n()),
}));

vi.mock("../middleware/trustSafety", () => ({
  enforceTrustAction: vi.fn(() => (_r: any, _s: any, n: any) => n()),
}));

// Capture route handlers via mock Router
const routeHandlers: Record<string, any[]> = {};

vi.mock("express", () => ({
  Router: () => ({
    post: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`POST ${path}`] = handlers;
    }),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    use: vi.fn(),
  }),
}));

await import("../routes/posts");

const { createPost } = await import("../services/moderationStore");
const { enforceTrustAction } = await import("../middleware/trustSafety");

// Capture enforceTrustAction call info before clearAllMocks resets it
const enforceTrustActionCallArgs = vi.mocked(enforceTrustAction).mock.calls.map((c) => [...c]);
const enforceTrustActionReturnedMw = vi.mocked(enforceTrustAction).mock.results.map((r) => r.value);

// ============================================================================
// Helpers
// ============================================================================

function mockReq(overrides: Record<string, any> = {}) {
  return {
    body: {},
    headers: {},
    currentUser: { id: "user1", firstName: "Test" },
    ...overrides,
  };
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

async function callHandler(routeKey: string, req: any, res: any) {
  const handlers = routeHandlers[routeKey];
  if (!handlers) throw new Error(`Route ${routeKey} not registered`);
  // Call the last handler (the actual route logic, after middleware)
  const handler = handlers[handlers.length - 1];
  await handler(req, res);
}

// ============================================================================
// Tests
// ============================================================================

describe("POST /api/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a post and return 201", async () => {
    const postResult = { id: "post-1" };
    vi.mocked(createPost).mockResolvedValue(postResult as any);

    const req = mockReq({
      body: { mediaUrl: "https://example.com/vid.mp4", caption: "Sick trick" },
    });
    const res = mockRes();
    await callHandler("POST /", req, res);

    expect(createPost).toHaveBeenCalledWith("user1", {
      mediaUrl: "https://example.com/vid.mp4",
      caption: "Sick trick",
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ postId: "post-1" });
  });

  it("should return 400 for invalid body (missing mediaUrl)", async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();
    await callHandler("POST /", req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid request" }));
  });

  it("should return 400 for invalid mediaUrl (not a URL)", async () => {
    const req = mockReq({ body: { mediaUrl: "not-a-url" } });
    const res = mockRes();
    await callHandler("POST /", req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("should return 401 when currentUser.id is missing", async () => {
    const req = mockReq({
      body: { mediaUrl: "https://example.com/vid.mp4" },
      currentUser: { id: undefined },
    });
    const res = mockRes();
    await callHandler("POST /", req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
  });

  it("should return 401 when currentUser is null", async () => {
    const req = mockReq({
      body: { mediaUrl: "https://example.com/vid.mp4" },
      currentUser: null,
    });
    const res = mockRes();
    await callHandler("POST /", req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("should register enforceTrustAction middleware with 'post' argument", () => {
    // enforceTrustAction is called at module load time; captured before clearAllMocks
    expect(enforceTrustActionCallArgs).toContainEqual(["post"]);
    // Verify the returned middleware is in the route handler chain
    const handlers = routeHandlers["POST /"];
    expect(handlers).toContain(enforceTrustActionReturnedMw[0]);
  });
});
