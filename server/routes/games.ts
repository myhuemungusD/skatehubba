import { Router } from "express";
import { z } from "zod";
import { getDb, isDatabaseAvailable } from "../db";
import { authenticateUser } from "../auth/middleware";
import { games, gameTurns, customUsers, usernames } from "@shared/schema";
import { eq, or, desc, and, lt, sql } from "drizzle-orm";
import logger from "../logger";

const router = Router();

// 24 hours in milliseconds
const TURN_DEADLINE_MS = 24 * 60 * 60 * 1000;
const SKATE_LETTERS = "SKATE";

// Validation schemas
const createGameSchema = z.object({
  opponentId: z.string().min(1, "Opponent ID is required"),
});

const respondGameSchema = z.object({
  accept: z.boolean(),
});

const submitTurnSchema = z.object({
  trickDescription: z.string().min(1, "Trick description is required").max(500),
  videoUrl: z.string().url("Valid video URL required").max(500),
});

const judgeTurnSchema = z.object({
  result: z.enum(["landed", "missed"]),
});

// Helper to get user display name
async function getUserDisplayName(db: ReturnType<typeof getDb>, odv: string): Promise<string> {
  // First try to get username from usernames table
  const usernameResult = await db
    .select({ username: usernames.username })
    .from(usernames)
    .where(eq(usernames.uid, odv))
    .limit(1);

  if (usernameResult[0]?.username) {
    return usernameResult[0].username;
  }

  // Fallback to customUsers firstName
  const userResult = await db
    .select({ firstName: customUsers.firstName })
    .from(customUsers)
    .where(eq(customUsers.id, odv))
    .limit(1);

  return userResult[0]?.firstName || "Skater";
}

// Helper to check if game is over (someone has SKATE)
function isGameOver(player1Letters: string, player2Letters: string): { over: boolean; loserId: string | null } {
  if (player1Letters.length >= 5) {
    return { over: true, loserId: "player1" };
  }
  if (player2Letters.length >= 5) {
    return { over: true, loserId: "player2" };
  }
  return { over: false, loserId: null };
}

// POST /api/games/create - Create a new challenge
router.post("/create", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = createGameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const currentUserId = req.currentUser!.id;
  const { opponentId } = parsed.data;

  if (currentUserId === opponentId) {
    return res.status(400).json({ error: "Cannot challenge yourself" });
  }

  try {
    const db = getDb();

    // Verify opponent exists
    const opponent = await db
      .select({ id: customUsers.id })
      .from(customUsers)
      .where(eq(customUsers.id, opponentId))
      .limit(1);

    if (opponent.length === 0) {
      return res.status(404).json({ error: "Opponent not found" });
    }

    // Get display names
    const [player1Name, player2Name] = await Promise.all([
      getUserDisplayName(db, currentUserId),
      getUserDisplayName(db, opponentId),
    ]);

    // Create the game in pending status
    const [newGame] = await db
      .insert(games)
      .values({
        player1Id: currentUserId,
        player1Name,
        player2Id: opponentId,
        player2Name,
        status: "pending",
        currentTurn: currentUserId, // Challenger sets first trick if accepted
      })
      .returning();

    logger.info("[Games] Challenge created", {
      gameId: newGame.id,
      player1Id: currentUserId,
      player2Id: opponentId,
    });

    res.status(201).json({
      game: newGame,
      message: "Challenge sent! Waiting for opponent to accept.",
    });
  } catch (error) {
    logger.error("[Games] Failed to create game", { error, userId: currentUserId });
    res.status(500).json({ error: "Failed to create game" });
  }
});

