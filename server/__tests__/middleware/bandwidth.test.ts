/**
 * @fileoverview Unit tests for bandwidth detection middleware
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../../services/videoTranscoder", () => ({}));

const { bandwidthDetection } = await import("../../middleware/bandwidth");

function createReq(
  overrides: Partial<{ query: Record<string, string>; headers: Record<string, string> }> = {}
) {
  return {
    query: {},
    headers: {},
    preferredQuality: undefined as string | undefined,
    ...overrides,
  } as any;
}

function createRes() {
  return {} as any;
}

describe("bandwidthDetection middleware", () => {
  it("should set quality from explicit query param", () => {
    const req = createReq({ query: { quality: "high" } });
    const next = vi.fn();
    bandwidthDetection(req, createRes(), next);
    expect(req.preferredQuality).toBe("high");
    expect(next).toHaveBeenCalled();
  });

  it("should ignore invalid quality query param", () => {
    const req = createReq({ query: { quality: "ultra" } });
    const next = vi.fn();
    bandwidthDetection(req, createRes(), next);
    expect(req.preferredQuality).toBe("medium");
    expect(next).toHaveBeenCalled();
  });

  it("should set low quality for Save-Data header", () => {
    const req = createReq({ headers: { "save-data": "on" } });
    const next = vi.fn();
    bandwidthDetection(req, createRes(), next);
    expect(req.preferredQuality).toBe("low");
    expect(next).toHaveBeenCalled();
  });

  it("should set low quality for slow-2g ECT", () => {
    const req = createReq({ headers: { ect: "slow-2g" } });
    const next = vi.fn();
    bandwidthDetection(req, createRes(), next);
    expect(req.preferredQuality).toBe("low");
    expect(next).toHaveBeenCalled();
  });

  it("should set low quality for 2g ECT", () => {
    const req = createReq({ headers: { ect: "2g" } });
    const next = vi.fn();
    bandwidthDetection(req, createRes(), next);
    expect(req.preferredQuality).toBe("low");
    expect(next).toHaveBeenCalled();
  });

  it("should set medium quality for 3g ECT", () => {
    const req = createReq({ headers: { ect: "3g" } });
    const next = vi.fn();
    bandwidthDetection(req, createRes(), next);
    expect(req.preferredQuality).toBe("medium");
    expect(next).toHaveBeenCalled();
  });

  it("should set medium quality for 4g ECT", () => {
    const req = createReq({ headers: { ect: "4g" } });
    const next = vi.fn();
    bandwidthDetection(req, createRes(), next);
    expect(req.preferredQuality).toBe("medium");
    expect(next).toHaveBeenCalled();
  });

  it("should default to medium when no headers present", () => {
    const req = createReq();
    const next = vi.fn();
    bandwidthDetection(req, createRes(), next);
    expect(req.preferredQuality).toBe("medium");
    expect(next).toHaveBeenCalled();
  });

  it("should prefer explicit query param over Save-Data header", () => {
    const req = createReq({
      query: { quality: "high" },
      headers: { "save-data": "on" },
    });
    const next = vi.fn();
    bandwidthDetection(req, createRes(), next);
    expect(req.preferredQuality).toBe("high");
  });

  it("should accept low quality query param", () => {
    const req = createReq({ query: { quality: "low" } });
    const next = vi.fn();
    bandwidthDetection(req, createRes(), next);
    expect(req.preferredQuality).toBe("low");
  });

  it("should accept medium quality query param", () => {
    const req = createReq({ query: { quality: "medium" } });
    const next = vi.fn();
    bandwidthDetection(req, createRes(), next);
    expect(req.preferredQuality).toBe("medium");
  });
});
