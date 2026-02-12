import { CheckInResultSchema, type CheckInResult } from "../checkin-types";

describe("CheckInResultSchema", () => {
  const validCheckIn: CheckInResult = {
    id: "checkin-001",
    trick: "kickflip",
    spotId: "spot-42",
    createdAt: "2025-01-15T10:00:00Z",
    awardedPoints: 100,
  };

  it("parses a valid check-in result", () => {
    const result = CheckInResultSchema.parse(validCheckIn);
    expect(result).toEqual(validCheckIn);
  });

  it("accepts optional videoUrl", () => {
    const withVideo = { ...validCheckIn, videoUrl: "https://cdn.example.com/clip.mp4" };
    const result = CheckInResultSchema.parse(withVideo);
    expect(result.videoUrl).toBe("https://cdn.example.com/clip.mp4");
  });

  it("rejects missing required fields", () => {
    const incomplete = { id: "checkin-001", trick: "kickflip" };
    const result = CheckInResultSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it("rejects invalid awardedPoints type", () => {
    const badPoints = { ...validCheckIn, awardedPoints: "not-a-number" };
    const result = CheckInResultSchema.safeParse(badPoints);
    expect(result.success).toBe(false);
  });
});
