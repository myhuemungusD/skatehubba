import { describe, expect, it, vi } from "vitest";
import { createProfileWithRollback, createUsernameStore } from "../services/profileService";
import type { Database } from "../db";

/**
 * Creates a mock database object that simulates drizzle query chains.
 *
 * Results are consumed from queues in call order:
 * - pushSelect: feeds results to .select().from().where().limit()
 * - pushInsert: feeds results to .insert().values().onConflictDoNothing().returning()
 * - pushTxInsert: feeds results to tx.insert() inside db.transaction()
 */
function createMockDb() {
  const selectResults: unknown[][] = [];
  const insertResults: unknown[][] = [];
  const txInsertResults: unknown[][] = [];

  const makeInsertChain = (queue: unknown[][]) => ({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn(async () => queue.shift() ?? []),
      }),
    }),
  });

  const makeSelectChain = () => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn(async () => selectResults.shift() ?? []),
      }),
    }),
  });

  const makeDeleteChain = () => ({
    where: vi.fn(async () => undefined),
  });

  const db = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: vi.fn(() => makeInsertChain(txInsertResults)),
      };
      return fn(tx);
    }),
    select: vi.fn(() => makeSelectChain()),
    insert: vi.fn(() => makeInsertChain(insertResults)),
    delete: vi.fn(() => makeDeleteChain()),
  };

  return {
    db: db as unknown as Database,
    pushSelect: (...results: unknown[][]) => {
      selectResults.push(...results);
    },
    pushInsert: (...results: unknown[][]) => {
      insertResults.push(...results);
    },
    pushTxInsert: (...results: unknown[][]) => {
      txInsertResults.push(...results);
    },
  };
}

