/**
 * Typed Express request / response / next mock factories for server tests.
 *
 * Replaces the many ad-hoc `{ body: {}, ip: "..." } as any` patterns
 * scattered across route and middleware test files.
 */

import { vi } from "vitest";
import type { Mock } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export interface MockRequestOptions {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  method?: string;
  path?: string;
  url?: string;
  currentUser?: {
    id: string;
    email: string;
    roles?: string[];
    accountTier?: "free" | "pro" | "premium";
    [key: string]: unknown;
  };
  connection?: { remoteAddress?: string };
  socket?: { remoteAddress?: string };
  isAuthenticated?: boolean;
  requestId?: string;
  log?: {
    info: Mock;
    warn: Mock;
    error: Mock;
    debug: Mock;
    fatal: Mock;
    child: Mock;
  };
  /** Merge any additional Express Request properties. */
  [key: string]: unknown;
}

/**
 * Create a typed mock Express `Request`.
 *
 * The returned object satisfies the `Request` interface for the fields that
 * server middleware and route handlers actually read. Cast-free usage:
 *
 * @example
 * ```ts
 * const req = createMockRequest({
 *   body: { email: "a@b.com" },
 *   currentUser: { id: "u1", email: "a@b.com" },
 * });
 * await myHandler(req, res, next);
 * ```
 */
export function createMockRequest(options: MockRequestOptions = {}): Request {
  const headers: Record<string, string | string[] | undefined> = options.headers ?? {};

  const childLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  };
  childLogger.child.mockReturnValue(childLogger);

  const req: Partial<Request> & Record<string, unknown> = {
    body: options.body ?? {},
    params: (options.params ?? {}) as Request["params"],
    query: (options.query ?? {}) as Request["query"],
    headers: headers as Request["headers"],
    ip: options.ip ?? "127.0.0.1",
    method: options.method ?? "GET",
    path: options.path ?? "/",
    url: options.url ?? "/",
    get: ((name: string) => {
      const lower = name.toLowerCase();
      for (const [key, val] of Object.entries(headers)) {
        if (key.toLowerCase() === lower) return val;
      }
      return undefined;
    }) as Request["get"],
    connection: (options.connection ?? { remoteAddress: "10.0.0.1" }) as Request["connection"],
    socket: (options.socket ?? { remoteAddress: "10.0.0.2" }) as Request["socket"],
    currentUser: options.currentUser as Request["currentUser"],
    isAuthenticated: vi
      .fn()
      .mockReturnValue(options.isAuthenticated ?? false) as unknown as Request["isAuthenticated"],
    requestId: options.requestId ?? "test-request-id",
    log: options.log ?? childLogger,
  };

  return req as Request;
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export interface MockResponse extends Response {
  status: Mock;
  json: Mock;
  send: Mock;
  redirect: Mock;
  set: Mock;
  cookie: Mock;
  clearCookie: Mock;
  end: Mock;
  type: Mock;
  sendStatus: Mock;
  header: Mock;
  setHeader: Mock;
}

/**
 * Create a typed mock Express `Response`.
 *
 * All mutating methods (`.status()`, `.json()`, etc.) are chainable mocks.
 *
 * @example
 * ```ts
 * const res = createMockResponse();
 * await myHandler(req, res, next);
 * expect(res.status).toHaveBeenCalledWith(200);
 * expect(res.json).toHaveBeenCalledWith({ ok: true });
 * ```
 */
export function createMockResponse(): MockResponse {
  const res: Partial<MockResponse> = {};

  // Chainable methods — each returns `res`
  res.status = vi.fn().mockReturnValue(res) as Mock;
  res.json = vi.fn().mockReturnValue(res) as Mock;
  res.send = vi.fn().mockReturnValue(res) as Mock;
  res.redirect = vi.fn().mockReturnValue(res) as Mock;
  res.set = vi.fn().mockReturnValue(res) as Mock;
  res.cookie = vi.fn().mockReturnValue(res) as Mock;
  res.clearCookie = vi.fn().mockReturnValue(res) as Mock;
  res.end = vi.fn().mockReturnValue(res) as Mock;
  res.type = vi.fn().mockReturnValue(res) as Mock;
  res.sendStatus = vi.fn().mockReturnValue(res) as Mock;
  res.header = vi.fn().mockReturnValue(res) as Mock;
  res.setHeader = vi.fn().mockReturnValue(res) as Mock;

  return res as MockResponse;
}

// ---------------------------------------------------------------------------
// NextFunction
// ---------------------------------------------------------------------------

/**
 * Create a mock Express `next` function.
 */
export function createMockNext(): NextFunction & Mock {
  return vi.fn() as NextFunction & Mock;
}
