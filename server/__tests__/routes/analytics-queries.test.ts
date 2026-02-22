/**
 * @fileoverview Unit tests for analytics queries
 *
 * Tests that query constants are properly defined SQL strings.
 */

import { describe, it, expect } from "vitest";
import {
  WAB_AU_SNAPSHOT,
  WAB_AU_TREND_12_WEEKS,
  UPLOADS_WITH_RESPONSE_48H,
  VOTES_PER_BATTLE,
  CREW_JOIN_RATE,
  D7_RETENTION,
  EXPORT_DRIVEN_SESSIONS,
  KPI_DASHBOARD,
} from "../../analytics/queries";

describe("Analytics Queries", () => {
  describe("WAB_AU_SNAPSHOT", () => {
    it("should be a non-empty SQL string", () => {
      expect(typeof WAB_AU_SNAPSHOT).toBe("string");
      expect(WAB_AU_SNAPSHOT.length).toBeGreaterThan(0);
    });

    it("should query analytics_events table", () => {
      expect(WAB_AU_SNAPSHOT).toContain("analytics_events");
    });

    it("should calculate WAB, AU, and ratio", () => {
      expect(WAB_AU_SNAPSHOT).toContain("wab");
      expect(WAB_AU_SNAPSHOT).toContain("au");
      expect(WAB_AU_SNAPSHOT).toContain("wab_per_au");
    });

    it("should use 7-day window", () => {
      expect(WAB_AU_SNAPSHOT).toContain("7 days");
    });

    it("should include battle events", () => {
      expect(WAB_AU_SNAPSHOT).toContain("battle_created");
      expect(WAB_AU_SNAPSHOT).toContain("battle_joined");
      expect(WAB_AU_SNAPSHOT).toContain("battle_voted");
    });
  });

  describe("WAB_AU_TREND_12_WEEKS", () => {
    it("should be a valid SQL string", () => {
      expect(typeof WAB_AU_TREND_12_WEEKS).toBe("string");
      expect(WAB_AU_TREND_12_WEEKS.length).toBeGreaterThan(0);
    });

    it("should use 12-week window", () => {
      expect(WAB_AU_TREND_12_WEEKS).toContain("12 weeks");
    });

    it("should use date_trunc for weekly bucketing", () => {
      expect(WAB_AU_TREND_12_WEEKS).toContain("date_trunc");
      expect(WAB_AU_TREND_12_WEEKS).toContain("week");
    });

    it("should order by week_start ascending", () => {
      expect(WAB_AU_TREND_12_WEEKS).toContain("ORDER BY week_start ASC");
    });
  });

  describe("UPLOADS_WITH_RESPONSE_48H", () => {
    it("should be a valid SQL string", () => {
      expect(typeof UPLOADS_WITH_RESPONSE_48H).toBe("string");
      expect(UPLOADS_WITH_RESPONSE_48H.length).toBeGreaterThan(0);
    });

    it("should calculate percentage", () => {
      expect(UPLOADS_WITH_RESPONSE_48H).toContain("pct_uploads_with_response_48h");
    });

    it("should use 48-hour window for responses", () => {
      expect(UPLOADS_WITH_RESPONSE_48H).toContain("48 hours");
    });

    it("should reference battle_response_uploaded event", () => {
      expect(UPLOADS_WITH_RESPONSE_48H).toContain("battle_response_uploaded");
    });
  });

  describe("VOTES_PER_BATTLE", () => {
    it("should be a valid SQL string", () => {
      expect(typeof VOTES_PER_BATTLE).toBe("string");
      expect(VOTES_PER_BATTLE.length).toBeGreaterThan(0);
    });

    it("should calculate average votes", () => {
      expect(VOTES_PER_BATTLE).toContain("avg_votes_per_battle");
    });

    it("should filter for battle_voted events", () => {
      expect(VOTES_PER_BATTLE).toContain("battle_voted");
    });
  });

  describe("CREW_JOIN_RATE", () => {
    it("should be a valid SQL string", () => {
      expect(typeof CREW_JOIN_RATE).toBe("string");
      expect(CREW_JOIN_RATE.length).toBeGreaterThan(0);
    });

    it("should calculate crew join rate", () => {
      expect(CREW_JOIN_RATE).toContain("crew_join_rate");
    });

    it("should include crew events", () => {
      expect(CREW_JOIN_RATE).toContain("crew_joined");
      expect(CREW_JOIN_RATE).toContain("crew_created");
    });
  });

  describe("D7_RETENTION", () => {
    it("should be a valid SQL string", () => {
      expect(typeof D7_RETENTION).toBe("string");
      expect(D7_RETENTION.length).toBeGreaterThan(0);
    });

    it("should calculate D7 retention rate", () => {
      expect(D7_RETENTION).toContain("d7_retention_rate");
    });

    it("should use 7-day interval for retention", () => {
      expect(D7_RETENTION).toContain("7 days");
    });

    it("should identify first-seen users", () => {
      expect(D7_RETENTION).toContain("first_seen");
      expect(D7_RETENTION).toContain("MIN(occurred_at");
    });
  });

  describe("EXPORT_DRIVEN_SESSIONS", () => {
    it("should be a valid SQL string", () => {
      expect(typeof EXPORT_DRIVEN_SESSIONS).toBe("string");
      expect(EXPORT_DRIVEN_SESSIONS.length).toBeGreaterThan(0);
    });

    it("should calculate export session rate", () => {
      expect(EXPORT_DRIVEN_SESSIONS).toContain("export_session_rate");
    });

    it("should reference clip_exported event", () => {
      expect(EXPORT_DRIVEN_SESSIONS).toContain("clip_exported");
    });

    it("should filter by session_id", () => {
      expect(EXPORT_DRIVEN_SESSIONS).toContain("session_id IS NOT NULL");
    });
  });

  describe("KPI_DASHBOARD", () => {
    it("should be a valid SQL string", () => {
      expect(typeof KPI_DASHBOARD).toBe("string");
      expect(KPI_DASHBOARD.length).toBeGreaterThan(0);
    });

    it("should combine multiple metrics", () => {
      expect(KPI_DASHBOARD).toContain("wab_per_au");
      expect(KPI_DASHBOARD).toContain("avg_votes_per_battle");
      expect(KPI_DASHBOARD).toContain("crew_join_rate");
    });

    it("should use 7-day window", () => {
      expect(KPI_DASHBOARD).toContain("7 days");
    });
  });
});
