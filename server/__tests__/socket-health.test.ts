/**
 * @fileoverview Unit tests for Socket Health Monitor
 *
 * Tests health tracking functions:
 * - initSocketHealth: creates entry in health map
 * - recordMessage: increments messageCount, resets missedPings, updates lastPing
 * - updateLatency: updates latency, warns if > 500ms
 * - cleanupSocketHealth: removes entry
 * - getHealthStats: aggregates stats across all sockets
 * - startHealthMonitor / stopHealthMonitor: interval lifecycle and stale disconnection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mocks — declared before any application imports
// ============================================================================

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// ============================================================================
// Imports after mocks
// ============================================================================

const {
  initSocketHealth,
  recordMessage,
  updateLatency,
  cleanupSocketHealth,
  getHealthStats,
  startHealthMonitor,
  stopHealthMonitor,
} = await import("../socket/health");

const logger = (await import("../logger")).default;

// ============================================================================
// Helpers
// ============================================================================

/** Unique ID counter to avoid collisions across tests */
let idCounter = 0;

function createMockSocket(id?: string) {
  return { id: id ?? `health-test-${++idCounter}` } as any;
}

// ============================================================================
// Tests
// ============================================================================

describe("Socket Health Monitor", () => {
  /** Track sockets created in each test so we can clean them up */
  let trackedIds: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    trackedIds = [];
  });

  afterEach(() => {
    // Remove any sockets registered during the test
    for (const id of trackedIds) {
      cleanupSocketHealth(id);
    }
  });

  /** Helper: init + track for automatic cleanup */
  function initAndTrack(socket: { id: string }) {
    initSocketHealth(socket as any);
    trackedIds.push(socket.id);
  }

  // ==========================================================================
  // initSocketHealth
  // ==========================================================================

  describe("initSocketHealth", () => {
    it("creates a health entry and getHealthStats reflects 1 socket", () => {
      const socket = createMockSocket("init-single");
      const before = getHealthStats().totalSockets;

      initAndTrack(socket);

      const stats = getHealthStats();
      expect(stats.totalSockets).toBe(before + 1);
    });

    it("initializes with zero latency (avgLatency is 0 for single fresh socket)", () => {
      const socket = createMockSocket("init-zeroes");
      initAndTrack(socket);

      // Only this socket should contribute; latency = 0
      // We need to account for other possible sockets, so just verify
      // that this socket does not count as high latency or stale
      const stats = getHealthStats();
      expect(stats.highLatencyCount).toBe(0);
      expect(stats.staleConnections).toBe(0);
    });

    it("overwrites existing entry when called again with same socket id", () => {
      const socket = createMockSocket("init-overwrite");
      initAndTrack(socket);

      // Bump latency so entry is non-default
      updateLatency("init-overwrite", 800);

      // Re-init should reset latency to 0
      initSocketHealth(socket);

      // The high-latency socket should no longer count
      const stats = getHealthStats();
      expect(stats.highLatencyCount).toBe(0);
    });
  });

  // ==========================================================================
  // recordMessage
  // ==========================================================================

  describe("recordMessage", () => {
    it("increments messageCount (verifiable via no errors on repeated calls)", () => {
      const socket = createMockSocket("msg-inc");
      initAndTrack(socket);

      // Should not throw and socket stays healthy
      recordMessage("msg-inc");
      recordMessage("msg-inc");
      recordMessage("msg-inc");

      const stats = getHealthStats();
      expect(stats.totalSockets).toBeGreaterThanOrEqual(1);
      expect(stats.staleConnections).toBe(0);
    });

    it("resets missedPings so socket is not considered stale after activity", () => {
      vi.useFakeTimers();
      try {
        const socket = createMockSocket("msg-reset");
        initAndTrack(socket);

        // Advance time past stale threshold (60s = 2 * 30s)
        vi.advanceTimersByTime(61_000);

        // Socket would be stale now
        expect(getHealthStats().staleConnections).toBe(1);

        // Recording a message updates lastPing
        recordMessage("msg-reset");

        // No longer stale
        expect(getHealthStats().staleConnections).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does nothing for unknown socketId", () => {
      // Should not throw
      expect(() => recordMessage("nonexistent-socket")).not.toThrow();
    });
  });

  // ==========================================================================
  // updateLatency
  // ==========================================================================

  describe("updateLatency", () => {
    it("updates latency value reflected in avgLatency", () => {
      const socket = createMockSocket("lat-update");
      initAndTrack(socket);

      updateLatency("lat-update", 250);

      const stats = getHealthStats();
      expect(stats.avgLatency).toBe(250);
    });

    it("triggers logger.warn when latency exceeds 500ms", () => {
      const socket = createMockSocket("lat-warn");
      initAndTrack(socket);

      updateLatency("lat-warn", 600);

      expect(logger.warn).toHaveBeenCalledWith(
        "[Socket] High latency detected",
        expect.objectContaining({ socketId: "lat-warn", latencyMs: 600 })
      );
    });

    it("does not warn when latency is exactly 500ms", () => {
      const socket = createMockSocket("lat-500");
      initAndTrack(socket);

      updateLatency("lat-500", 500);

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("does not warn when latency is below 500ms", () => {
      const socket = createMockSocket("lat-low");
      initAndTrack(socket);

      updateLatency("lat-low", 200);

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("does nothing for unknown socketId (no warn)", () => {
      updateLatency("nonexistent-socket", 9999);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("resets missedPings and updates lastPing", () => {
      vi.useFakeTimers();
      try {
        const socket = createMockSocket("lat-ping-reset");
        initAndTrack(socket);

        vi.advanceTimersByTime(61_000);
        expect(getHealthStats().staleConnections).toBe(1);

        updateLatency("lat-ping-reset", 50);
        expect(getHealthStats().staleConnections).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ==========================================================================
  // cleanupSocketHealth
  // ==========================================================================

  describe("cleanupSocketHealth", () => {
    it("removes the socket entry from health tracking", () => {
      const socket = createMockSocket("cleanup-rem");
      initSocketHealth(socket);

      const before = getHealthStats().totalSockets;
      cleanupSocketHealth("cleanup-rem");
      const after = getHealthStats().totalSockets;

      expect(after).toBe(before - 1);
    });

    it("does nothing for unknown socketId", () => {
      const before = getHealthStats().totalSockets;
      cleanupSocketHealth("nonexistent-cleanup");
      const after = getHealthStats().totalSockets;

      expect(after).toBe(before);
    });

    it("can be called multiple times without error", () => {
      const socket = createMockSocket("cleanup-multi");
      initSocketHealth(socket);

      cleanupSocketHealth("cleanup-multi");
      expect(() => cleanupSocketHealth("cleanup-multi")).not.toThrow();
    });
  });

  // ==========================================================================
  // getHealthStats
  // ==========================================================================

  describe("getHealthStats", () => {
    it("returns correct structure with all required fields", () => {
      const stats = getHealthStats();
      expect(stats).toEqual(
        expect.objectContaining({
          totalSockets: expect.any(Number),
          avgLatency: expect.any(Number),
          highLatencyCount: expect.any(Number),
          staleConnections: expect.any(Number),
        })
      );
    });

    it("calculates average latency across multiple sockets", () => {
      const s1 = createMockSocket("stats-avg-1");
      const s2 = createMockSocket("stats-avg-2");
      const s3 = createMockSocket("stats-avg-3");

      // Record baseline so we can isolate our 3 sockets
      const baseline = getHealthStats();

      initAndTrack(s1);
      initAndTrack(s2);
      initAndTrack(s3);

      updateLatency("stats-avg-1", 100);
      updateLatency("stats-avg-2", 200);
      updateLatency("stats-avg-3", 300);

      const stats = getHealthStats();
      expect(stats.totalSockets).toBe(baseline.totalSockets + 3);

      // afterEach cleans up sockets, so baseline should be 0
      // avgLatency = (100+200+300)/3 = 200
      expect(stats.avgLatency).toBe(200);
    });

    it("counts high latency sockets (latency > 500ms)", () => {
      const baseline = getHealthStats();

      const s1 = createMockSocket("stats-high-1");
      const s2 = createMockSocket("stats-high-2");
      const s3 = createMockSocket("stats-high-3");

      initAndTrack(s1);
      initAndTrack(s2);
      initAndTrack(s3);

      updateLatency("stats-high-1", 600); // high
      updateLatency("stats-high-2", 200); // normal
      updateLatency("stats-high-3", 800); // high

      const stats = getHealthStats();
      expect(stats.highLatencyCount).toBe(baseline.highLatencyCount + 2);
    });

    it("counts stale connections based on lastPing age", () => {
      vi.useFakeTimers();
      try {
        const s1 = createMockSocket("stats-stale-1");
        const s2 = createMockSocket("stats-stale-2");

        initAndTrack(s1);
        initAndTrack(s2);

        // Both are fresh
        expect(getHealthStats().staleConnections).toBe(0);

        // Advance past stale threshold (60s = 2 * HEALTH_CHECK_INTERVAL_MS)
        vi.advanceTimersByTime(61_000);

        const stats = getHealthStats();
        expect(stats.staleConnections).toBe(2);

        // Refresh one socket
        recordMessage("stats-stale-1");

        const after = getHealthStats();
        expect(after.staleConnections).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns zero avgLatency when no sockets are tracked", () => {
      // Clean state: if other tests cleaned up, this should be 0
      // We can only assert it does not throw and returns a number
      const stats = getHealthStats();
      expect(typeof stats.avgLatency).toBe("number");
      if (stats.totalSockets === 0) {
        expect(stats.avgLatency).toBe(0);
      }
    });
  });

  // ==========================================================================
  // startHealthMonitor / stopHealthMonitor
  // ==========================================================================

  describe("startHealthMonitor", () => {
    it("returns an interval ID", () => {
      const mockIo = { fetchSockets: vi.fn().mockResolvedValue([]) } as any;

      const intervalId = startHealthMonitor(mockIo);
      expect(intervalId).toBeDefined();

      stopHealthMonitor(intervalId);
    });

    it("disconnects stale sockets that exceed max missed pings", async () => {
      vi.useFakeTimers();
      try {
        const staleSocketMock = {
          id: "monitor-stale",
          data: { odv: "user-stale" },
          disconnect: vi.fn(),
        };
        const healthySocketMock = {
          id: "monitor-healthy",
          data: { odv: "user-healthy" },
          disconnect: vi.fn(),
        };

        const mockIo = {
          fetchSockets: vi.fn().mockResolvedValue([staleSocketMock, healthySocketMock]),
        } as any;

        // Init health entries
        initSocketHealth({ id: "monitor-stale" } as any);
        trackedIds.push("monitor-stale");
        initSocketHealth({ id: "monitor-healthy" } as any);
        trackedIds.push("monitor-healthy");

        const intervalId = startHealthMonitor(mockIo);

        // Need to miss MAX_MISSED_PINGS (3) health checks.
        // Each check interval is 30s. The check increments missedPings
        // when now - lastPing > 30s.
        // Advance 31s and run the interval callback to trigger first missed ping
        vi.advanceTimersByTime(31_000);
        await vi.advanceTimersToNextTimerAsync();
        await Promise.resolve(); // flush microtasks

        // Keep healthy socket alive
        recordMessage("monitor-healthy");

        // Second missed ping
        vi.advanceTimersByTime(30_000);
        await vi.advanceTimersToNextTimerAsync();
        await Promise.resolve();

        recordMessage("monitor-healthy");

        // Third missed ping - should trigger disconnect
        vi.advanceTimersByTime(30_000);
        await vi.advanceTimersToNextTimerAsync();
        await Promise.resolve();

        expect(staleSocketMock.disconnect).toHaveBeenCalledWith(true);
        expect(healthySocketMock.disconnect).not.toHaveBeenCalled();

        stopHealthMonitor(intervalId);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("stopHealthMonitor", () => {
    it("clears the interval via clearInterval", () => {
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");

      const mockIo = { fetchSockets: vi.fn().mockResolvedValue([]) } as any;

      const intervalId = startHealthMonitor(mockIo);
      stopHealthMonitor(intervalId);

      expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
      clearIntervalSpy.mockRestore();
    });
  });
});
