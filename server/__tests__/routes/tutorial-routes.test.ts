/**
 * @fileoverview Unit tests for tutorial routes
 *
 * Tests:
 * - GET /steps — list active tutorial steps (public)
 * - GET /steps/:id — get single step
 * - GET /progress — get authenticated user's progress
 * - POST /progress — create progress entry
 * - PATCH /progress/:stepId — update progress
 * - GET /onboarding — check onboarding completion
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();

let mockDb: Record<string, unknown> | null = {
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
};

vi.mock("../../db", () => ({
  getDb: () => {
    if (!mockDb) throw new Error("Database not configured");
    return mockDb;
  },
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../auth/middleware", () => ({
  authenticateUser: (req: any, _res: any, next: any) => {
    req.currentUser = req.currentUser || {
      id: "test-user-id",
      firebaseUid: "test-firebase-uid",
      roles: [],
    };
    next();
  },
}));

// Capture route handlers
const routeHandlers: Record<string, any[]> = {};

vi.mock("express", () => ({
  Router: () => ({
    get: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`GET ${path}`] = handlers;
    }),
    post: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`POST ${path}`] = handlers;
    }),
    patch: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`PATCH ${path}`] = handlers;
    }),
    put: vi.fn(),
    delete: vi.fn(),
    use: vi.fn(),
  }),
}));

await import("../../routes/tutorial");

// ============================================================================
// Helpers
// ============================================================================

function createReq(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    body: {},
    currentUser: { id: "test-user-id", firebaseUid: "test-firebase-uid", roles: [] },
    ...overrides,
  };
}

function createRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

async function callHandler(routeKey: string, req: any, res: any) {
  const handlers = routeHandlers[routeKey];
  if (!handlers) throw new Error(`Route ${routeKey} not registered`);
  for (const handler of handlers) {
    await handler(req, res, () => {});
  }
}

/**
 * Create a chainable result object that acts as both a thenable (for await)
 * and has chainable methods like .limit(), .orderBy(), .where().
 */
function chainable(result: unknown[]) {
  const obj: Record<string, unknown> = {
    limit: vi.fn(() => Promise.resolve(result)),
    orderBy: vi.fn(() => Promise.resolve(result)),
    where: vi.fn(() => chainable(result)),
    then: (resolve: (val: unknown) => void) => Promise.resolve(result).then(resolve),
  };
  return obj;
}

function setupSelectChain(result: unknown[]) {
  mockSelect.mockReturnValue({
    from: vi.fn(() => chainable(result)),
  });
}

function setupSelectChainMultiple(results: unknown[][]) {
  let callCount = 0;
  mockSelect.mockImplementation(() => ({
    from: vi.fn(() => {
      const currentResults = results[callCount] || [];
      callCount++;
      return chainable(currentResults);
    }),
  }));
}

// ============================================================================
// Tests
// ============================================================================

