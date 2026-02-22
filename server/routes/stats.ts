import { Router } from "express";
import { customUsers, spots, games } from "@shared/schema";
import { count } from "drizzle-orm";
import { getDb } from "../db";
import { statsBreaker } from "../utils/circuitBreaker";

const EMPTY_STATS = { totalUsers: 0, totalSpots: 0, totalBattles: 0 };

const router = Router();

// GET /api/stats — public stats for the landing page
router.get("/", async (_req, res) => {
  const result = await statsBreaker.execute(async () => {
    const database = getDb();
    const [usersResult, spotsResult, gamesResult] = await Promise.all([
      database.select({ count: count() }).from(customUsers),
      database.select({ count: count() }).from(spots),
      database.select({ count: count() }).from(games),
    ]);

    return {
      totalUsers: usersResult[0]?.count || 0,
      totalSpots: spotsResult[0]?.count || 0,
      totalBattles: gamesResult[0]?.count || 0,
    };
  }, EMPTY_STATS);

  res.json(result);
});

export const statsRouter = router;
