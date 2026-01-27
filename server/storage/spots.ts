import { eq, desc, and, sql, getTableColumns } from "drizzle-orm";
import { db } from "../db";
import { spots, customUsers, type Spot, type InsertSpot } from "@shared/schema";
import logger from "../logger";

export interface SpotFilters {
  city?: string;
  spotType?: string;
  tier?: string;
  createdBy?: string;
  verified?: boolean;
  limit?: number;
  offset?: number;
}

export type SpotWithCreator = Spot & {
  creatorName: string | null;
  creatorFirstName?: string | null;
  creatorLastName?: string | null;
};

// Type for joined query results
type SpotQueryRow = Spot & {
  creatorFirstName: string | null;
  creatorLastName: string | null;
};

export class SpotStorage {
  /**
   * Create a new spot
   */
  async createSpot(data: InsertSpot & { createdBy?: string | null }): Promise<Spot> {
    if (!db) {
      throw new Error("Database not available");
    }

    const [spot] = await db
      .insert(spots)
      .values({
        name: data.name,
        description: data.description ?? null,
        spotType: data.spotType ?? "street",
        tier: data.tier ?? "bronze",
        lat: data.lat,
        lng: data.lng,
        address: data.address ?? null,
        city: data.city ?? null,
        state: data.state ?? null,
        country: data.country ?? "USA",
        photoUrl: data.photoUrl,
        thumbnailUrl: null,
        createdBy: data.createdBy ?? null,
        verified: false,
        isActive: true,
        checkInCount: 0,
        rating: 0,
        ratingCount: 0,
      })
      .returning();

    logger.info("Spot created", { spotId: spot.id, name: spot.name });
    return spot;
  }

  /**
   * Get all spots with optional filters
   */
  async getAllSpots(filters: SpotFilters = {}): Promise<SpotWithCreator[]> {
    if (!db) {
      logger.warn("Database not available, returning empty spots");
      return [];
    }

    const conditions = [eq(spots.isActive, true)];

    if (filters.city) {
      conditions.push(eq(spots.city, filters.city));
    }
    if (filters.spotType) {
      conditions.push(eq(spots.spotType, filters.spotType));
    }
    if (filters.tier) {
      conditions.push(eq(spots.tier, filters.tier));
    }
    if (filters.createdBy) {
      conditions.push(eq(spots.createdBy, filters.createdBy));
    }
    if (filters.verified !== undefined) {
      conditions.push(eq(spots.verified, filters.verified));
    }

    const baseQuery = db
      .select({
        ...getTableColumns(spots),
        creatorFirstName: customUsers.firstName,
        creatorLastName: customUsers.lastName,
      })
      .from(spots)
      .leftJoin(customUsers, eq(spots.createdBy, customUsers.id))
      .where(and(...conditions))
      .orderBy(desc(spots.createdAt))
      .$dynamic();

    if (filters.limit) {
      baseQuery.limit(filters.limit);
    }
    if (filters.offset) {
      baseQuery.offset(filters.offset);
    }

    const results = await baseQuery;
    return results.map((row: SpotQueryRow) => ({
      ...row,
      creatorName: row.creatorFirstName
        ? `${row.creatorFirstName} ${row.creatorLastName || ""}`.trim()
        : "Anonymous",
    }));
  }

  /**
   * Get a single spot by ID
   */
  async getSpotById(id: number): Promise<SpotWithCreator | null> {
    if (!db) {
      return null;
    }

    const [spot] = await db
      .select({
        ...getTableColumns(spots),
        creatorFirstName: customUsers.firstName,
        creatorLastName: customUsers.lastName,
      })
      .from(spots)
      .leftJoin(customUsers, eq(spots.createdBy, customUsers.id))
      .where(and(eq(spots.id, id), eq(spots.isActive, true)))
      .limit(1);

    if (!spot) return null;
    return {
      ...spot,
      creatorName: spot.creatorFirstName
        ? `${spot.creatorFirstName} ${spot.creatorLastName || ""}`.trim()
        : "Anonymous",
    };
  }

  /**
   * Get spots near a location (basic distance filter)
   */
  async getSpotsNearLocation(
    lat: number,
    lng: number,
    radiusKm: number = 50,
    limit: number = 100
  ): Promise<SpotWithCreator[]> {
    if (!db) {
      return [];
    }

    // Approximate degree to km conversion (at equator)
    // 1 degree latitude ≈ 111 km
    // 1 degree longitude ≈ 111 * cos(lat) km
    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

    const results = await db
      .select({
        ...getTableColumns(spots),
        creatorFirstName: customUsers.firstName,
        creatorLastName: customUsers.lastName,
      })
      .from(spots)
      .leftJoin(customUsers, eq(spots.createdBy, customUsers.id))
      .where(
        and(
          eq(spots.isActive, true),
          sql`${spots.lat} BETWEEN ${lat - latDelta} AND ${lat + latDelta}`,
          sql`${spots.lng} BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}`
        )
      )
      .orderBy(desc(spots.createdAt))
      .limit(limit);

    return results.map((row: SpotQueryRow) => ({
      ...row,
      creatorName: row.creatorFirstName
        ? `${row.creatorFirstName} ${row.creatorLastName || ""}`.trim()
        : "Anonymous",
    }));
  }

