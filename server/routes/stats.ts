import { Router } from "express";
import { customUsers, spots, games } from "@shared/schema";
import { count } from "drizzle-orm";
import { getDb, isDatabaseAvailable } from "../db";

const router = Router();

// GET /api/stats — public stats for the landing page
router.get("/", async (_req, res) => {
  try {
    if (!isDatabaseAvailable()) {
      return res.json({ totalUsers: 0, totalSpots: 0, totalBattles: 0 });
    }
    const database = getDb();
    const [usersResult, spotsResult, gamesResult] = await Promise.all([
      database.select({ count: count() }).from(customUsers),
      database.select({ count: count() }).from(spots),
      database.select({ count: count() }).from(games),
    ]);

    res.json({
      totalUsers: usersResult[0]?.count || 0,
      totalSpots: spotsResult[0]?.count || 0,
      totalBattles: gamesResult[0]?.count || 0,
    });
  } catch {
    // Return null stats on error - frontend handles gracefully
    res.json({ totalUsers: 0, totalSpots: 0, totalBattles: 0 });
  }
});

export const statsRouter = router;
