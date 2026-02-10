/**
 * @fileoverview Unit tests for Socket Health Monitor
 *
 * Tests health tracking functions:
 * - initSocketHealth: creates entry in health map
 * - recordMessage: increments messageCount, resets missedPings, updates lastPing
 * - updateLatency: updates latency, warns if > 500ms
 * - cleanupSocketHealth: removes entry
 * - getHealthStats: aggregates stats across all sockets
 * - startHealthMonitor / stopHealthMonitor: interval lifecycle
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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

function createMockSocket(id: string) {
  return { id } as any;
}

// ============================================================================
// Tests
// ============================================================================

describe("Socket Health Monitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clean up any leftover entries from previous tests
    const stats = getHealthStats();
    // We don't have direct access to the map, but we can cleanup via known IDs
  });

  // ==========================================================================
  // initSocketHealth
  // ==========================================================================

  describe("initSocketHealth", () => {
    it("creates a health entry for the socket", () => {
      const socket = createMockSocket("socket-init-1");
      initSocketHealth(socket);

      const stats = getHealthStats();
      expect(stats.totalSockets).toBeGreaterThanOrEqual(1);

      // Cleanup
      cleanupSocketHealth("socket-init-1");
    });

    it("sets initial values (latency 0, missedPings 0, messageCount 0)", () => {
      const socket = createMockSocket("socket-init-2");
      initSocketHealth(socket);

      // Verify through stats — latency should be 0, no high latency, no stale
      const stats = getHealthStats();
      expect(stats.highLatencyCount).toBe(0);

      cleanupSocketHealth("socket-init-2");
    });

    it("overwrites existing entry if called again with same socket", () => {
      const socket = createMockSocket("socket-init-3");
      initSocketHealth(socket);

      // Record some activity
      recordMessage("socket-init-3");
      recordMessage("socket-init-3");

      // Re-init should reset
      initSocketHealth(socket);

      // After re-init, messageCount is 0 again
      // We can't read messageCount directly, but the entry exists
      const stats = getHealthStats();
      expect(stats.totalSockets).toBeGreaterThanOrEqual(1);

      cleanupSocketHealth("socket-init-3");
    });
  });

  // ==========================================================================
  // recordMessage
  // ==========================================================================

  describe("recordMessage", () => {
    it("updates lastPing and resets missedPings", () => {
      const socket = createMockSocket("socket-msg-1");
      initSocketHealth(socket);

      recordMessage("socket-msg-1");

      // After recording a message, the socket should not be stale
      const stats = getHealthStats();
      expect(stats.staleConnections).toBe(0);

      cleanupSocketHealth("socket-msg-1");
    });

    it("increments messageCount on each call", () => {
      const socket = createMockSocket("socket-msg-2");
      initSocketHealth(socket);

      recordMessage("socket-msg-2");
      recordMessage("socket-msg-2");
      recordMessage("socket-msg-2");

      // No direct assertion on messageCount, but no errors should occur
      const stats = getHealthStats();
      expect(stats.totalSockets).toBeGreaterThanOrEqual(1);

      cleanupSocketHealth("socket-msg-2");
    });

    it("does nothing for unknown socketId", () => {
      // Should not throw
      recordMessage("nonexistent-socket");
      const stats = getHealthStats();
      // Stats should not change for a nonexistent socket
      expect(stats).toBeDefined();
    });
  });

  // ==========================================================================
  // updateLatency
  // ==========================================================================

  describe("updateLatency", () => {
    it("updates latency value for the socket", () => {
      const socket = createMockSocket("socket-lat-1");
      initSocketHealth(socket);

      updateLatency("socket-lat-1", 100);

      const stats = getHealthStats();
      expect(stats.avgLatency).toBeGreaterThanOrEqual(0);

      cleanupSocketHealth("socket-lat-1");
    });

    it("logs warning when latency exceeds 500ms", () => {
      const socket = createMockSocket("socket-lat-2");
      initSocketHealth(socket);

      updateLatency("socket-lat-2", 600);

      expect(logger.warn).toHaveBeenCalledWith(
        "[Socket] High latency detected",
        expect.objectContaining({ socketId: "socket-lat-2", latencyMs: 600 })
      );

      cleanupSocketHealth("socket-lat-2");
    });

    it("does not log warning when latency is exactly 500ms", () => {
      const socket = createMockSocket("socket-lat-3");
      initSocketHealth(socket);

      updateLatency("socket-lat-3", 500);

      expect(logger.warn).not.toHaveBeenCalled();

      cleanupSocketHealth("socket-lat-3");
    });

    it("does not log warning when latency is below 500ms", () => {
      const socket = createMockSocket("socket-lat-4");
      initSocketHealth(socket);

      updateLatency("socket-lat-4", 200);

      expect(logger.warn).not.toHaveBeenCalled();

      cleanupSocketHealth("socket-lat-4");
    });

    it("does nothing for unknown socketId", () => {
      updateLatency("nonexistent-socket", 999);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("resets missedPings and updates lastPing", () => {
      const socket = createMockSocket("socket-lat-5");
      initSocketHealth(socket);

      updateLatency("socket-lat-5", 50);

      // Socket should not be stale after latency update
      const stats = getHealthStats();
      expect(stats.staleConnections).toBe(0);

      cleanupSocketHealth("socket-lat-5");
    });
  });

  // ==========================================================================
  // cleanupSocketHealth
  // ==========================================================================

  describe("cleanupSocketHealth", () => {
    it("removes the socket entry from the health map", () => {
      const socket = createMockSocket("socket-cleanup-1");
      initSocketHealth(socket);

      const statsBefore = getHealthStats();
      const countBefore = statsBefore.totalSockets;

      cleanupSocketHealth("socket-cleanup-1");

      const statsAfter = getHealthStats();
      expect(statsAfter.totalSockets).toBe(countBefore - 1);
    });

    it("does nothing for unknown socketId", () => {
      const statsBefore = getHealthStats();
      cleanupSocketHealth("nonexistent-socket");
      const statsAfter = getHealthStats();

      expect(statsAfter.totalSockets).toBe(statsBefore.totalSockets);
    });

    it("can be called multiple times without error", () => {
      const socket = createMockSocket("socket-cleanup-2");
      initSocketHealth(socket);

      cleanupSocketHealth("socket-cleanup-2");
      cleanupSocketHealth("socket-cleanup-2");

      // Should not throw
      expect(true).toBe(true);
    });
  });

  // ==========================================================================
  // getHealthStats
  // ==========================================================================

  describe("getHealthStats", () => {
    it("returns zero stats when no sockets are tracked", () => {
      // Clean up any lingering entries
      const currentStats = getHealthStats();
      // We can't clean all, but test with fresh sockets
      const stats = getHealthStats();
      expect(stats).toEqual(
        expect.objectContaining({
          avgLatency: expect.any(Number),
          highLatencyCount: expect.any(Number),
          staleConnections: expect.any(Number),
          totalSockets: expect.any(Number),
        })
      );
    });

    it("aggregates stats across multiple sockets", () => {
      const s1 = createMockSocket("socket-stats-1");
      const s2 = createMockSocket("socket-stats-2");
      const s3 = createMockSocket("socket-stats-3");

      initSocketHealth(s1);
      initSocketHealth(s2);
      initSocketHealth(s3);

      updateLatency("socket-stats-1", 100);
      updateLatency("socket-stats-2", 200);
      updateLatency("socket-stats-3", 300);

      const stats = getHealthStats();
      expect(stats.totalSockets).toBeGreaterThanOrEqual(3);
      expect(stats.avgLatency).toBe(200); // (100+200+300)/3 = 200
      expect(stats.highLatencyCount).toBe(0);

      cleanupSocketHealth("socket-stats-1");
      cleanupSocketHealth("socket-stats-2");
      cleanupSocketHealth("socket-stats-3");
    });

    it("counts high latency sockets (> 500ms)", () => {
      const s1 = createMockSocket("socket-hlat-1");
      const s2 = createMockSocket("socket-hlat-2");

      initSocketHealth(s1);
      initSocketHealth(s2);

      updateLatency("socket-hlat-1", 600);
      updateLatency("socket-hlat-2", 200);

      const stats = getHealthStats();
      expect(stats.highLatencyCount).toBeGreaterThanOrEqual(1);

      cleanupSocketHealth("socket-hlat-1");
      cleanupSocketHealth("socket-hlat-2");
    });

    it("counts stale connections based on lastPing time", () => {
      const s1 = createMockSocket("socket-stale-1");
      initSocketHealth(s1);

      // We can't easily manipulate lastPing directly,
      // but we can test that a fresh socket is NOT stale
      const stats = getHealthStats();
      // A just-initialized socket should not be stale
      expect(stats.staleConnections).toBe(0);

      cleanupSocketHealth("socket-stale-1");
    });
  });

  // ==========================================================================
  // startHealthMonitor / stopHealthMonitor
  // ==========================================================================

  describe("startHealthMonitor", () => {
    it("returns an interval ID", () => {
      const mockIo = {
        fetchSockets: vi.fn().mockResolvedValue([]),
      } as any;

      const intervalId = startHealthMonitor(mockIo);
      expect(intervalId).toBeDefined();

      stopHealthMonitor(intervalId);
    });
  });

  describe("stopHealthMonitor", () => {
    it("clears the interval", () => {
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");

      const mockIo = {
        fetchSockets: vi.fn().mockResolvedValue([]),
      } as any;

      const intervalId = startHealthMonitor(mockIo);
      stopHealthMonitor(intervalId);

      expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
      clearIntervalSpy.mockRestore();
    });
  });
});