// POST /api/games/:id/respond - Accept or decline challenge
router.post("/:id/respond", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = respondGameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;
  const { accept } = parsed.data;

  try {
    const db = getDb();

    // Get the game
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    // Only player2 (challenged player) can respond
    if (game.player2Id !== currentUserId) {
      return res.status(403).json({ error: "Only the challenged player can respond" });
    }

    // Can only respond to pending games
    if (game.status !== "pending") {
      return res.status(400).json({ error: "Game is not pending" });
    }

    const now = new Date();
    const deadline = new Date(now.getTime() + TURN_DEADLINE_MS);

    if (accept) {
      // Accept challenge - game becomes active
      const [updatedGame] = await db
        .update(games)
        .set({
          status: "active",
          deadlineAt: deadline,
          updatedAt: now,
        })
        .where(eq(games.id, gameId))
        .returning();

      logger.info("[Games] Challenge accepted", { gameId, acceptedBy: currentUserId });

      res.json({
        game: updatedGame,
        message: "Challenge accepted! Game is now active.",
      });
    } else {
      // Decline challenge
      const [updatedGame] = await db
        .update(games)
        .set({
          status: "declined",
          updatedAt: now,
          completedAt: now,
        })
        .where(eq(games.id, gameId))
        .returning();

      logger.info("[Games] Challenge declined", { gameId, declinedBy: currentUserId });

      res.json({
        game: updatedGame,
        message: "Challenge declined.",
      });
    }
  } catch (error) {
    logger.error("[Games] Failed to respond to game", { error, gameId, userId: currentUserId });
    res.status(500).json({ error: "Failed to respond to game" });
  }
});

// POST /api/games/:id/turns - Submit a video turn
router.post("/:id/turns", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = submitTurnSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;
  const { trickDescription, videoUrl } = parsed.data;

  try {
    const db = getDb();

    // Get the game
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    // Verify user is a player in this game
    const isPlayer1 = game.player1Id === currentUserId;
    const isPlayer2 = game.player2Id === currentUserId;
    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ error: "You are not a player in this game" });
    }

    // Game must be active
    if (game.status !== "active") {
      return res.status(400).json({ error: "Game is not active" });
    }

    // Must be this player's turn
    if (game.currentTurn !== currentUserId) {
      return res.status(400).json({ error: "Not your turn" });
    }

    // Get current turn count
    const turnCountResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(gameTurns)
      .where(eq(gameTurns.gameId, gameId));

    const turnNumber = (turnCountResult[0]?.count || 0) + 1;
    const playerName = isPlayer1 ? game.player1Name : game.player2Name;

    // Create the turn
    const [newTurn] = await db
      .insert(gameTurns)
      .values({
        gameId,
        playerId: currentUserId,
        playerName: playerName || "Skater",
        turnNumber,
        trickDescription,
        videoUrl,
        result: "pending", // Waiting for opponent to judge
      })
      .returning();

    // Switch turn to opponent for judging
    const opponentId = isPlayer1 ? game.player2Id : game.player1Id;
    const now = new Date();
    const deadline = new Date(now.getTime() + TURN_DEADLINE_MS);

    await db
      .update(games)
      .set({
        currentTurn: opponentId,
        lastTrickDescription: trickDescription,
        lastTrickBy: currentUserId,
        deadlineAt: deadline,
        updatedAt: now,
      })
      .where(eq(games.id, gameId));

    logger.info("[Games] Turn submitted", {
      gameId,
      turnId: newTurn.id,
      playerId: currentUserId,
      turnNumber,
    });

    res.status(201).json({
      turn: newTurn,
      message: "Turn submitted! Waiting for opponent to judge.",
    });
  } catch (error) {
    logger.error("[Games] Failed to submit turn", { error, gameId, userId: currentUserId });
    res.status(500).json({ error: "Failed to submit turn" });
  }
});

