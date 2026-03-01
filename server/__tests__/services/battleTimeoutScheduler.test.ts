/**
 * @fileoverview Coverage tests for battleTimeoutScheduler
 *
 * Targets uncovered lines:
 * - isRunning guard — early return when a previous run is still in progress
 * - startTimeoutScheduler already running warning
 * - stopTimeoutScheduler — clearing the interval
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let resolveBattleTimeouts!: () => void;
const mockProcessBattleTimeouts = vi.fn().mockImplementation(
  () =>
    new Promise<void>((resolve) => {
      resolveBattleTimeouts = resolve;
    })
);

vi.mock("../../services/battleStateService", () => ({
  processVoteTimeouts: (...args: any[]) => mockProcessBattleTimeouts(...args),
}));

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};
vi.mock("../../logger", () => ({
  default: mockLogger,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { forceTimeoutCheck, startTimeoutScheduler, stopTimeoutScheduler } =
  await import("../../services/battleTimeoutScheduler");

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("battleTimeoutScheduler coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stopTimeoutScheduler();
  });

  afterEach(() => {
    stopTimeoutScheduler();
    vi.useRealTimers();
  });

  it("skips when already running", async () => {
    vi.useRealTimers();

    const firstCall = forceTimeoutCheck();
    const secondCall = forceTimeoutCheck();

    expect(mockProcessBattleTimeouts).toHaveBeenCalledTimes(1);

    resolveBattleTimeouts();
    await firstCall;
    await secondCall;
  });

  it("warns when startTimeoutScheduler is called while already running", () => {
    mockProcessBattleTimeouts.mockResolvedValue(undefined);

    startTimeoutScheduler();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "[Scheduler] Timeout scheduler started",
      expect.objectContaining({ intervalMs: 10000 })
    );

    startTimeoutScheduler();
    expect(mockLogger.warn).toHaveBeenCalledWith("[Scheduler] Timeout scheduler already running");
  });

  it("stops the scheduler and logs when running", () => {
    mockProcessBattleTimeouts.mockResolvedValue(undefined);

    startTimeoutScheduler();
    mockLogger.info.mockClear();

    stopTimeoutScheduler();
    expect(mockLogger.info).toHaveBeenCalledWith("[Scheduler] Timeout scheduler stopped");
  });

  it("does nothing when stopTimeoutScheduler is called with no running scheduler", () => {
    mockLogger.info.mockClear();
    stopTimeoutScheduler();
    expect(mockLogger.info).not.toHaveBeenCalledWith("[Scheduler] Timeout scheduler stopped");
  });

  it("catches errors from battle timeouts without crashing", async () => {
    vi.useRealTimers();
    mockProcessBattleTimeouts.mockRejectedValueOnce(new Error("db error"));

    await forceTimeoutCheck();

    expect(mockLogger.error).toHaveBeenCalledWith(
      "[Scheduler] Battle timeout processing failed",
      expect.objectContaining({ error: expect.any(Error) })
    );
  });
});
