import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../db", () => ({
  db: null as any,
  requireDb: vi.fn(),
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@shared/schema", () => ({
  customUsers: {
    id: "id",
    email: "email",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((field, value) => ({ field, value })),
}));

import {
  createUser,
  getUserById,
  getUserByEmail,
  updateUser,
  deleteUser,
  getOrCreateUser,
} from "./userService";
import * as dbModule from "../db";

describe("createUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts user and returns created record", async () => {
    const user = { id: "uid1", email: "test@example.com", passwordHash: "hashed" };
    const returningFn = vi.fn().mockResolvedValue([user]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = { insert: insertFn };
    (dbModule.requireDb as any).mockReturnValue(db);

    const result = await createUser({
      id: "uid1",
      email: "test@example.com",
      passwordHash: "hashed",
    });
    expect(result).toEqual(user);
    expect(insertFn).toHaveBeenCalled();
  });
});

describe("getUserById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when db is null", async () => {
    (dbModule as any).db = null;
    const result = await getUserById("uid1");
    expect(result).toBeNull();
  });

  it("returns user when found", async () => {
    const user = { id: "uid1", email: "test@example.com" };
    const limitFn = vi.fn().mockResolvedValue([user]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    (dbModule as any).db = { select: selectFn };

    const result = await getUserById("uid1");
    expect(result).toEqual(user);
  });

  it("returns null when user not found", async () => {
    const limitFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    (dbModule as any).db = { select: selectFn };

    const result = await getUserById("nonexistent");
    expect(result).toBeNull();
  });
});

describe("getUserByEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when db is null", async () => {
    (dbModule as any).db = null;
    const result = await getUserByEmail("test@example.com");
    expect(result).toBeNull();
  });

  it("returns user when found by email", async () => {
    const user = { id: "uid1", email: "test@example.com" };
    const limitFn = vi.fn().mockResolvedValue([user]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    (dbModule as any).db = { select: selectFn };

    const result = await getUserByEmail("test@example.com");
    expect(result).toEqual(user);
  });
});

describe("updateUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates user and returns updated record", async () => {
    const updated = { id: "uid1", firstName: "Alice" };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = { update: updateFn };
    (dbModule.requireDb as any).mockReturnValue(db);

    const result = await updateUser("uid1", { firstName: "Alice" });
    expect(result).toEqual(updated);
  });

  it("throws when user not found", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = { update: updateFn };
    (dbModule.requireDb as any).mockReturnValue(db);

    await expect(updateUser("nonexistent", { firstName: "Alice" })).rejects.toThrow("not found");
  });
});

describe("deleteUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes user from database", async () => {
    const whereFn = vi.fn().mockResolvedValue(undefined);
    const deleteFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = { delete: deleteFn };
    (dbModule.requireDb as any).mockReturnValue(db);

    await deleteUser("uid1");
    expect(deleteFn).toHaveBeenCalled();
  });
});

describe("getOrCreateUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing user without creating", async () => {
    const user = { id: "uid1", email: "test@example.com" };
    const limitFn = vi.fn().mockResolvedValue([user]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    (dbModule as any).db = { select: selectFn };

    const result = await getOrCreateUser({
      id: "uid1",
      email: "test@example.com",
      passwordHash: "hashed",
    });
    expect(result).toEqual(user);
  });

  it("creates user when not found", async () => {
    const user = { id: "uid1", email: "test@example.com" };
    // First call: getUserById returns null
    const limitFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    (dbModule as any).db = { select: selectFn };

    // createUser mock
    const returningFn = vi.fn().mockResolvedValue([user]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const dbForCreate = { insert: insertFn };
    (dbModule.requireDb as any).mockReturnValue(dbForCreate);

    const result = await getOrCreateUser({
      id: "uid1",
      email: "test@example.com",
      passwordHash: "hashed",
    });
    expect(result).toEqual(user);
  });

  it("handles race condition with duplicate insert (23505)", async () => {
    const user = { id: "uid1", email: "test@example.com" };

    // getUserById: first returns null, second returns user
    let getUserCalls = 0;
    const limitFn = vi.fn().mockImplementation(() => {
      getUserCalls++;
      return Promise.resolve(getUserCalls <= 1 ? [] : [user]);
    });
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    (dbModule as any).db = { select: selectFn };

    // createUser throws unique constraint
    const pgError = Object.assign(new Error("unique"), { code: "23505" });
    const returningFn = vi.fn().mockRejectedValue(pgError);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    (dbModule.requireDb as any).mockReturnValue({ insert: insertFn });

    const result = await getOrCreateUser({
      id: "uid1",
      email: "test@example.com",
      passwordHash: "hashed",
    });
    expect(result).toEqual(user);
  });
});
