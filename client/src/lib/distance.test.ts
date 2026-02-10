import { calculateDistance, formatDistance, getProximity } from "./distance";

describe("calculateDistance", () => {
  it("returns 0 for same point", () => {
    expect(calculateDistance(0, 0, 0, 0)).toBe(0);
  });

  it("calculates ~111km for 1 degree latitude at equator", () => {
    const dist = calculateDistance(0, 0, 1, 0);
    expect(dist).toBeGreaterThan(110_000);
    expect(dist).toBeLessThan(112_000);
  });

  it("calculates known distance: NYC to LA (~3940km)", () => {
    const dist = calculateDistance(40.7128, -74.006, 34.0522, -118.2437);
    expect(dist).toBeGreaterThan(3_900_000);
    expect(dist).toBeLessThan(4_000_000);
  });

  it("handles antipodal points (~20000km)", () => {
    const dist = calculateDistance(0, 0, 0, 180);
    expect(dist).toBeGreaterThan(20_000_000);
    expect(dist).toBeLessThan(20_100_000);
  });

  it("is symmetric", () => {
    const d1 = calculateDistance(10, 20, 30, 40);
    const d2 = calculateDistance(30, 40, 10, 20);
    expect(d1).toBeCloseTo(d2, 5);
  });

  it("handles negative coordinates", () => {
    const dist = calculateDistance(-33.8688, 151.2093, -37.8136, 144.9631);
    expect(dist).toBeGreaterThan(700_000);
    expect(dist).toBeLessThan(800_000);
  });
});

describe("formatDistance", () => {
  it("formats meters below 1000 as 'm'", () => {
    expect(formatDistance(150)).toBe("150 m");
  });

  it("rounds meters to nearest integer", () => {
    expect(formatDistance(99.7)).toBe("100 m");
    expect(formatDistance(0.3)).toBe("0 m");
  });

  it("formats 999m as meters", () => {
    expect(formatDistance(999)).toBe("999 m");
  });

  it("formats 1000m as km", () => {
    expect(formatDistance(1000)).toBe("1.0 km");
  });

  it("formats larger distances in km with one decimal", () => {
    expect(formatDistance(1500)).toBe("1.5 km");
    expect(formatDistance(12345)).toBe("12.3 km");
  });
});

describe("getProximity", () => {
  it("returns 'here' for distances under 50m", () => {
    expect(getProximity(0)).toBe("here");
    expect(getProximity(25)).toBe("here");
    expect(getProximity(49)).toBe("here");
  });

  it("returns 'nearby' for 50-200m", () => {
    expect(getProximity(50)).toBe("nearby");
    expect(getProximity(100)).toBe("nearby");
    expect(getProximity(199)).toBe("nearby");
  });

  it("returns 'far' for 200m+", () => {
    expect(getProximity(200)).toBe("far");
    expect(getProximity(1000)).toBe("far");
  });
});