describe("Tutorial Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    };
  });

  // ──────────────────────────────────────────────────────────
  // GET /steps
  // ──────────────────────────────────────────────────────────
  describe("GET /steps", () => {
    it("should return all active tutorial steps", async () => {
      const mockSteps = [
        { id: 1, title: "Welcome", order: 1, isActive: true },
        { id: 2, title: "Play", order: 2, isActive: true },
      ];
      setupSelectChain(mockSteps);

      const req = createReq();
      const res = createRes();
      await callHandler("GET /steps", req, res);

      expect(res.json).toHaveBeenCalledWith(mockSteps);
    });

    it("should return 500 on database error", async () => {
      mockSelect.mockImplementation(() => {
        throw new Error("DB error");
      });

      const req = createReq();
      const res = createRes();
      await callHandler("GET /steps", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to fetch tutorial steps" });
    });

    it("should return 500 when database is unavailable", async () => {
      mockDb = null;

      const req = createReq();
      const res = createRes();
      await callHandler("GET /steps", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ──────────────────────────────────────────────────────────
  // GET /steps/:id
  // ──────────────────────────────────────────────────────────
  describe("GET /steps/:id", () => {
    it("should return a single step", async () => {
      const mockStep = { id: 1, title: "Welcome", order: 1 };
      setupSelectChain([mockStep]);

      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await callHandler("GET /steps/:id", req, res);

      expect(res.json).toHaveBeenCalledWith(mockStep);
    });

    it("should return 400 for non-numeric id", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();
      await callHandler("GET /steps/:id", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid step ID" });
    });

    it("should return 404 when step does not exist", async () => {
      setupSelectChain([]);

      const req = createReq({ params: { id: "999" } });
      const res = createRes();
      await callHandler("GET /steps/:id", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // ──────────────────────────────────────────────────────────
  // GET /progress (authenticated)
  // ──────────────────────────────────────────────────────────
  describe("GET /progress", () => {
    it("should return user progress using authenticated user id", async () => {
      const mockProgress = [{ id: 1, userId: "test-user-id", stepId: 1, completed: true }];
      setupSelectChainMultiple([mockProgress]);

      const req = createReq();
      const res = createRes();
      await callHandler("GET /progress", req, res);

      expect(res.json).toHaveBeenCalledWith(mockProgress);
    });

    it("should return 500 on database error", async () => {
      mockSelect.mockImplementation(() => {
        throw new Error("DB error");
      });

      const req = createReq();
      const res = createRes();
      await callHandler("GET /progress", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ──────────────────────────────────────────────────────────
  // POST /progress (authenticated)
  // ──────────────────────────────────────────────────────────
  describe("POST /progress", () => {
    it("should create a new progress entry", async () => {
      const created = { id: 1, userId: "test-user-id", stepId: 1, completed: false };

      // First select: step exists; Second select: no existing progress
      setupSelectChainMultiple([[{ id: 1, title: "Welcome" }], []]);

      mockInsert.mockReturnValue({ values: mockValues });
      mockValues.mockReturnValue({ returning: mockReturning });
      mockReturning.mockResolvedValue([created]);

      const req = createReq({ body: { stepId: 1 } });
      const res = createRes();
      await callHandler("POST /progress", req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });

    it("should return 400 when stepId is missing", async () => {
      const req = createReq({ body: {} });
      const res = createRes();
      await callHandler("POST /progress", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "stepId must be a positive integer" });
    });

    it("should return 400 when stepId is not a positive integer", async () => {
      const req = createReq({ body: { stepId: -1 } });
      const res = createRes();
      await callHandler("POST /progress", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when stepId is a string", async () => {
      const req = createReq({ body: { stepId: "abc" } });
      const res = createRes();
      await callHandler("POST /progress", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when tutorial step does not exist", async () => {
      setupSelectChainMultiple([[]]);

      const req = createReq({ body: { stepId: 999 } });
      const res = createRes();
      await callHandler("POST /progress", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Tutorial step not found" });
    });

    it("should return 409 when progress entry already exists", async () => {
      const existing = { id: 1, userId: "test-user-id", stepId: 1, completed: true };

      setupSelectChainMultiple([[{ id: 1, title: "Welcome" }], [existing]]);

      const req = createReq({ body: { stepId: 1 } });
      const res = createRes();
      await callHandler("POST /progress", req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: "Progress entry already exists", existing });
    });
  });

  // ──────────────────────────────────────────────────────────
  // PATCH /progress/:stepId (authenticated)
  // ──────────────────────────────────────────────────────────
  describe("PATCH /progress/:stepId", () => {
    it("should update progress entry", async () => {
      const updated = { id: 1, userId: "test-user-id", stepId: 1, completed: true };
      mockUpdate.mockReturnValue({ set: mockSet });
      mockSet.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ returning: mockReturning });
      mockReturning.mockResolvedValue([updated]);

      const req = createReq({
        params: { stepId: "1" },
        body: { completed: true },
      });
      const res = createRes();
      await callHandler("PATCH /progress/:stepId", req, res);

      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it("should return 400 for invalid stepId", async () => {
      const req = createReq({
        params: { stepId: "abc" },
        body: { completed: true },
      });
      const res = createRes();
      await callHandler("PATCH /progress/:stepId", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid step ID" });
    });

    it("should return 400 when no valid fields are provided", async () => {
      const req = createReq({
        params: { stepId: "1" },
        body: {},
      });
      const res = createRes();
      await callHandler("PATCH /progress/:stepId", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when progress entry not found", async () => {
      mockUpdate.mockReturnValue({ set: mockSet });
      mockSet.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ returning: mockReturning });
      mockReturning.mockResolvedValue([]);

      const req = createReq({
        params: { stepId: "1" },
        body: { completed: true },
      });
      const res = createRes();
      await callHandler("PATCH /progress/:stepId", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // ──────────────────────────────────────────────────────────
  // GET /onboarding (authenticated)
  // ──────────────────────────────────────────────────────────
  describe("GET /onboarding", () => {
    it("should return completion status when all steps done", async () => {
      setupSelectChainMultiple([
        [{ id: 1 }, { id: 2 }], // allSteps
        [
          { userId: "test-user-id", stepId: 1, completed: true },
          { userId: "test-user-id", stepId: 2, completed: true },
        ],
      ]);

      const req = createReq();
      const res = createRes();
      await callHandler("GET /onboarding", req, res);

      expect(res.json).toHaveBeenCalledWith({
        completed: true,
        totalSteps: 2,
        completedSteps: 2,
      });
    });

    it("should return incomplete when not all steps done", async () => {
      setupSelectChainMultiple([
        [{ id: 1 }, { id: 2 }, { id: 3 }], // allSteps
        [
          { userId: "test-user-id", stepId: 1, completed: true },
          { userId: "test-user-id", stepId: 2, completed: false },
        ],
      ]);

      const req = createReq();
      const res = createRes();
      await callHandler("GET /onboarding", req, res);

      expect(res.json).toHaveBeenCalledWith({
        completed: false,
        totalSteps: 3,
        completedSteps: 1,
      });
    });

    it("should return 500 on database error", async () => {
      mockSelect.mockImplementation(() => {
        throw new Error("DB error");
      });

      const req = createReq();
      const res = createRes();
      await callHandler("GET /onboarding", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
