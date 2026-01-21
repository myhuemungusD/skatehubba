import { describe, expect, it, vi } from "vitest";
import { createProfileWithRollback, createUsernameStore } from "../services/profileService";
import type { Database } from "../db";

describe("profileService", () => {
  it("reserves usernames inside a transaction and rejects duplicates", async () => {
    const reservations: Array<Array<{ username: string }>> = [
      [{ username: "alpha" }],
      [],
    ];

    const db = {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const response = reservations.shift() ?? [];
        const tx = {
          insert: () => ({
            values: () => ({
              onConflictDoNothing: () => ({
                returning: async () => response,
              }),
            }),
          }),
        };
        return fn(tx);
      }),
      delete: vi.fn(),
      select: vi.fn(),
    } as unknown as Database;

    const store = createUsernameStore(db);

    const first = await store.reserve("uid-1", "alpha");
    const second = await store.reserve("uid-2", "alpha");

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(db.transaction).toHaveBeenCalledTimes(2);
  });

  it("rolls back username reservation when profile creation fails", async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const usernameStore = {
      reserve: vi.fn().mockResolvedValue(true),
      release,
      isAvailable: vi.fn().mockResolvedValue(true),
    };

    await expect(
      createProfileWithRollback({
        uid: "uid-1",
        usernameStore,
        writeProfile: async () => {
          throw new Error("firestore_failed");
        },
      })
    ).rejects.toThrow("firestore_failed");

    expect(release).toHaveBeenCalledWith("uid-1");
  });
});
