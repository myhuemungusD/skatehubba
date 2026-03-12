/**
 * S.K.A.T.E. Game Management Routes
 * Handles game forfeit and game queries
 */

import { Router } from "express";
import { getDb } from "../db";
import {
  games,
  gameTurns,
  gameDisputes,
  usernames,
  userProfiles,
  onboardingProfiles,
  customUsers,
} from "@shared/schema";
import { eq, or, desc, and, sql, inArray, isNotNull } from "drizzle-orm";
import logger from "../logger";
import { sendGameNotificationToUser } from "../services/gameNotificationService";
import { Errors } from "../utils/apiError";

const router = Router();

// ============================================================================
// POST /api/games/:id/forfeit — Voluntary forfeit
// ============================================================================

router.post("/:id/forfeit", async (req, res) => {
  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;

  try {
    const db = getDb();

    const txResult = await db.transaction(async (tx) => {
      // Lock game row to prevent concurrent forfeit/turn/cron race
      await tx.execute(sql`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`);

      const [game] = await tx.select().from(games).where(eq(games.id, gameId)).limit(1);

      if (!game) return { ok: false as const, status: 404, msg: "Game not found" };

      const isPlayer1 = game.player1Id === currentUserId;
      const isPlayer2 = game.player2Id === currentUserId;
      if (!isPlayer1 && !isPlayer2) {
        logger.warn("[Games] Unauthorized forfeit attempt", {
          gameId,
          userId: currentUserId,
          ip: req.ip,
          action: "forfeit",
        });
        return { ok: false as const, status: 403, msg: "You are not a player in this game" };
      }
      if (game.status !== "active") {
        return { ok: false as const, status: 400, msg: "Game is not active" };
      }

      const now = new Date();
      const winnerId = isPlayer1 ? game.player2Id : game.player1Id;
      const forfeitedByName = isPlayer1 ? game.player1Name : game.player2Name;

      const [updatedGame] = await tx
        .update(games)
        .set({
          status: "forfeited",
          winnerId,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(games.id, gameId))
        .returning();

      return { ok: true as const, game: updatedGame, winnerId, forfeitedByName };
    });

    if (!txResult.ok) {
      return res.status(txResult.status).json({ error: txResult.msg });
    }

    // Notify opponent (push + email + in-app) — outside transaction
    if (txResult.winnerId) {
      await sendGameNotificationToUser(txResult.winnerId, "opponent_forfeited", {
        gameId,
        opponentName: txResult.forfeitedByName || undefined,
      });
    }

    logger.info("[Games] Game forfeited", {
      gameId,
      forfeitedBy: currentUserId,
      winnerId: txResult.winnerId,
    });

    res.json({ game: txResult.game, message: "You forfeited." });
  } catch (error) {
    logger.error("[Games] Failed to forfeit game", {
      error,
      gameId,
      userId: currentUserId,
    });
    return Errors.internal(res, "FORFEIT_FAILED", "Failed to forfeit game.");
  }
});

// ============================================================================
// GET /api/games/my-games — List my games
// ============================================================================

router.get("/my-games", async (req, res) => {
  const currentUserId = req.currentUser!.id;

  try {
    const db = getDb();

    const userGames = await db
      .select()
      .from(games)
      .where(or(eq(games.player1Id, currentUserId), eq(games.player2Id, currentUserId)))
      .orderBy(desc(games.updatedAt))
      .limit(50);

    // Collect all unique player IDs to batch-fetch handles
    const playerIds = new Set<string>();
    for (const g of userGames) {
      if (g.player1Id) playerIds.add(g.player1Id);
      if (g.player2Id) playerIds.add(g.player2Id);
    }

    const handleMap = new Map<string, string>();
    if (playerIds.size > 0) {
      const handles = await db
        .select({ uid: usernames.uid, username: usernames.username })
        .from(usernames)
        .where(inArray(usernames.uid, [...playerIds]));
      for (const h of handles) {
        handleMap.set(h.uid, h.username);
      }
    }

    const enriched = userGames.map((g) => ({
      ...g,
      player1Handle: g.player1Id ? (handleMap.get(g.player1Id) ?? null) : null,
      player2Handle: g.player2Id ? (handleMap.get(g.player2Id) ?? null) : null,
    }));

    const pendingChallenges = enriched.filter(
      (g) => g.status === "pending" && g.player2Id === currentUserId
    );
    const sentChallenges = enriched.filter(
      (g) => g.status === "pending" && g.player1Id === currentUserId
    );
    const activeGames = enriched.filter((g) => g.status === "active");
    const completedGames = enriched.filter(
      (g) => g.status === "completed" || g.status === "declined" || g.status === "forfeited"
    );

    res.json({
      pendingChallenges,
      sentChallenges,
      activeGames,
      completedGames,
      total: userGames.length,
    });
  } catch (error) {
    logger.error("[Games] Failed to fetch my games", {
      error,
      userId: currentUserId,
    });
    return Errors.internal(res, "GAMES_FETCH_FAILED", "Failed to fetch games.");
  }
});

// ============================================================================
// GET /api/games/leaderboard — Global rankings from real game data
// NOTE: Must be defined BEFORE /:id to avoid route shadowing
// ============================================================================

router.get("/leaderboard", async (_req, res) => {
  try {
    const db = getDb();

    // 1. Get ALL registered users with a Firebase UID (top 20)
    const allUsers = await db
      .select({
        id: customUsers.id,
        firebaseUid: customUsers.firebaseUid,
        firstName: customUsers.firstName,
        lastName: customUsers.lastName,
      })
      .from(customUsers)
      .where(isNotNull(customUsers.firebaseUid))
      .limit(20);

    if (allUsers.length === 0) {
      res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      return res.json({ entries: [] });
    }

    // 2. Aggregate wins/losses from completed/forfeited games
    const playerStats = await db
      .select({
        playerId: sql<string>`player_id`,
        wins: sql<number>`count(*) filter (where won)::int`,
        losses: sql<number>`count(*) filter (where not won)::int`,
      })
      .from(
        sql`(
          select player1_id as player_id, (winner_id = player1_id) as won
          from games
          where status in ('completed', 'forfeited') and player1_id is not null
          union all
          select player2_id as player_id, (winner_id = player2_id) as won
          from games
          where status in ('completed', 'forfeited') and player2_id is not null
        ) as player_games`
      )
      .groupBy(sql`player_id`);

    const statsById = new Map(playerStats.map((p) => [p.playerId, p]));

    // 3. Fetch usernames and display names for all users
    const fbUids = allUsers.filter((u) => u.firebaseUid).map((u) => u.firebaseUid!);

    const [handleRows, profileRows, onboardingRows] = await Promise.all([
      fbUids.length > 0
        ? db
            .select({ uid: usernames.uid, username: usernames.username })
            .from(usernames)
            .where(inArray(usernames.uid, fbUids))
        : Promise.resolve([]),
      fbUids.length > 0
        ? db
            .select({ id: userProfiles.id, displayName: userProfiles.displayName })
            .from(userProfiles)
            .where(inArray(userProfiles.id, fbUids))
        : Promise.resolve([]),
      fbUids.length > 0
        ? db
            .select({ uid: onboardingProfiles.uid, username: onboardingProfiles.username })
            .from(onboardingProfiles)
            .where(inArray(onboardingProfiles.uid, fbUids))
        : Promise.resolve([]),
    ]);

    const handleByFbUid = new Map(handleRows.map((h) => [h.uid, h.username]));
    // Merge onboarding usernames as fallback (normal auth flow stores here)
    for (const row of onboardingRows) {
      if (!handleByFbUid.has(row.uid)) {
        handleByFbUid.set(row.uid, row.username);
      }
    }
    const displayNameByFbUid = new Map(profileRows.map((p) => [p.id, p.displayName]));

    // 4. Build leaderboard entries for ALL users, merging game stats
    const unsorted = allUsers.map((u) => {
      const stats = statsById.get(u.id);
      const wins = stats?.wins ?? 0;
      const losses = stats?.losses ?? 0;
      const handle = u.firebaseUid ? handleByFbUid.get(u.firebaseUid) : undefined;
      const profileDisplayName = u.firebaseUid ? displayNameByFbUid.get(u.firebaseUid) : undefined;
      const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim();

      return {
        id: u.id,
        firebaseUid: u.firebaseUid ?? undefined,
        displayName: profileDisplayName || fullName || handle || "Skater",
        username: handle ?? undefined,
        wins,
        losses,
      };
    });

    // 5. Sort: wins desc → win rate desc → total games desc → name asc
    unsorted.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      const aTotal = a.wins + a.losses;
      const bTotal = b.wins + b.losses;
      const aRate = aTotal > 0 ? a.wins / aTotal : 0;
      const bRate = bTotal > 0 ? b.wins / bTotal : 0;
      if (bRate !== aRate) return bRate - aRate;
      if (bTotal !== aTotal) return bTotal - aTotal;
      return a.displayName.localeCompare(b.displayName);
    });

    const entries = unsorted.map((e, idx) => ({ ...e, rank: idx + 1 }));

    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    res.json({ entries });
  } catch (error) {
    logger.error("[Games] Failed to fetch leaderboard", { error });
    return Errors.internal(res, "LEADERBOARD_FETCH_FAILED", "Failed to fetch leaderboard.");
  }
});

