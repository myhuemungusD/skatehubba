/**
 * Game Turn Service - S.K.A.T.E. turn submission and judging
 *
 * Extracted from route handlers to keep business logic testable
 * and route handlers thin (HTTP concerns only).
 */

import { games, gameTurns } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { TURN_DEADLINE_MS, SKATE_LETTERS, isGameOver } from "../routes/games-shared";
import type { Database } from "../db";

// ============================================================================
// Types
// ============================================================================

interface SubmitTurnInput {
  gameId: string;
  playerId: string;
  trickDescription: string;
  videoUrl: string;
  videoDurationMs: number;
  thumbnailUrl?: string | null;
}

interface NotificationData {
  gameId: string;
  opponentName?: string;
  winnerId?: string;
  youWon?: boolean;
}

interface Notification {
  playerId: string;
  type: "your_turn" | "game_over";
  data: NotificationData;
}

type TxError = { ok: false; status: number; error: string };

type SubmitTurnSuccess = {
  ok: true;
  turn: typeof gameTurns.$inferSelect;
  message: string;
  notify: { playerId: string; opponentName: string } | null;
};

type JudgeTurnSuccess = {
  ok: true;
  response: {
    game: typeof games.$inferSelect;
    turn: Record<string, unknown>;
    gameOver: boolean;
    winnerId?: string | null;
    message: string;
  };
  notifications: Notification[];
};

type SetterBailSuccess = {
  ok: true;
  game: typeof games.$inferSelect;
  gameOver: boolean;
  winnerId?: string | null;
  message: string;
  notifications: Notification[];
};

export type SubmitTurnResult = TxError | SubmitTurnSuccess;
export type JudgeTurnResult = TxError | JudgeTurnSuccess;
export type SetterBailResult = TxError | SetterBailSuccess;

// ============================================================================
// Submit Turn
// ============================================================================

/**
 * Submit a trick (set) or response video within a transaction.
 * Validates game state, creates the turn record, and advances game phase.
 */
export async function submitTurn(tx: Database, input: SubmitTurnInput): Promise<SubmitTurnResult> {
  const { gameId, playerId, trickDescription, videoUrl, videoDurationMs, thumbnailUrl } = input;

  // Lock game row to prevent concurrent turn submissions
  await tx.execute(sql`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`);

  const [game] = await tx.select().from(games).where(eq(games.id, gameId)).limit(1);

  if (!game) return { ok: false, status: 404, error: "Game not found" };

  const isPlayer1 = game.player1Id === playerId;
  const isPlayer2 = game.player2Id === playerId;
  if (!isPlayer1 && !isPlayer2)
    return { ok: false, status: 403, error: "You are not a player in this game" };
  if (game.status !== "active") return { ok: false, status: 400, error: "Game is not active" };
  if (game.currentTurn !== playerId) return { ok: false, status: 400, error: "Not your turn" };

  // Check deadline
  if (game.deadlineAt && new Date(game.deadlineAt) < new Date())
    return { ok: false, status: 400, error: "Turn deadline has passed. Game forfeited." };

  // Determine turn type based on phase
  const turnPhase = game.turnPhase || "set_trick";
  let turnType: "set" | "response";

  if (turnPhase === "set_trick") {
    if (playerId !== game.offensivePlayerId)
      return { ok: false, status: 400, error: "Only the offensive player can set a trick" };
    turnType = "set";
  } else if (turnPhase === "respond_trick") {
    if (playerId !== game.defensivePlayerId)
      return { ok: false, status: 400, error: "Only the defensive player can respond" };
    turnType = "response";
  } else {
    return { ok: false, status: 400, error: "Current phase does not accept video submissions" };
  }

  // Get turn count
  const turnCountResult = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(gameTurns)
    .where(eq(gameTurns.gameId, gameId));

  const turnNumber = (turnCountResult[0]?.count || 0) + 1;
  const playerName = isPlayer1 ? game.player1Name : game.player2Name;

  // Create the turn record
  const [newTurn] = await tx
    .insert(gameTurns)
    .values({
      gameId,
      playerId,
      playerName: playerName || "Skater",
      turnNumber,
      turnType,
      trickDescription,
      videoUrl,
      videoDurationMs,
      thumbnailUrl: thumbnailUrl ?? null,
      result: "pending",
    })
    .returning();

  const now = new Date();
  const deadline = new Date(now.getTime() + TURN_DEADLINE_MS);

  if (turnType === "set") {
    await tx
      .update(games)
      .set({
        currentTurn: game.defensivePlayerId,
        turnPhase: "respond_trick",
        lastTrickDescription: trickDescription,
        lastTrickBy: playerId,
        deadlineAt: deadline,
        updatedAt: now,
      })
      .where(eq(games.id, gameId));

    return {
      ok: true,
      turn: newTurn,
      message: "Trick set. Sent.",
      notify: game.defensivePlayerId
        ? { playerId: game.defensivePlayerId, opponentName: playerName || "Opponent" }
        : null,
    };
  } else {
    await tx
      .update(games)
      .set({
        currentTurn: game.defensivePlayerId,
        turnPhase: "judge",
        deadlineAt: deadline,
        updatedAt: now,
      })
      .where(eq(games.id, gameId));

    return {
      ok: true,
      turn: newTurn,
      message: "Response sent. Now judge the trick.",
      notify: null,
    };
  }
}