// POST /api/games/turns/:turnId/judge - Judge opponent's trick
router.post("/turns/:turnId/judge", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = judgeTurnSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const currentUserId = req.currentUser!.id;
  const turnId = parseInt(req.params.turnId, 10);
  const { result } = parsed.data;

  if (isNaN(turnId)) {
    return res.status(400).json({ error: "Invalid turn ID" });
  }

  try {
    const db = getDb();

    // Get the turn
    const [turn] = await db
      .select()
      .from(gameTurns)
      .where(eq(gameTurns.id, turnId))
      .limit(1);

    if (!turn) {
      return res.status(404).json({ error: "Turn not found" });
    }

    // Get the game
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, turn.gameId))
      .limit(1);

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    // Verify user is a player in this game
    const isPlayer1 = game.player1Id === currentUserId;
    const isPlayer2 = game.player2Id === currentUserId;
    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ error: "You are not a player in this game" });
    }

    // Cannot judge your own turn
    if (turn.playerId === currentUserId) {
      return res.status(403).json({ error: "Cannot judge your own turn" });
    }

    // Turn must be pending
    if (turn.result !== "pending") {
      return res.status(400).json({ error: "Turn has already been judged" });
    }

    // Must be your turn (to judge)
    if (game.currentTurn !== currentUserId) {
      return res.status(400).json({ error: "Not your turn to judge" });
    }

    const now = new Date();

    // Update the turn with judgment
    await db
      .update(gameTurns)
      .set({
        result,
        judgedBy: currentUserId,
        judgedAt: now,
      })
      .where(eq(gameTurns.id, turnId));

    // Determine next state
    const isOpponentPlayer1 = turn.playerId === game.player1Id;
    let newPlayer1Letters = game.player1Letters || "";
    let newPlayer2Letters = game.player2Letters || "";
    let newCurrentTurn = turn.playerId; // Default: trick setter goes again

    if (result === "missed") {
      // The player who set the trick gets to go again
      // The judging player (who missed matching the trick) gets a letter
      if (isPlayer1) {
        // Current user is player1, they missed, they get a letter
        newPlayer1Letters = newPlayer1Letters + SKATE_LETTERS[newPlayer1Letters.length];
      } else {
        // Current user is player2, they missed, they get a letter
        newPlayer2Letters = newPlayer2Letters + SKATE_LETTERS[newPlayer2Letters.length];
      }
      // The trick setter (turn.playerId) goes again
      newCurrentTurn = turn.playerId;
    } else {
      // Landed - the judging player (who matched) now sets the next trick
      newCurrentTurn = currentUserId;
    }

    // Check for game over
    const gameOver = isGameOver(newPlayer1Letters, newPlayer2Letters);
    const deadline = new Date(now.getTime() + TURN_DEADLINE_MS);

    if (gameOver.over) {
      // Game is over - the player with SKATE loses
      const winnerId = gameOver.loserId === "player1" ? game.player2Id : game.player1Id;

      const [updatedGame] = await db
        .update(games)
        .set({
          player1Letters: newPlayer1Letters,
          player2Letters: newPlayer2Letters,
          status: "completed",
          winnerId,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(games.id, game.id))
        .returning();

      logger.info("[Games] Game completed", {
        gameId: game.id,
        winnerId,
        player1Letters: newPlayer1Letters,
        player2Letters: newPlayer2Letters,
      });

      res.json({
        game: updatedGame,
        turn: { ...turn, result, judgedBy: currentUserId, judgedAt: now },
        gameOver: true,
        winnerId,
        message: `Game over! ${winnerId === game.player1Id ? game.player1Name : game.player2Name} wins!`,
      });
    } else {
      // Game continues
      const [updatedGame] = await db
        .update(games)
        .set({
          player1Letters: newPlayer1Letters,
          player2Letters: newPlayer2Letters,
          currentTurn: newCurrentTurn,
          deadlineAt: deadline,
          updatedAt: now,
        })
        .where(eq(games.id, game.id))
        .returning();

      const judgerName = isPlayer1 ? game.player1Name : game.player2Name;
      const letterMessage = result === "missed"
        ? `${judgerName} missed and gets a letter!`
        : `${judgerName} landed it!`;

      logger.info("[Games] Turn judged", {
        gameId: game.id,
        turnId,
        result,
        judgedBy: currentUserId,
      });

      res.json({
        game: updatedGame,
        turn: { ...turn, result, judgedBy: currentUserId, judgedAt: now },
        gameOver: false,
        message: letterMessage,
      });
    }
  } catch (error) {
    logger.error("[Games] Failed to judge turn", { error, turnId, userId: currentUserId });
    res.status(500).json({ error: "Failed to judge turn" });
  }
});

