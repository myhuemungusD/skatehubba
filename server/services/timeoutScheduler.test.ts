import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
vi.mock("./gameStateService", () => ({
  processTimeouts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./battleStateService", () => ({
  processVoteTimeouts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { startTimeoutScheduler, stopTimeoutScheduler, forceTimeoutCheck } from "./timeoutScheduler";
import { processTimeouts } from "./gameStateService";
import { processVoteTimeouts } from "./battleStateService";
import logger from "../logger";

describe("timeoutScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stopTimeoutScheduler(); // Clean state
  });

  afterEach(() => {
    stopTimeoutScheduler();
    vi.useRealTimers();
  });

  it("starts scheduler and runs immediately", () => {
    startTimeoutScheduler();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("started"),
      expect.any(Object)
    );
    expect(processTimeouts).toHaveBeenCalled();
    expect(processVoteTimeouts).toHaveBeenCalled();
  });

  it("warns when starting scheduler twice", () => {
    startTimeoutScheduler();
    startTimeoutScheduler();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("already running"));
  });

  it("stops scheduler cleanly", () => {
    startTimeoutScheduler();
    stopTimeoutScheduler();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("stopped"));
  });

  it("forceTimeoutCheck triggers both handlers", async () => {
    await forceTimeoutCheck();
    expect(processTimeouts).toHaveBeenCalled();
    expect(processVoteTimeouts).toHaveBeenCalled();
  });

  it("handles game timeout errors gracefully", async () => {
    (processTimeouts as any).mockRejectedValueOnce(new Error("game error"));
    await forceTimeoutCheck();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Game timeout"),
      expect.any(Object)
    );
  });

  it("handles battle timeout errors gracefully", async () => {
    (processVoteTimeouts as any).mockRejectedValueOnce(new Error("battle error"));
    await forceTimeoutCheck();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Battle timeout"),
      expect.any(Object)
    );
  });
});