// ============================================================================
// Judge Turn
// ============================================================================

/**
 * Judge a turn (LAND or BAIL) within a transaction.
 * Validates game state, applies SKATE letter logic, handles game-over detection,
 * and determines role swaps.
 */
export async function judgeTurn(
  tx: Database,
  turnId: number,
  playerId: string,
  result: "landed" | "missed",
  turn: typeof gameTurns.$inferSelect
): Promise<JudgeTurnResult> {
  // Lock game row to prevent concurrent judge/forfeit/dispute
  await tx.execute(sql`SELECT id FROM games WHERE id = ${turn.gameId} FOR UPDATE`);

  const [game] = await tx.select().from(games).where(eq(games.id, turn.gameId)).limit(1);

  if (!game) return { ok: false, status: 404, error: "Game not found" };
  if (playerId !== game.defensivePlayerId)
    return { ok: false, status: 403, error: "Only the defending player can judge" };
  if (game.turnPhase !== "judge")
    return { ok: false, status: 400, error: "Game is not in judging phase" };
  if (game.currentTurn !== playerId)
    return { ok: false, status: 400, error: "Not your turn to judge" };

  // Re-check turn result inside transaction (prevents double-judge race)
  const [currentTurn] = await tx.select().from(gameTurns).where(eq(gameTurns.id, turnId)).limit(1);

  if (!currentTurn || currentTurn.result !== "pending")
    return { ok: false, status: 400, error: "Turn has already been judged" };

  // Verify defender has submitted their response video
  const responseVideos = await tx
    .select()
    .from(gameTurns)
    .where(
      and(
        eq(gameTurns.gameId, game.id),
        eq(gameTurns.playerId, playerId),
        eq(gameTurns.turnType, "response")
      )
    );

  const hasResponseForThisRound = responseVideos.some((rv) => rv.turnNumber > turn.turnNumber);

  if (!hasResponseForThisRound)
    return { ok: false, status: 400, error: "You must submit your response video before judging" };

  const now = new Date();

  // Update the turn with judgment
  await tx
    .update(gameTurns)
    .set({ result, judgedBy: playerId, judgedAt: now })
    .where(eq(gameTurns.id, turnId));

  // Apply SKATE letter logic
  const isPlayer1 = game.player1Id === playerId;
  let newPlayer1Letters = game.player1Letters || "";
  let newPlayer2Letters = game.player2Letters || "";
  let newOffensiveId: string;
  let newDefensiveId: string;

  // Active games must have both role IDs set; guard against corrupt state.
  if (!game.offensivePlayerId || !game.defensivePlayerId) {
    return { ok: false, status: 500, error: "Game is missing player role assignments" };
  }

  if (result === "missed") {
    // BAIL: defensive player gets a letter, roles STAY the same
    if (isPlayer1) {
      newPlayer1Letters += SKATE_LETTERS[newPlayer1Letters.length] || "";
    } else {
      newPlayer2Letters += SKATE_LETTERS[newPlayer2Letters.length] || "";
    }
    newOffensiveId = game.offensivePlayerId;
    newDefensiveId = game.defensivePlayerId;
  } else {
    // LAND: roles swap
    newOffensiveId = game.defensivePlayerId;
    newDefensiveId = game.offensivePlayerId;
  }

  // Check for game over
  const gameOverCheck = isGameOver(newPlayer1Letters, newPlayer2Letters);
  const deadline = new Date(now.getTime() + TURN_DEADLINE_MS);

  if (gameOverCheck.over) {
    const winnerId = gameOverCheck.loserId === "player1" ? game.player2Id : game.player1Id;

    const [updatedGame] = await tx
      .update(games)
      .set({
        player1Letters: newPlayer1Letters,
        player2Letters: newPlayer2Letters,
        status: "completed",
        winnerId,
        completedAt: now,
        updatedAt: now,
        turnPhase: null,
        currentTurn: null,
        deadlineAt: null,
      })
      .where(eq(games.id, game.id))
      .returning();

    return {
      ok: true,
      response: {
        game: updatedGame,
        turn: { ...turn, result, judgedBy: playerId, judgedAt: now },
        gameOver: true,
        winnerId,
        message: "Game over.",
      },
      notifications: [game.player1Id, game.player2Id].filter(Boolean).map((pid) => ({
        playerId: pid as string,
        type: "game_over" as const,
        data: {
          gameId: game.id,
          winnerId: winnerId || undefined,
          youWon: pid === winnerId,
        },
      })),
    };
  } else {
    const [updatedGame] = await tx
      .update(games)
      .set({
        player1Letters: newPlayer1Letters,
        player2Letters: newPlayer2Letters,
        currentTurn: newOffensiveId,
        turnPhase: "set_trick",
        offensivePlayerId: newOffensiveId,
        defensivePlayerId: newDefensiveId,
        deadlineAt: deadline,
        updatedAt: now,
      })
      .where(eq(games.id, game.id))
      .returning();

    const letterMessage = result === "missed" ? "BAIL. Letter earned." : "LAND. Roles swap.";

    return {
      ok: true,
      response: {
        game: updatedGame,
        turn: { ...turn, result, judgedBy: playerId, judgedAt: now },
        gameOver: false,
        message: letterMessage,
      },
      notifications: [
        {
          playerId: newOffensiveId,
          type: "your_turn" as const,
          data: {
            gameId: game.id,
            opponentName: (isPlayer1 ? game.player2Name : game.player1Name) || "Opponent",
          },
        },
      ],
    };
  }
}

