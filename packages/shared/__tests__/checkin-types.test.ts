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

  it("parses without optional videoUrl (field is omitted)", () => {
    const result = CheckInResultSchema.safeParse(validCheckIn);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.videoUrl).toBeUndefined();
    }
  });

  it("rejects missing id field", () => {
    const { id, ...noId } = validCheckIn;
    const result = CheckInResultSchema.safeParse(noId);
    expect(result.success).toBe(false);
  });

  it("rejects missing trick field", () => {
    const { trick, ...noTrick } = validCheckIn;
    const result = CheckInResultSchema.safeParse(noTrick);
    expect(result.success).toBe(false);
  });

  it("rejects missing spotId field", () => {
    const { spotId, ...noSpotId } = validCheckIn;
    const result = CheckInResultSchema.safeParse(noSpotId);
    expect(result.success).toBe(false);
  });

  it("rejects missing createdAt field", () => {
    const { createdAt, ...noCreatedAt } = validCheckIn;
    const result = CheckInResultSchema.safeParse(noCreatedAt);
    expect(result.success).toBe(false);
  });

  it("rejects invalid id type (number instead of string)", () => {
    const badId = { ...validCheckIn, id: 123 };
    const result = CheckInResultSchema.safeParse(badId);
    expect(result.success).toBe(false);
  });

  it("accepts awardedPoints of zero", () => {
    const zeroPoints = { ...validCheckIn, awardedPoints: 0 };
    const result = CheckInResultSchema.safeParse(zeroPoints);
    expect(result.success).toBe(true);
  });

  it("accepts negative awardedPoints (no min constraint)", () => {
    const negPoints = { ...validCheckIn, awardedPoints: -10 };
    const result = CheckInResultSchema.safeParse(negPoints);
    expect(result.success).toBe(true);
  });

  it("CheckInResult type is usable", () => {
    const typed: CheckInResult = validCheckIn;
    expect(typed.trick).toBe("kickflip");
  });
});
