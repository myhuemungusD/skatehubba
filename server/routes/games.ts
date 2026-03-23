/**
 * S.K.A.T.E. Game Routes — Multiplayer (2-5 players)
 *
 * Turn-based, asynchronous. No live play, no retries, no previews.
 * One take, auto-send, final.
 *
 * Core loop:
 *   1. Setter sets a trick (records video, auto-sends)
 *   2. Each responder watches, records response (one take, auto-sends)
 *   3. Setter judges each response: LAND or BAIL
 *   4. BAIL → responder gets a letter; LAND → no penalty
 *   5. After all responses judged, setter rotates
 *   6. First to spell S.K.A.T.E. is eliminated; last one standing wins
 */

import { Router } from "express";
import { getDb } from "../db";
import { games, gameTurns, userProfiles, type GamePlayer } from "@shared/schema";
import { eq, sql, desc } from "drizzle-orm";
import logger from "../logger";
import { Errors } from "../utils/apiError";
import { createGameSchema, joinGameSchema, TURN_DEADLINE_MS } from "./games-shared";
import { gamesTurnsRouter } from "./games-turns";

const router = Router();

// Mount turn sub-routes
router.use("/", gamesTurnsRouter);

// ============================================================================
// POST /api/games/create — Create a new multiplayer game
// ============================================================================

router.post("/create", async (req, res) => {
  const parsed = createGameSchema.safeParse(req.body);
  if (!parsed.success) return Errors.validation(res, parsed.error.flatten());

  const currentUserId = req.currentUser!.id;
  const { opponentIds } = parsed.data;

  if (opponentIds.includes(currentUserId)) {
    return Errors.badRequest(res, "INVALID_OPPONENT", "You cannot challenge yourself.");
  }

  const uniqueOpponents = [...new Set(opponentIds)];

  try {
    const db = getDb();

    // Look up creator profile
    const [creatorProfile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.id, currentUserId))
      .limit(1);

    const creatorName = creatorProfile?.displayName || creatorProfile?.handle || "Skater";

    // Build initial players array — creator + pending opponents
    const players: GamePlayer[] = [
      { id: currentUserId, name: creatorName, letters: "", isEliminated: false },
    ];

    // Look up opponent profiles
    for (const oppId of uniqueOpponents) {
      const [oppProfile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.id, oppId))
        .limit(1);

      const oppName = oppProfile?.displayName || oppProfile?.handle || "Skater";
      players.push({ id: oppId, name: oppName, letters: "", isEliminated: false });
    }

    const maxPlayers = players.length;

    const [game] = await db
      .insert(games)
      .values({
        creatorId: currentUserId,
        players,
        maxPlayers,
        status: "pending",
        setterId: currentUserId,
        currentTurn: null,
        turnPhase: "set_trick",
      })
      .returning();

    logger.info("[Games] Game created", { gameId: game.id, creatorId: currentUserId, playerCount: maxPlayers });
    res.status(201).json({ game, message: `Game created. Waiting for ${uniqueOpponents.length} player(s) to accept.` });
  } catch (error) {
    logger.error("[Games] Failed to create game", { error, userId: currentUserId });
    return Errors.internal(res, "CREATE_FAILED", "Failed to create game.");
  }
});

// ============================================================================
// POST /api/games/:id/join — Accept or decline a game invite
// ============================================================================

