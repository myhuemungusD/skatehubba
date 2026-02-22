/**
 * Typed Drizzle mock chain factory for server tests.
 *
 * Replaces ad-hoc `const mockDb: any = { select: vi.fn()... }` chains
 * with a properly typed builder that mirrors the real Drizzle query API.
 */

import { vi } from "vitest";
import type { Mock } from "vitest";

// ---------------------------------------------------------------------------
// Types that mirror the Drizzle query-builder shape used in server code
// ---------------------------------------------------------------------------

export interface MockQueryChain {
  select: Mock & ((...args: unknown[]) => MockQueryChain);
  from: Mock & ((...args: unknown[]) => MockQueryChain);
  where: Mock & ((...args: unknown[]) => MockQueryChain);
  limit: Mock & ((...args: unknown[]) => MockQueryChain);
  offset: Mock & ((...args: unknown[]) => MockQueryChain);
  orderBy: Mock & ((...args: unknown[]) => MockQueryChain);
  for: Mock & ((...args: unknown[]) => MockQueryChain);
  insert: Mock & ((...args: unknown[]) => MockQueryChain);
  values: Mock & ((...args: unknown[]) => MockQueryChain);
  update: Mock & ((...args: unknown[]) => MockQueryChain);
  set: Mock & ((...args: unknown[]) => MockQueryChain);
  delete: Mock & ((...args: unknown[]) => MockQueryChain);
  returning: Mock & ((...args: unknown[]) => MockQueryChain);
  onConflictDoUpdate: Mock & ((...args: unknown[]) => MockQueryChain);
  target: Mock & ((...args: unknown[]) => MockQueryChain);
  then: (
    onFulfilled?: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise<unknown>;
}

export interface MockDb extends MockQueryChain {
  /** Override the value resolved by the next `.then()` call. */
  _setResult(value: unknown): void;
  /** Override `.then()` to reject with `err`. */
  _setError(err: unknown): void;
  /** Make successive `.then()` calls return different results. */
  _setSequentialResults(results: unknown[]): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a mock Drizzle database chain.
 *
 * Every chain method (`.select()`, `.from()`, `.where()`, …) returns the same
 * chain so callers can assert on individual steps while the chain remains
 * composable.  The terminal `.then()` resolves to `defaultResult` (default `[]`)
 * unless overridden via `_setResult`, `_setError`, or `_setSequentialResults`.
 *
 * @example
 * ```ts
 * const { db, chain } = createMockDb();
 * chain._setResult([{ id: "u1", email: "a@b.com" }]);
 * vi.doMock("../db", () => ({ getDb: () => db }));
 * ```
 */
export function createMockDb(defaultResult: unknown = []): { db: MockDb; chain: MockDb } {
  let result: unknown = defaultResult;
  let error: unknown = undefined;
  let sequentialResults: unknown[] | null = null;
  let callIndex = 0;

  const chain = {} as MockDb;

  const self = (): MockQueryChain => chain;

  // Chainable query methods
  const methods = [
    "select",
    "from",
    "where",
    "limit",
    "offset",
    "orderBy",
    "for",
    "insert",
    "values",
    "update",
    "set",
    "delete",
    "returning",
    "onConflictDoUpdate",
    "target",
  ] as const;

  for (const method of methods) {
    (chain as unknown as Record<string, unknown>)[method] = vi.fn(self);
  }

  // Terminal `.then()` — makes the chain thenable (awaitable)
  chain.then = (
    onFulfilled?: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => {
    if (error !== undefined) {
      return onRejected ? Promise.reject(error).catch(onRejected) : Promise.reject(error);
    }

    const value =
      sequentialResults !== null ? (sequentialResults[callIndex++] ?? defaultResult) : result;

    return Promise.resolve(value).then(onFulfilled, onRejected);
  };

  // Control helpers
  chain._setResult = (v: unknown) => {
    result = v;
    error = undefined;
    sequentialResults = null;
  };

  chain._setError = (e: unknown) => {
    error = e;
  };

  chain._setSequentialResults = (results: unknown[]) => {
    sequentialResults = results;
    callIndex = 0;
    error = undefined;
  };

  return { db: chain, chain };
}

/**
 * Convenience: return a `getDb` mock module shape suitable for `vi.doMock("../db", …)`.
 *
 * @example
 * ```ts
 * const { dbModule, chain } = createMockDbModule();
 * vi.doMock("../../db", () => dbModule);
 * chain._setResult([user]);
 * ```
 */
export function createMockDbModule(defaultResult: unknown = []) {
  const { db, chain } = createMockDb(defaultResult);
  return {
    dbModule: {
      getDb: () => db,
      db,
    },
    chain,
  };
}