// ============================================================================
// GET /api/games/stats/me — Player's game stats (wins, losses, streak, record)
// NOTE: Must be defined BEFORE /:id to avoid route shadowing
// ============================================================================

router.get("/stats/me", async (req, res) => {
  const currentUserId = req.currentUser!.id;

  try {
    const db = getDb();

    const finishedGames = await db
      .select({
        id: games.id,
        winnerId: games.winnerId,
        player1Id: games.player1Id,
        player2Id: games.player2Id,
        player1Name: games.player1Name,
        player2Name: games.player2Name,
        completedAt: games.completedAt,
      })
      .from(games)
      .where(
        and(
          or(eq(games.player1Id, currentUserId), eq(games.player2Id, currentUserId)),
          or(eq(games.status, "completed"), eq(games.status, "forfeited"))
        )
      )
      .orderBy(desc(games.completedAt))
      .limit(100);

    const wins = finishedGames.filter((g) => g.winnerId === currentUserId).length;
    const losses = finishedGames.length - wins;

    let currentStreak = 0;
    for (const g of finishedGames) {
      if (g.winnerId === currentUserId) {
        currentStreak++;
      } else {
        break;
      }
    }

    let bestStreak = 0;
    let tempStreak = 0;
    for (const g of finishedGames) {
      if (g.winnerId === currentUserId) {
        tempStreak++;
        bestStreak = Math.max(bestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    const opponentRecords: Record<
      string,
      { name: string; wins: number; losses: number; streak: number }
    > = {};
    for (const g of finishedGames) {
      const opponentId = g.player1Id === currentUserId ? g.player2Id : g.player1Id;
      const opponentName = g.player1Id === currentUserId ? g.player2Name : g.player1Name;
      if (!opponentId) continue;
      if (!opponentRecords[opponentId]) {
        opponentRecords[opponentId] = {
          name: opponentName || "Skater",
          wins: 0,
          losses: 0,
          streak: 0,
        };
      }
      if (g.winnerId === currentUserId) {
        opponentRecords[opponentId].wins++;
      } else {
        opponentRecords[opponentId].losses++;
      }
    }

    for (const opponentId of Object.keys(opponentRecords)) {
      const opponentGames = finishedGames.filter(
        (g) =>
          (g.player1Id === opponentId || g.player2Id === opponentId) &&
          (g.player1Id === currentUserId || g.player2Id === currentUserId)
      );
      let streak = 0;
      for (const g of opponentGames) {
        if (g.winnerId === currentUserId) {
          streak++;
        } else {
          break;
        }
      }
      opponentRecords[opponentId].streak = streak;
    }

    const trickStats = await db
      .select({
        trick: gameTurns.trickDescription,
        count: sql<number>`count(*)::int`,
      })
      .from(gameTurns)
      .where(and(eq(gameTurns.playerId, currentUserId), eq(gameTurns.turnType, "set")))
      .groupBy(gameTurns.trickDescription)
      .orderBy(sql`count(*) DESC`)
      .limit(5);

    // Batch-fetch opponent handles
    const opponentIds = Object.keys(opponentRecords);
    const opponentHandleMap = new Map<string, string>();
    if (opponentIds.length > 0) {
      const handles = await db
        .select({ uid: usernames.uid, username: usernames.username })
        .from(usernames)
        .where(inArray(usernames.uid, opponentIds));
      for (const h of handles) {
        opponentHandleMap.set(h.uid, h.username);
      }
    }

    res.json({
      totalGames: finishedGames.length,
      wins,
      losses,
      winRate: finishedGames.length > 0 ? Math.round((wins / finishedGames.length) * 100) : 0,
      currentStreak,
      bestStreak,
      opponentRecords: Object.entries(opponentRecords).map(([id, record]) => ({
        opponentId: id,
        ...record,
        handle: opponentHandleMap.get(id) ?? null,
      })),
      topTricks: trickStats.map((t) => ({ trick: t.trick, count: t.count })),
      recentGames: finishedGames.slice(0, 10).map((g) => ({
        id: g.id,
        won: g.winnerId === currentUserId,
        opponentName: g.player1Id === currentUserId ? g.player2Name : g.player1Name,
        completedAt: g.completedAt,
      })),
    });
  } catch (error) {
    logger.error("[Games] Failed to fetch stats", {
      error,
      userId: currentUserId,
    });
    return Errors.internal(res, "STATS_FETCH_FAILED", "Failed to fetch stats.");
  }
});

// ============================================================================
// GET /api/games/:id — Game details with turns and disputes
// ============================================================================

router.get("/:id", async (req, res) => {
  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;

  try {
    const db = getDb();

    const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);

    if (!game) return Errors.notFound(res, "GAME_NOT_FOUND", "Game not found.");

    if (game.player1Id !== currentUserId && game.player2Id !== currentUserId) {
      logger.warn("[Games] Unauthorized game access attempt", {
        gameId,
        userId: currentUserId,
        ip: req.ip,
        action: "view_game",
      });
      return Errors.forbidden(res, "NOT_PARTICIPANT", "You are not a player in this game.");
    }

    const turns = await db
      .select()
      .from(gameTurns)
      .where(eq(gameTurns.gameId, gameId))
      .orderBy(gameTurns.turnNumber)
      .limit(50);

    const disputes = await db
      .select()
      .from(gameDisputes)
      .where(eq(gameDisputes.gameId, gameId))
      .orderBy(gameDisputes.createdAt)
      .limit(50);

    const isMyTurn = game.currentTurn === currentUserId;
    const pendingSetTurn = turns.find(
      (t) => t.result === "pending" && t.turnType === "set" && t.playerId !== currentUserId
    );
    const needsToJudge = game.turnPhase === "judge" && game.currentTurn === currentUserId;
    const needsToRespond = game.turnPhase === "respond_trick" && game.currentTurn === currentUserId;

    const isPlayer1 = game.player1Id === currentUserId;
    const canDispute = isPlayer1 ? !game.player1DisputeUsed : !game.player2DisputeUsed;

    // Fetch handles for both players (at least one ID always exists per participant check)
    const playerIds = [game.player1Id, game.player2Id].filter(Boolean) as string[];
    const handleRows = await db
      .select({ uid: usernames.uid, username: usernames.username })
      .from(usernames)
      .where(inArray(usernames.uid, playerIds));
    const hMap = new Map(handleRows.map((h) => [h.uid, h.username]));

    res.json({
      game: {
        ...game,
        player1Handle: game.player1Id ? (hMap.get(game.player1Id) ?? null) : null,
        player2Handle: game.player2Id ? (hMap.get(game.player2Id) ?? null) : null,
      },
      turns,
      disputes,
      isMyTurn,
      needsToJudge,
      needsToRespond,
      pendingTurnId: needsToJudge && pendingSetTurn ? pendingSetTurn.id : null,
      canDispute,
    });
  } catch (error) {
    logger.error("[Games] Failed to fetch game details", {
      error,
      gameId,
      userId: currentUserId,
    });
    return Errors.internal(res, "GAME_FETCH_FAILED", "Failed to fetch game.");
  }
});

export { router as gamesManagementRouter };
