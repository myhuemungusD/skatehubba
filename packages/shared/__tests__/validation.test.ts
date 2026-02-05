import { describe, it, expect } from "vitest";
import { FilmerRequestInput, FilmerRespondInput, FilmerRequestsQuery } from "../validation/filmer";
import { SpotCheckInSchema } from "../validation/spotCheckIn";
import { BetaSignupInput } from "../validation/betaSignup";

describe("FilmerRequestInput", () => {
  it("accepts valid input", () => {
    expect(FilmerRequestInput.safeParse({ checkInId: "c1", filmerUid: "u1" }).success).toBe(true);
  });

  it("rejects empty checkInId", () => {
    expect(FilmerRequestInput.safeParse({ checkInId: "", filmerUid: "u1" }).success).toBe(false);
  });

  it("rejects extra fields (strict)", () => {
    expect(
      FilmerRequestInput.safeParse({ checkInId: "c1", filmerUid: "u1", extra: "field" }).success
    ).toBe(false);
  });

  it("rejects checkInId over max length", () => {
    expect(
      FilmerRequestInput.safeParse({ checkInId: "x".repeat(65), filmerUid: "u1" }).success
    ).toBe(false);
  });
});

describe("FilmerRespondInput", () => {
  it("accepts valid accept action", () => {
    expect(FilmerRespondInput.safeParse({ requestId: "r1", action: "accept" }).success).toBe(true);
  });

  it("accepts reject with reason", () => {
    expect(
      FilmerRespondInput.safeParse({ requestId: "r1", action: "reject", reason: "busy" }).success
    ).toBe(true);
  });

  it("rejects reject without reason", () => {
    expect(FilmerRespondInput.safeParse({ requestId: "r1", action: "reject" }).success).toBe(false);
  });

  it("rejects invalid action", () => {
    expect(FilmerRespondInput.safeParse({ requestId: "r1", action: "ignore" }).success).toBe(false);
  });
});

describe("FilmerRequestsQuery", () => {
  it("accepts empty query", () => {
    expect(FilmerRequestsQuery.safeParse({}).success).toBe(true);
  });

  it("accepts valid status filter", () => {
    expect(FilmerRequestsQuery.safeParse({ status: "pending" }).success).toBe(true);
    expect(FilmerRequestsQuery.safeParse({ status: "accepted" }).success).toBe(true);
    expect(FilmerRequestsQuery.safeParse({ status: "rejected" }).success).toBe(true);
  });

  it("accepts valid role filter", () => {
    expect(FilmerRequestsQuery.safeParse({ role: "filmer" }).success).toBe(true);
    expect(FilmerRequestsQuery.safeParse({ role: "requester" }).success).toBe(true);
    expect(FilmerRequestsQuery.safeParse({ role: "all" }).success).toBe(true);
  });

  it("accepts valid limit", () => {
    expect(FilmerRequestsQuery.safeParse({ limit: 10 }).success).toBe(true);
    expect(FilmerRequestsQuery.safeParse({ limit: 1 }).success).toBe(true);
    expect(FilmerRequestsQuery.safeParse({ limit: 50 }).success).toBe(true);
  });

  it("rejects limit out of range", () => {
    expect(FilmerRequestsQuery.safeParse({ limit: 0 }).success).toBe(false);
    expect(FilmerRequestsQuery.safeParse({ limit: 51 }).success).toBe(false);
  });
});

describe("SpotCheckInSchema", () => {
  const valid = {
    spotId: 1,
    lat: 40.7128,
    lng: -74.006,
    clientTimestamp: "2024-01-01T00:00:00.000Z",
    nonce: "abcdef1234567890",
  };

  it("accepts valid check-in", () => {
    expect(SpotCheckInSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects non-integer spotId", () => {
    expect(SpotCheckInSchema.safeParse({ ...valid, spotId: 1.5 }).success).toBe(false);
  });

  it("rejects out-of-range lat", () => {
    expect(SpotCheckInSchema.safeParse({ ...valid, lat: 91 }).success).toBe(false);
    expect(SpotCheckInSchema.safeParse({ ...valid, lat: -91 }).success).toBe(false);
  });

  it("rejects out-of-range lng", () => {
    expect(SpotCheckInSchema.safeParse({ ...valid, lng: 181 }).success).toBe(false);
    expect(SpotCheckInSchema.safeParse({ ...valid, lng: -181 }).success).toBe(false);
  });

  it("rejects invalid datetime format", () => {
    expect(SpotCheckInSchema.safeParse({ ...valid, clientTimestamp: "not-a-date" }).success).toBe(
      false
    );
  });

  it("rejects short nonce", () => {
    expect(SpotCheckInSchema.safeParse({ ...valid, nonce: "short" }).success).toBe(false);
  });

  it("rejects nonce over 128 chars", () => {
    expect(SpotCheckInSchema.safeParse({ ...valid, nonce: "x".repeat(129) }).success).toBe(false);
  });

  it("rejects extra fields (strict)", () => {
    expect(SpotCheckInSchema.safeParse({ ...valid, extra: "field" }).success).toBe(false);
  });
});

describe("BetaSignupInput", () => {
  it("accepts valid signup", () => {
    expect(BetaSignupInput.safeParse({ email: "test@example.com", platform: "ios" }).success).toBe(
      true
    );
    expect(
      BetaSignupInput.safeParse({ email: "test@example.com", platform: "android" }).success
    ).toBe(true);
  });

  it("normalizes email to lowercase", () => {
    const result = BetaSignupInput.parse({ email: "Test@Example.COM", platform: "ios" });
    expect(result.email).toBe("test@example.com");
  });

  it("trims email whitespace", () => {
    const result = BetaSignupInput.parse({ email: "  test@example.com  ", platform: "ios" });
    expect(result.email).toBe("test@example.com");
  });

  it("rejects invalid email", () => {
    expect(BetaSignupInput.safeParse({ email: "not-email", platform: "ios" }).success).toBe(false);
  });

  it("rejects invalid platform", () => {
    expect(BetaSignupInput.safeParse({ email: "test@example.com", platform: "web" }).success).toBe(
      false
    );
  });

  it("rejects extra fields (strict)", () => {
    expect(
      BetaSignupInput.safeParse({ email: "test@example.com", platform: "ios", extra: true }).success
    ).toBe(false);
  });
});
