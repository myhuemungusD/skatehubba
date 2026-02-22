import { Router } from "express";
import { customUsers } from "@shared/schema";
import { ilike, or, eq, and, sql } from "drizzle-orm";
import { getDb, isDatabaseAvailable } from "../db";
import { authenticateUser } from "../auth/middleware";

const router = Router();

// GET /api/users/search — search users by name
router.get("/search", authenticateUser, async (req, res) => {
  const queryParam = req.query.q;
  // Validate query parameter is a string (prevent array injection)
  if (typeof queryParam !== "string" || queryParam.length < 2) {
    return res.json([]);
  }
  const query = queryParam;

  if (!isDatabaseAvailable()) {
    return res.json([]);
  }

  try {
    const database = getDb();
    // Escape SQL LIKE wildcards to prevent wildcard injection
    const sanitized = query.replace(/[%_\\]/g, (c) => `\\${c}`);
    const searchTerm = `%${sanitized}%`;
    const results = await database
      .select({
        id: customUsers.id,
        firstName: customUsers.firstName,
        lastName: customUsers.lastName,
      })
      .from(customUsers)
      .where(or(ilike(customUsers.firstName, searchTerm), ilike(customUsers.lastName, searchTerm)))
      .limit(20);

    const mapped = results.map((u) => ({
      id: u.id,
      displayName:
        u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName || "Skater",
      handle: `user${u.id.substring(0, 4)}`,
      wins: 0,
      losses: 0,
    }));

    res.json(mapped);
  } catch (_error) {
    res.json([]);
  }
});

// GET /api/users — list users (excluding current user)
router.get("/", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.json([]);
  }

  try {
    const database = getDb();
    const currentUserId = req.currentUser?.id;
    const conditions = [eq(customUsers.isActive, true)];
    if (currentUserId) {
      conditions.push(sql`${customUsers.id} != ${currentUserId}`);
    }
    const results = await database
      .select({
        id: customUsers.id,
        displayName: customUsers.firstName,
        photoURL: sql<string | null>`null`,
      })
      .from(customUsers)
      .where(and(...conditions))
      .limit(100);

    res.json(results);
  } catch (_error) {
    res.json([]);
  }
});

export const usersRouter = router;
