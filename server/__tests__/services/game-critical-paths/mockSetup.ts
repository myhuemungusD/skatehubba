/**
 * Shared mock setup for battle critical path tests.
 *
 * This module provides:
 * - In-memory store for test data
 * - Drizzle ORM mock chain
 */

import { vi } from "vitest";

// ============================================================================
// In-memory stores (multi-table)
// ============================================================================

export const stores: Record<string, Map<string, any>> = {
  battleVoteState: new Map(),
  battles: new Map(),
  battleVotes: new Map(),
};

export function clearAllStores() {
  for (const store of Object.values(stores)) {
    store.clear();
  }
}

// ============================================================================
// Helper to extract primary key from mock where clause
// ============================================================================

export function extractPrimaryId(where: any): string | null {
  if (!where) return null;
  if (where._op === "eq" && where.col?._isPrimary) return where.val;
  if (where._op === "and") {
    for (const c of where.conditions) {
      const id = extractPrimaryId(c);
      if (id) return id;
    }
  }
  return null;
}

function getStore(tableName: string): Map<string, any> {
  if (!stores[tableName]) stores[tableName] = new Map();
  return stores[tableName];
}

// ============================================================================
// Mock Drizzle query chain
// ============================================================================

export function createQueryChain() {
  let op = "select";
  let currentTable = "";
  let setData: any = null;
  let insertData: any = null;
  let whereClause: any = null;
  let hasReturning = false;

  const resolve = () => {
    const store = getStore(currentTable);

    if (op === "select") {
      const id = extractPrimaryId(whereClause);
      if (id) {
        const row = store.get(id);
        return row ? [row] : [];
      }
      return Array.from(store.values());
    }
    if (op === "insert") {
      const id =
        insertData?.id ??
        insertData?.battleId ??
        `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      store.set(id, { ...insertData, id });
      return hasReturning ? [{ ...insertData, id }] : undefined;
    }
    if (op === "update") {
      const id = extractPrimaryId(whereClause);
      if (id && store.has(id)) {
        const updated = { ...store.get(id), ...setData };
        store.set(id, updated);
        return hasReturning ? [{ ...updated }] : undefined;
      }
      return hasReturning ? [] : undefined;
    }
    if (op === "delete") {
      const id = extractPrimaryId(whereClause);
      if (id) {
        store.delete(id);
      }
      return undefined;
    }
    return undefined;
  };

  const chain: any = {};
  const reset = (newOp: string, table?: string) => {
    op = newOp;
    if (table !== undefined) currentTable = table;
    setData = null;
    insertData = null;
    whereClause = null;
    hasReturning = false;
  };

  chain.select = vi.fn(() => {
    reset("select");
    return chain;
  });
  chain.from = vi.fn((table: any) => {
    currentTable = table?._table || "";
    return chain;
  });
  chain.where = vi.fn((condition: any) => {
    whereClause = condition;
    return chain;
  });
  chain.for = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.insert = vi.fn((table: any) => {
    reset("insert", table?._table || "");
    return chain;
  });
  chain.values = vi.fn((data: any) => {
    insertData = data;
    return chain;
  });
  chain.update = vi.fn((table: any) => {
    reset("update", table?._table || "");
    return chain;
  });
  chain.set = vi.fn((data: any) => {
    setData = data;
    return chain;
  });
  chain.delete = vi.fn((table: any) => {
    reset("delete", table?._table || "");
    return chain;
  });
  chain.returning = vi.fn(() => {
    hasReturning = true;
    return chain;
  });
  chain.onConflictDoUpdate = vi.fn(() => chain);
  chain.target = vi.fn(() => chain);

  chain.then = (onFulfilled: any, onRejected?: any) => {
    try {
      return Promise.resolve(resolve()).then(onFulfilled, onRejected);
    } catch (e) {
      return onRejected ? Promise.reject(e).catch(onRejected) : Promise.reject(e);
    }
  };

  return chain;
}
