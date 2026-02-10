import { CONFIG } from "./config";
import type { MockSpot } from "./types";

/**
 * Seeded pseudo-random number generator for deterministic tests
 * Same seed = same sequence every time
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number = 42) {
    this.seed = seed;
  }

  /** Generate next pseudo-random number between 0 and 1 */
  next(): number {
    // Linear congruential generator (Numerical Recipes)
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  /** Generate number in range [-0.5, 0.5] for coordinate offset */
  offset(): number {
    return this.next() - 0.5;
  }

  /** Reset to initial seed for reproducibility */
  reset(seed: number = 42): void {
    this.seed = seed;
  }
}

/**
 * Mock spot data factory - deterministic generation
 * Every test run produces identical data
 */
export class SpotFactory {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate array of mock spots with deterministic positions
   * @param count - Number of spots to generate
   * @returns Array of MockSpot objects
   */
  createSpots(count: number): MockSpot[] {
    this.rng.reset(); // Always start from same seed

    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      name: `Test Spot ${i}`,
      lat: CONFIG.CENTER.lat + this.rng.offset() * CONFIG.SPREAD,
      lng: CONFIG.CENTER.lng + this.rng.offset() * CONFIG.SPREAD,
      spotType: CONFIG.SPOT_TYPES[i % CONFIG.SPOT_TYPES.length],
      tier: CONFIG.TIERS[i % CONFIG.TIERS.length],
      description: `Premium skate spot #${i} - ${CONFIG.SPOT_TYPES[i % 3]} style`,
      photoUrl: null,
      createdAt: new Date(2025, 0, 1 + i).toISOString(),
      updatedAt: new Date(2025, 0, 1 + i).toISOString(),
    }));
  }

  /** Create a single spot with specific properties */
  createSpot(overrides: Partial<MockSpot> = {}): MockSpot {
    return {
      id: 1,
      name: "Custom Spot",
      lat: CONFIG.CENTER.lat,
      lng: CONFIG.CENTER.lng,
      spotType: "street",
      tier: "gold",
      description: "Custom test spot",
      photoUrl: null,
      ...overrides,
    };
  }
}

/** Singleton factory instance */
export const spotFactory = new SpotFactory();
