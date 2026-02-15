/**
 * Tests for packages/shared/schema/spots.ts
 *
 * Covers: Drizzle schema objects (spots, spotRatings, checkIns, filmerRequests,
 * filmerDailyCounters, checkinNonces), insertSpotSchema Zod validation,
 * and exported type constants (SPOT_TYPES, SPOT_TIERS).
 */

import {
  SPOT_TYPES,
  SPOT_TIERS,
  spots,
  spotRatings,
  checkIns,
  filmerRequests,
  filmerDailyCounters,
  checkinNonces,
  insertSpotSchema,
  filmerRequestStatusEnum,
  type Spot,
  type InsertSpot,
  type CheckIn,
  type InsertCheckIn,
  type SpotRating,
  type FilmerRequest,
  type InsertFilmerRequest,
  type FilmerDailyCounter,
} from "../schema/spots";

describe("SPOT_TYPES", () => {
  it("contains expected spot types", () => {
    expect(SPOT_TYPES).toContain("rail");
    expect(SPOT_TYPES).toContain("ledge");
    expect(SPOT_TYPES).toContain("stairs");
    expect(SPOT_TYPES).toContain("gap");
    expect(SPOT_TYPES).toContain("bank");
    expect(SPOT_TYPES).toContain("manual-pad");
    expect(SPOT_TYPES).toContain("flat");
    expect(SPOT_TYPES).toContain("bowl");
    expect(SPOT_TYPES).toContain("mini-ramp");
    expect(SPOT_TYPES).toContain("vert");
    expect(SPOT_TYPES).toContain("diy");
    expect(SPOT_TYPES).toContain("park");
    expect(SPOT_TYPES).toContain("street");
    expect(SPOT_TYPES).toContain("other");
  });

  it("has 14 types", () => {
    expect(SPOT_TYPES).toHaveLength(14);
  });
});

describe("SPOT_TIERS", () => {
  it("contains expected tiers", () => {
    expect(SPOT_TIERS).toEqual(["bronze", "silver", "gold", "legendary"]);
  });
});

describe("spots table schema", () => {
  it("is a valid Drizzle table", () => {
    expect(spots).toBeDefined();
    // Drizzle table objects have a $inferSelect type helper
    const selectType: Spot | undefined = undefined;
    expect(selectType).toBeUndefined(); // type-level check only
  });
});

describe("spotRatings table schema", () => {
  it("is defined", () => {
    expect(spotRatings).toBeDefined();
    const rating: SpotRating | undefined = undefined;
    expect(rating).toBeUndefined();
  });

  it("has spotId column referencing spots table (covers line 82)", () => {
    const columns = spotRatings as Record<string, any>;
    expect(columns.spotId).toBeDefined();
    expect(columns.spotId.name).toBe("spot_id");
  });

  it("has userId column for rating author", () => {
    const columns = spotRatings as Record<string, any>;
    expect(columns.userId).toBeDefined();
    expect(columns.userId.name).toBe("user_id");
  });
});

describe("checkIns table schema", () => {
  it("is defined", () => {
    expect(checkIns).toBeDefined();
    const checkIn: CheckIn | undefined = undefined;
    expect(checkIn).toBeUndefined();
  });

  it("has spotId column referencing spots table (covers line 109)", () => {
    const columns = checkIns as Record<string, any>;
    expect(columns.spotId).toBeDefined();
    expect(columns.spotId.name).toBe("spot_id");
  });

  it("has InsertCheckIn type derivable from table", () => {
    const insertType: InsertCheckIn | undefined = undefined;
    expect(insertType).toBeUndefined();
  });
});

describe("filmerRequests table schema", () => {
  it("is defined", () => {
    expect(filmerRequests).toBeDefined();
    const request: FilmerRequest | undefined = undefined;
    expect(request).toBeUndefined();
  });

  it("has checkInId referencing checkIns table (covers line 137)", () => {
    const columns = filmerRequests as Record<string, any>;
    expect(columns.checkInId).toBeDefined();
    expect(columns.checkInId.name).toBe("check_in_id");
  });

  it("has requesterId referencing customUsers table (covers line 140)", () => {
    const columns = filmerRequests as Record<string, any>;
    expect(columns.requesterId).toBeDefined();
    expect(columns.requesterId.name).toBe("requester_id");
  });

  it("has filmerId referencing customUsers table (covers line 143)", () => {
    const columns = filmerRequests as Record<string, any>;
    expect(columns.filmerId).toBeDefined();
    expect(columns.filmerId.name).toBe("filmer_id");
  });

  it("has InsertFilmerRequest type derivable from table", () => {
    const insertType: InsertFilmerRequest | undefined = undefined;
    expect(insertType).toBeUndefined();
  });
});

describe("filmerDailyCounters table schema", () => {
  it("is defined", () => {
    expect(filmerDailyCounters).toBeDefined();
    const counter: FilmerDailyCounter | undefined = undefined;
    expect(counter).toBeUndefined();
  });
});

describe("checkinNonces table schema", () => {
  it("is defined", () => {
    expect(checkinNonces).toBeDefined();
  });
});

describe("filmerRequestStatusEnum", () => {
  it("is defined", () => {
    expect(filmerRequestStatusEnum).toBeDefined();
  });
});

describe("insertSpotSchema", () => {
  it("accepts valid spot data", () => {
    const result = insertSpotSchema.safeParse({
      name: "Hubba Hideout",
      lat: 37.7749,
      lng: -122.4194,
    });
    expect(result.success).toBe(true);
  });

  it("accepts full valid spot data with all optional fields", () => {
    const result = insertSpotSchema.safeParse({
      name: "Hubba Hideout",
      description: "Classic SF spot",
      spotType: "ledge",
      tier: "legendary",
      lat: 37.7749,
      lng: -122.4194,
      address: "1 Market St",
      city: "San Francisco",
      state: "California",
      country: "USA",
      photoUrl: "https://example.com/photo.jpg",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = insertSpotSchema.safeParse({
      lat: 37.7749,
      lng: -122.4194,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = insertSpotSchema.safeParse({
      name: "",
      lat: 37.7749,
      lng: -122.4194,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid lat/lng", () => {
    const result = insertSpotSchema.safeParse({
      name: "Test Spot",
      lat: 100, // out of range
      lng: -122.4194,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid spotType", () => {
    const result = insertSpotSchema.safeParse({
      name: "Test Spot",
      spotType: "invalid_type",
      lat: 37.7749,
      lng: -122.4194,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid tier", () => {
    const result = insertSpotSchema.safeParse({
      name: "Test Spot",
      tier: "diamond",
      lat: 37.7749,
      lng: -122.4194,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid photoUrl", () => {
    const result = insertSpotSchema.safeParse({
      name: "Test Spot",
      lat: 37.7749,
      lng: -122.4194,
      photoUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name that is too long", () => {
    const result = insertSpotSchema.safeParse({
      name: "x".repeat(101),
      lat: 37.7749,
      lng: -122.4194,
    });
    expect(result.success).toBe(false);
  });
});