// ============================================================================
// Setter Bail
// ============================================================================

/**
 * Setter bails on their own trick — they take the letter themselves.
 * This is a real S.K.A.T.E. rule: if you can't land what you set,
 * you eat the letter and your opponent becomes the setter.
 */
export async function setterBail(
  tx: Database,
  gameId: string,
  playerId: string
): Promise<SetterBailResult> {
  // Lock game row
  await tx.execute(sql`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`);

  const [game] = await tx.select().from(games).where(eq(games.id, gameId)).limit(1);

  if (!game) return { ok: false, status: 404, error: "Game not found" };
  if (game.status !== "active") return { ok: false, status: 400, error: "Game is not active" };
  if (game.offensivePlayerId !== playerId)
    return { ok: false, status: 403, error: "Only the setter can declare a bail" };
  if (game.turnPhase !== "set_trick")
    return { ok: false, status: 400, error: "Can only bail during set trick phase" };

  const isPlayer1 = game.player1Id === playerId;
  let newPlayer1Letters = game.player1Letters || "";
  let newPlayer2Letters = game.player2Letters || "";

  // Setter takes a letter
  if (isPlayer1) {
    newPlayer1Letters += SKATE_LETTERS[newPlayer1Letters.length] || "";
  } else {
    newPlayer2Letters += SKATE_LETTERS[newPlayer2Letters.length] || "";
  }

  const now = new Date();
  const deadline = new Date(now.getTime() + TURN_DEADLINE_MS);

  // Roles swap — opponent becomes the setter
  const newOffensiveId = game.defensivePlayerId!;
  const newDefensiveId = game.offensivePlayerId!;

  // Check for game over
  const gameOverCheck = isGameOver(newPlayer1Letters, newPlayer2Letters);

  if (gameOverCheck.over) {
    const winnerId = gameOverCheck.loserId === "player1" ? game.player2Id : game.player1Id;

    const [updatedGame] = await tx
      .update(games)
      .set({
        player1Letters: newPlayer1Letters,
        player2Letters: newPlayer2Letters,
        status: "completed",
        winnerId,
        completedAt: now,
        updatedAt: now,
        turnPhase: null,
        currentTurn: null,
        deadlineAt: null,
      })
      .where(eq(games.id, gameId))
      .returning();

    return {
      ok: true,
      game: updatedGame,
      gameOver: true,
      winnerId,
      message: "You bailed your own trick. Game over.",
      notifications: [game.player1Id, game.player2Id].filter(Boolean).map((pid) => ({
        playerId: pid as string,
        type: "game_over" as const,
        data: {
          gameId: game.id,
          winnerId: winnerId || undefined,
          youWon: pid === winnerId,
        },
      })),
    };
  }

  const [updatedGame] = await tx
    .update(games)
    .set({
      player1Letters: newPlayer1Letters,
      player2Letters: newPlayer2Letters,
      currentTurn: newOffensiveId,
      turnPhase: "set_trick",
      offensivePlayerId: newOffensiveId,
      defensivePlayerId: newDefensiveId,
      deadlineAt: deadline,
      updatedAt: now,
    })
    .where(eq(games.id, gameId))
    .returning();

  return {
    ok: true,
    game: updatedGame,
    gameOver: false,
    message: "You bailed your own trick. Letter earned. Roles swap.",
    notifications: [
      {
        playerId: newOffensiveId,
        type: "your_turn" as const,
        data: {
          gameId: game.id,
          opponentName: (isPlayer1 ? game.player1Name : game.player2Name) || "Opponent",
        },
      },
    ],
  };
}