// GET /api/games/my-games - List my games
router.get("/my-games", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const currentUserId = req.currentUser!.id;

  try {
    const db = getDb();

    // Get all games where user is player1 or player2
    const userGames = await db
      .select()
      .from(games)
      .where(or(eq(games.player1Id, currentUserId), eq(games.player2Id, currentUserId)))
      .orderBy(desc(games.updatedAt))
      .limit(50);

    // Categorize games
    const pendingChallenges = userGames.filter(
      (g) => g.status === "pending" && g.player2Id === currentUserId
    );
    const sentChallenges = userGames.filter(
      (g) => g.status === "pending" && g.player1Id === currentUserId
    );
    const activeGames = userGames.filter((g) => g.status === "active");
    const completedGames = userGames.filter(
      (g) => g.status === "completed" || g.status === "declined" || g.status === "forfeited"
    );

    res.json({
      pendingChallenges, // Challenges waiting for me to accept/decline
      sentChallenges, // Challenges I sent waiting for response
      activeGames, // Games in progress
      completedGames, // Finished games
      total: userGames.length,
    });
  } catch (error) {
    logger.error("[Games] Failed to fetch my games", { error, userId: currentUserId });
    res.status(500).json({ error: "Failed to fetch games" });
  }
});

// GET /api/games/:id - Game details with turns
router.get("/:id", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;

  try {
    const db = getDb();

    // Get the game
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    // Verify user is a player in this game
    if (game.player1Id !== currentUserId && game.player2Id !== currentUserId) {
      return res.status(403).json({ error: "You are not a player in this game" });
    }

    // Get all turns for this game
    const turns = await db
      .select()
      .from(gameTurns)
      .where(eq(gameTurns.gameId, gameId))
      .orderBy(gameTurns.turnNumber);

    // Determine if it's the current user's turn
    const isMyTurn = game.currentTurn === currentUserId;

    // Find the pending turn that needs judging (if any)
    const pendingTurn = turns.find((t) => t.result === "pending");
    const needsToJudge = pendingTurn && pendingTurn.playerId !== currentUserId && isMyTurn;

    res.json({
      game,
      turns,
      isMyTurn,
      needsToJudge,
      pendingTurnId: needsToJudge ? pendingTurn?.id : null,
    });
  } catch (error) {
    logger.error("[Games] Failed to fetch game details", { error, gameId, userId: currentUserId });
    res.status(500).json({ error: "Failed to fetch game" });
  }
});

// Internal function to forfeit expired games (called by cron)
export async function forfeitExpiredGames(): Promise<{ forfeited: number }> {
  if (!isDatabaseAvailable()) {
    return { forfeited: 0 };
  }

  try {
    const db = getDb();
    const now = new Date();

    // Find active games past their deadline
    const expiredGames = await db
      .select()
      .from(games)
      .where(and(eq(games.status, "active"), lt(games.deadlineAt!, now)));

    let forfeitedCount = 0;

    for (const game of expiredGames) {
      // The player whose turn it was forfeits (they lose)
      const loserId = game.currentTurn;
      const winnerId = loserId === game.player1Id ? game.player2Id : game.player1Id;

      await db
        .update(games)
        .set({
          status: "forfeited",
          winnerId,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(games.id, game.id));

      logger.info("[Games] Game forfeited due to timeout", {
        gameId: game.id,
        loserId,
        winnerId,
      });

      forfeitedCount++;
    }

    return { forfeited: forfeitedCount };
  } catch (error) {
    logger.error("[Games] Failed to forfeit expired games", { error });
    return { forfeited: 0 };
  }
}

export { router as gamesRouter };