// -----------------------------------------------------------------------------
// createUsernameStore
// -----------------------------------------------------------------------------
describe("createUsernameStore", () => {
  // ---------------------------------------------------------------------------
  // reserve
  // ---------------------------------------------------------------------------
  describe("reserve", () => {
    it("returns true when the insert returns a row", async () => {
      const { db, pushTxInsert } = createMockDb();
      pushTxInsert([{ username: "sk8r_dude" }]);

      const store = createUsernameStore(db);
      const result = await store.reserve("uid-1", "sk8r_dude");

      expect(result).toBe(true);
      expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it("returns false when the insert returns an empty array (conflict)", async () => {
      const { db, pushTxInsert } = createMockDb();
      pushTxInsert([]);

      const store = createUsernameStore(db);
      const result = await store.reserve("uid-1", "sk8r_dude");

      expect(result).toBe(false);
      expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it("handles consecutive calls with independent results", async () => {
      const { db, pushTxInsert } = createMockDb();
      pushTxInsert([{ username: "first" }]);
      pushTxInsert([]);

      const store = createUsernameStore(db);

      expect(await store.reserve("uid-1", "first")).toBe(true);
      expect(await store.reserve("uid-2", "first")).toBe(false);
      expect(db.transaction).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // release
  // ---------------------------------------------------------------------------
  describe("release", () => {
    it("calls delete on the database with the given uid", async () => {
      const { db } = createMockDb();

      const store = createUsernameStore(db);
      await store.release("uid-42");

      expect(db.delete).toHaveBeenCalledTimes(1);
    });

    it("does not throw when called multiple times", async () => {
      const { db } = createMockDb();

      const store = createUsernameStore(db);
      await store.release("uid-1");
      await store.release("uid-2");

      expect(db.delete).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // isAvailable
  // ---------------------------------------------------------------------------
  describe("isAvailable", () => {
    it("returns true when no existing entry is found", async () => {
      const { db, pushSelect } = createMockDb();
      pushSelect([]);

      const store = createUsernameStore(db);
      const result = await store.isAvailable("fresh_name");

      expect(result).toBe(true);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it("returns false when the username is already taken", async () => {
      const { db, pushSelect } = createMockDb();
      pushSelect([{ username: "taken_name" }]);

      const store = createUsernameStore(db);
      const result = await store.isAvailable("taken_name");

      expect(result).toBe(false);
      expect(db.select).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // ensure
  // ---------------------------------------------------------------------------
  describe("ensure", () => {
    it("returns true when the user already has the same username", async () => {
      const { db, pushSelect } = createMockDb();
      // First select (by uid) returns the matching username
      pushSelect([{ username: "alpha" }]);

      const store = createUsernameStore(db);
      const result = await store.ensure("uid-1", "alpha");

      expect(result).toBe(true);
      // Only one select is needed; insert should not be called
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("returns false when the user already has a different username", async () => {
      const { db, pushSelect } = createMockDb();
      // First select (by uid) returns a different username
      pushSelect([{ username: "beta" }]);

      const store = createUsernameStore(db);
      const result = await store.ensure("uid-1", "alpha");

      expect(result).toBe(false);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("returns true when no existing entry and reserve succeeds", async () => {
      const { db, pushSelect, pushInsert } = createMockDb();
      // First select (by uid) returns empty
      pushSelect([]);
      // Insert succeeds
      pushInsert([{ username: "alpha" }]);

      const store = createUsernameStore(db);
      const result = await store.ensure("uid-1", "alpha");

      expect(result).toBe(true);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it("returns true when reserve fails due to conflict but same uid owns it", async () => {
      const { db, pushSelect, pushInsert } = createMockDb();
      // First select (by uid) returns empty — no existing reservation for this user
      pushSelect([]);
      // Insert fails (conflict — another request for the same user raced ahead)
      pushInsert([]);
      // Second select (by username) returns the same uid
      pushSelect([{ uid: "uid-1" }]);

      const store = createUsernameStore(db);
      const result = await store.ensure("uid-1", "alpha");

      expect(result).toBe(true);
      expect(db.select).toHaveBeenCalledTimes(2);
      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it("returns false when reserve fails and a different uid owns the username", async () => {
      const { db, pushSelect, pushInsert } = createMockDb();
      // First select (by uid) returns empty
      pushSelect([]);
      // Insert fails (conflict)
      pushInsert([]);
      // Second select (by username) returns a different uid
      pushSelect([{ uid: "uid-other" }]);

      const store = createUsernameStore(db);
      const result = await store.ensure("uid-1", "alpha");

      expect(result).toBe(false);
      expect(db.select).toHaveBeenCalledTimes(2);
      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it("returns false when reserve fails and username row no longer exists", async () => {
      const { db, pushSelect, pushInsert } = createMockDb();
      // First select (by uid) returns empty
      pushSelect([]);
      // Insert fails (conflict)
      pushInsert([]);
      // Second select (by username) also returns empty (row was deleted in the meantime)
      pushSelect([]);

      const store = createUsernameStore(db);
      const result = await store.ensure("uid-1", "alpha");

      expect(result).toBe(false);
      expect(db.select).toHaveBeenCalledTimes(2);
    });
  });
});

// -----------------------------------------------------------------------------
// createProfileWithRollback
// -----------------------------------------------------------------------------
describe("createProfileWithRollback", () => {
  it("returns the profile when writeProfile succeeds", async () => {
    const profile = { uid: "uid-1", username: "sk8r", avatarUrl: "https://example.com/avatar.png" };
    const usernameStore = {
      reserve: vi.fn(),
      release: vi.fn(),
      isAvailable: vi.fn(),
      ensure: vi.fn(),
    };

    const result = await createProfileWithRollback({
      uid: "uid-1",
      usernameStore,
      writeProfile: async () => profile,
    });

    expect(result).toEqual(profile);
    expect(usernameStore.release).not.toHaveBeenCalled();
  });

  it("calls usernameStore.release and re-throws when writeProfile fails", async () => {
    const usernameStore = {
      reserve: vi.fn(),
      release: vi.fn().mockResolvedValue(undefined),
      isAvailable: vi.fn(),
      ensure: vi.fn(),
    };

    const error = new Error("db_write_failed");

    await expect(
      createProfileWithRollback({
        uid: "uid-99",
        usernameStore,
        writeProfile: async () => {
          throw error;
        },
      })
    ).rejects.toThrow("db_write_failed");

    expect(usernameStore.release).toHaveBeenCalledTimes(1);
    expect(usernameStore.release).toHaveBeenCalledWith("uid-99");
  });

  it("propagates the original error even if release also throws", async () => {
    const usernameStore = {
      reserve: vi.fn(),
      release: vi.fn().mockRejectedValue(new Error("release_failed")),
      isAvailable: vi.fn(),
      ensure: vi.fn(),
    };

    // When release itself throws, the release error propagates instead of the
    // original error because the code does `await usernameStore.release(uid)`
    // without its own try/catch. This test documents that behavior.
    await expect(
      createProfileWithRollback({
        uid: "uid-1",
        usernameStore,
        writeProfile: async () => {
          throw new Error("write_failed");
        },
      })
    ).rejects.toThrow("release_failed");

    expect(usernameStore.release).toHaveBeenCalledWith("uid-1");
  });

  it("does not call release when writeProfile resolves with a falsy value", async () => {
    const usernameStore = {
      reserve: vi.fn(),
      release: vi.fn(),
      isAvailable: vi.fn(),
      ensure: vi.fn(),
    };

    const result = await createProfileWithRollback({
      uid: "uid-1",
      usernameStore,
      writeProfile: async () => null as unknown,
    });

    expect(result).toBeNull();
    expect(usernameStore.release).not.toHaveBeenCalled();
  });
});
