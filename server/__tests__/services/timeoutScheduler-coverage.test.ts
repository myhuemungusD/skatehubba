/**
 * @fileoverview Coverage tests for timeoutScheduler
 *
 * Targets uncovered lines:
 * - Line 27: The `isRunning` guard in processAllTimeouts — early return when
 *   a previous run is still in progress
 * - Line 52: The `schedulerInterval` guard in startTimeoutScheduler — warning
 *   when the scheduler is already running
 * - Lines 69-74: stopTimeoutScheduler — clearing the interval
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let resolveGameTimeouts!: () => void;
const mockProcessGameTimeouts = vi.fn().mockImplementation(
  () =>
    new Promise<void>((resolve) => {
      resolveGameTimeouts = resolve;
    })
);
const mockProcessBattleTimeouts = vi.fn().mockResolvedValue(undefined);

vi.mock("../../services/gameStateService", () => ({
  processTimeouts: (...args: any[]) => mockProcessGameTimeouts(...args),
}));
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
  await import("../../services/timeoutScheduler");

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("timeoutScheduler coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Ensure scheduler is stopped between tests
    stopTimeoutScheduler();
  });

  afterEach(() => {
    stopTimeoutScheduler();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // isRunning guard (line 27)
  // -------------------------------------------------------------------------

  it("skips when already running (line 27)", async () => {
    vi.useRealTimers();

    // First call will block on the game timeouts promise
    const firstCall = forceTimeoutCheck();

    // Second call should return immediately because isRunning is true
    const secondCall = forceTimeoutCheck();

    // The game timeout function should only have been invoked once —
    // the second call hit the isRunning guard before reaching it
    expect(mockProcessGameTimeouts).toHaveBeenCalledTimes(1);

    // Unblock the first call
    resolveGameTimeouts();
    await firstCall;
    await secondCall;
  });

  // -------------------------------------------------------------------------
  // startTimeoutScheduler — already running warning (line 52)
  // -------------------------------------------------------------------------

  it("warns when startTimeoutScheduler is called while already running", () => {
    // Make game timeouts resolve immediately for this test
    mockProcessGameTimeouts.mockResolvedValue(undefined);

    startTimeoutScheduler();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "[Scheduler] Timeout scheduler started",
      expect.objectContaining({ intervalMs: 10000 })
    );

    // Call again — should log warning and not start a second interval
    startTimeoutScheduler();
    expect(mockLogger.warn).toHaveBeenCalledWith("[Scheduler] Timeout scheduler already running");
  });

  // -------------------------------------------------------------------------
  // stopTimeoutScheduler (lines 69-74)
  // -------------------------------------------------------------------------

  it("stops the scheduler and logs when running", () => {
    mockProcessGameTimeouts.mockResolvedValue(undefined);

    startTimeoutScheduler();
    mockLogger.info.mockClear();

    stopTimeoutScheduler();
    expect(mockLogger.info).toHaveBeenCalledWith("[Scheduler] Timeout scheduler stopped");
  });

  it("does nothing when stopTimeoutScheduler is called with no running scheduler", () => {
    mockLogger.info.mockClear();
    stopTimeoutScheduler();
    // No log should be emitted because there was nothing to stop
    expect(mockLogger.info).not.toHaveBeenCalledWith("[Scheduler] Timeout scheduler stopped");
  });
});