  /**
   * Update a spot
   */
  async updateSpot(id: number, data: Partial<InsertSpot>): Promise<Spot | null> {
    if (!db) {
      throw new Error("Database not available");
    }

    const [updated] = await db
      .update(spots)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(spots.id, id))
      .returning();

    if (updated) {
      logger.info("Spot updated", { spotId: id });
    }
    return updated || null;
  }

  /**
   * Soft delete a spot (set isActive = false)
   */
  async deleteSpot(id: number): Promise<boolean> {
    if (!db) {
      throw new Error("Database not available");
    }

    const [deleted] = await db
      .update(spots)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(spots.id, id))
      .returning();

    if (deleted) {
      logger.info("Spot deleted (soft)", { spotId: id });
    }
    return !!deleted;
  }

  /**
   * Increment check-in count
   */
  async incrementCheckIn(id: number): Promise<void> {
    if (!db) {
      throw new Error("Database not available");
    }

    await db
      .update(spots)
      .set({
        checkInCount: sql`${spots.checkInCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(spots.id, id));

    logger.info("Spot check-in incremented", { spotId: id });
  }

  /**
   * Update spot rating
   */
  async updateRating(id: number, newRating: number): Promise<void> {
    if (!db) {
      throw new Error("Database not available");
    }

    const spot = await this.getSpotById(id);
    if (!spot) return;

    const newCount = spot.ratingCount + 1;
    const newAvg = ((spot.rating || 0) * spot.ratingCount + newRating) / newCount;

    await db
      .update(spots)
      .set({
        rating: newAvg,
        ratingCount: newCount,
        updatedAt: new Date(),
      })
      .where(eq(spots.id, id));

    logger.info("Spot rating updated", { spotId: id, newRating: newAvg, count: newCount });
  }

  /**
   * Verify a spot (admin action)
   */
  async verifySpot(id: number): Promise<Spot | null> {
    if (!db) {
      throw new Error("Database not available");
    }

    const [verified] = await db
      .update(spots)
      .set({ verified: true, updatedAt: new Date() })
      .where(eq(spots.id, id))
      .returning();

    if (verified) {
      logger.info("Spot verified", { spotId: id });
    }
    return verified || null;
  }

  /**
   * Get spots created by a user
   */
  async getSpotsByUser(userId: string): Promise<SpotWithCreator[]> {
    if (!db) {
      return [];
    }

    const results = await db
      .select({
        ...getTableColumns(spots),
        creatorFirstName: customUsers.firstName,
        creatorLastName: customUsers.lastName,
      })
      .from(spots)
      .leftJoin(customUsers, eq(spots.createdBy, customUsers.id))
      .where(and(eq(spots.createdBy, userId), eq(spots.isActive, true)))
      .orderBy(desc(spots.createdAt));

    return results.map((row: SpotQueryRow) => ({
      ...row,
      creatorName: row.creatorFirstName
        ? `${row.creatorFirstName} ${row.creatorLastName || ""}`.trim()
        : "Anonymous",
    }));
  }

  /**
   * Check for duplicate spots (same name AND within ~50 meters)
   * Used to prevent spam and duplicate entries
   */
  async checkDuplicate(name: string, lat: number, lng: number): Promise<boolean> {
    if (!db) {
      return false; // Allow creation if DB unavailable
    }

    // ~50 meters in degrees (rough approximation)
    const latDelta = 0.00045;
    const lngDelta = 0.00045;
    const normalizedName = name.trim().toLowerCase();

    const [existing] = await db
      .select({ id: spots.id })
      .from(spots)
      .where(
        and(
          eq(spots.isActive, true),
          sql`lower(trim(${spots.name})) = ${normalizedName}`,
          sql`${spots.lat} BETWEEN ${lat - latDelta} AND ${lat + latDelta}`,
          sql`${spots.lng} BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}`
        )
      )
      .limit(1);

    return !!existing;
  }

  /**
   * Get spot statistics
   */
  async getStats(): Promise<{ total: number; verified: number; cities: number }> {
    if (!db) {
      return { total: 0, verified: 0, cities: 0 };
    }

    const [stats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        verified: sql<number>`count(*) filter (where ${spots.verified} = true)::int`,
        cities: sql<number>`count(distinct ${spots.city})::int`,
      })
      .from(spots)
      .where(eq(spots.isActive, true));

    return stats || { total: 0, verified: 0, cities: 0 };
  }
}

export const spotStorage = new SpotStorage();
