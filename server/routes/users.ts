import { Router } from "express";
import { customUsers } from "@shared/schema";
import { ilike, or, eq, and, sql } from "drizzle-orm";
import { getDb } from "../db";
import { authenticateUser } from "../auth/middleware";
import { userDiscoveryBreaker } from "../utils/circuitBreaker";

const router = Router();

// GET /api/users/search — search users by name
router.get("/search", authenticateUser, async (req, res) => {
  const queryParam = req.query.q;
  // Validate query parameter is a string (prevent array injection)
  if (typeof queryParam !== "string" || queryParam.length < 2) {
    return res.json([]);
  }
  const query = queryParam;

  const result = await userDiscoveryBreaker.execute(
    async () => {
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
        .where(
          or(ilike(customUsers.firstName, searchTerm), ilike(customUsers.lastName, searchTerm))
        )
        .limit(20);

      return results.map((u) => ({
        id: u.id,
        displayName:
          u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName || "Skater",
        handle: `user${u.id.substring(0, 4)}`,
        wins: 0,
        losses: 0,
      }));
    },
    [] as Array<{ id: string; displayName: string; handle: string; wins: number; losses: number }>
  );

  res.json(result);
});

// GET /api/users — list users (excluding current user)
router.get("/", authenticateUser, async (req, res) => {
  const currentUserId = req.currentUser?.id;

  const result = await userDiscoveryBreaker.execute(
    async () => {
      const database = getDb();
      const conditions = [eq(customUsers.isActive, true)];
      if (currentUserId) {
        conditions.push(sql`${customUsers.id} != ${currentUserId}`);
      }
      return database
        .select({
          id: customUsers.id,
          displayName: customUsers.firstName,
          photoURL: sql<string | null>`null`,
        })
        .from(customUsers)
        .where(and(...conditions))
        .limit(100);
    },
    [] as Array<{ id: string; displayName: string | null; photoURL: string | null }>
  );

  res.json(result);
});

export const usersRouter = router;