router.post("/:id/join", async (req, res) => {
  const parsed = joinGameSchema.safeParse(req.body);
  if (!parsed.success) return Errors.validation(res, parsed.error.flatten());

  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;
  const { accept } = parsed.data;

  try {
    const db = getDb();

    const txResult = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`);
      const [game] = await tx.select().from(games).where(eq(games.id, gameId)).limit(1);

      if (!game) return { ok: false as const, status: 404, error: "Game not found" };
      if (game.status !== "pending") return { ok: false as const, status: 400, error: "Game is no longer pending" };

      const playerEntry = game.players.find((p: GamePlayer) => p.id === currentUserId);
      if (!playerEntry) return { ok: false as const, status: 403, error: "You are not invited to this game" };

      if (!accept) {
        const [updated] = await tx
          .update(games)
          .set({ status: "declined", updatedAt: new Date() })
          .where(eq(games.id, gameId))
          .returning();
        return { ok: true as const, game: updated, started: false };
      }

      // For now: game starts when created (all players added at creation).
      // Future: track individual acceptances for async lobby.
      const now = new Date();
      const deadline = new Date(now.getTime() + TURN_DEADLINE_MS);

      const [updated] = await tx
        .update(games)
        .set({
          status: "active",
          currentTurn: game.setterId,
          deadlineAt: deadline,
          updatedAt: now,
        })
        .where(eq(games.id, gameId))
        .returning();

      return { ok: true as const, game: updated, started: true };
    });

    if (!txResult.ok) return res.status(txResult.status).json({ error: txResult.error });

    const msg = txResult.started ? "Game on! Setter's turn." : "Game declined.";
    res.json({ game: txResult.game, message: msg });
  } catch (error) {
    logger.error("[Games] Failed to join game", { error, gameId, userId: currentUserId });
    return Errors.internal(res, "JOIN_FAILED", "Failed to join game.");
  }
});

// ============================================================================
// POST /api/games/:id/forfeit — Forfeit a game
// ============================================================================

router.post("/:id/forfeit", async (req, res) => {
  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;

  try {
    const db = getDb();

    const txResult = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`);
      const [game] = await tx.select().from(games).where(eq(games.id, gameId)).limit(1);

      if (!game) return { ok: false as const, status: 404, error: "Game not found" };
      if (game.status !== "active") return { ok: false as const, status: 400, error: "Game is not active" };

      const playerEntry = game.players.find((p: GamePlayer) => p.id === currentUserId);
      if (!playerEntry) return { ok: false as const, status: 403, error: "You are not in this game" };

      // Eliminate the forfeiting player
      const updatedPlayers = game.players.map((p: GamePlayer) =>
        p.id === currentUserId ? { ...p, letters: "SKATE", isEliminated: true } : p
      );

      const active = updatedPlayers.filter((p: GamePlayer) => !p.isEliminated);
      const now = new Date();

      if (active.length <= 1) {
        const [updated] = await tx
          .update(games)
          .set({
            players: updatedPlayers,
            status: "forfeited",
            winnerId: active[0]?.id ?? null,
            completedAt: now,
            updatedAt: now,
            turnPhase: null,
            currentTurn: null,
            deadlineAt: null,
          })
          .where(eq(games.id, gameId))
          .returning();
        return { ok: true as const, game: updated };
      }

      // Game continues without the forfeiter
      const [updated] = await tx
        .update(games)
        .set({ players: updatedPlayers, updatedAt: now })
        .where(eq(games.id, gameId))
        .returning();
      return { ok: true as const, game: updated };
    });

    if (!txResult.ok) return res.status(txResult.status).json({ error: txResult.error });

    res.json({ game: txResult.game, message: "You forfeited." });
  } catch (error) {
    logger.error("[Games] Failed to forfeit", { error, gameId, userId: currentUserId });
    return Errors.internal(res, "FORFEIT_FAILED", "Failed to forfeit game.");
  }
});

// ============================================================================
// GET /api/games/my-games — List all games for current user
// ============================================================================

router.get("/my-games", async (req, res) => {
  const currentUserId = req.currentUser!.id;

  try {
    const db = getDb();

    // Use raw SQL to filter on JSON array
    const myGames = await db
      .select()
      .from(games)
      .where(
        sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${games.players}) AS p WHERE p->>'id' = ${currentUserId})`
      )
      .orderBy(desc(games.updatedAt));

    res.json({ games: myGames });
  } catch (error) {
    logger.error("[Games] Failed to fetch games", { error, userId: currentUserId });
    return Errors.internal(res, "FETCH_FAILED", "Failed to fetch games.");
  }
});

// ============================================================================
// GET /api/games/leaderboard — Top players by wins
// ============================================================================

router.get("/leaderboard", async (_req, res) => {
  try {
    const db = getDb();
    const leaders = await db
      .select({
        id: userProfiles.id,
        handle: userProfiles.handle,
        displayName: userProfiles.displayName,
        photoURL: userProfiles.photoURL,
        wins: userProfiles.wins,
        losses: userProfiles.losses,
      })
      .from(userProfiles)
      .orderBy(desc(userProfiles.wins))
      .limit(50);

    res.json({ leaderboard: leaders });
  } catch (error) {
    logger.error("[Games] Failed to fetch leaderboard", { error });
    return Errors.internal(res, "LEADERBOARD_FAILED", "Failed to fetch leaderboard.");
  }
});

// ============================================================================
// GET /api/games/:id — Game details with turns
// ============================================================================

router.get("/:id", async (req, res) => {
  const gameId = req.params.id;

  try {
    const db = getDb();
    const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);

    if (!game) return Errors.notFound(res, "GAME_NOT_FOUND", "Game not found.");

    const turns = await db
      .select()
      .from(gameTurns)
      .where(eq(gameTurns.gameId, gameId))
      .orderBy(gameTurns.turnNumber);

    res.json({ game, turns });
  } catch (error) {
    logger.error("[Games] Failed to fetch game details", { error, gameId });
    return Errors.internal(res, "FETCH_FAILED", "Failed to fetch game.");
  }
});

export { router as gamesRouter };
