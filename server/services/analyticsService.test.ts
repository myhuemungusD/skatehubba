import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("../db", () => ({
  db: null as any,
}));

// Mock logger
vi.mock("../logger", () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the schema-analytics module
vi.mock("../../packages/shared/schema-analytics", () => ({
  analyticsEvents: {},
}));

import { logServerEvent, logServerEventBatch } from "./analyticsService";
import * as dbModule from "../db";
import logger from "../logger";

describe("logServerEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warns and returns when db is null", async () => {
    (dbModule as any).db = null;
    await logServerEvent("uid1", "battle_created" as any, {});
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Database not configured"),
      expect.objectContaining({ uid: "uid1" })
    );
  });

  it("inserts event when db is available", async () => {
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    (dbModule as any).db = { insert: mockInsert };

    await logServerEvent("uid1", "battle_created" as any, { battle_id: "b1" });
    expect(mockInsert).toHaveBeenCalled();
  });

  it("catches insert errors without throwing", async () => {
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("DB error")),
    });
    (dbModule as any).db = { insert: mockInsert };

    await expect(logServerEvent("uid1", "battle_created" as any, {})).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to log server event"),
      expect.any(Object)
    );
  });
});

describe("logServerEventBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns early when db is null", async () => {
    (dbModule as any).db = null;
    await logServerEventBatch([{ uid: "u1", eventName: "battle_created" as any }]);
    // Should not throw
  });

  it("returns early for empty events", async () => {
    (dbModule as any).db = {};
    await logServerEventBatch([]);
    // Should not throw
  });

  it("inserts batch when events are provided", async () => {
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    (dbModule as any).db = { insert: mockInsert };

    await logServerEventBatch([
      { uid: "u1", eventName: "battle_created" as any },
      { uid: "u2", eventName: "battle_voted" as any, properties: { vote: "clean" } },
    ]);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("catches batch insert errors without throwing", async () => {
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("Batch error")),
    });
    (dbModule as any).db = { insert: mockInsert };

    await expect(
      logServerEventBatch([{ uid: "u1", eventName: "battle_created" as any }])
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
