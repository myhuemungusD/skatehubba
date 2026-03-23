/**
 * Game Turn Service — Multiplayer S.K.A.T.E. (2-5 players)
 *
 * Turn flow for N players:
 *   1. Setter sets a trick (SET phase)
 *   2. Each non-setter responds in order (RESPOND phase, one at a time)
 *   3. After each response, the setter judges it (JUDGE phase)
 *   4. After all responders are judged, check eliminations, rotate setter
 *
 * A player is eliminated when they spell S-K-A-T-E (5 letters).
 * Last player standing wins.
 */

import { games, gameTurns, type GamePlayer } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../db";

// ============================================================================
// Constants
// ============================================================================

const SKATE_LETTERS = "SKATE";
const SKATE_LETTERS_TO_LOSE = 5;
const TURN_DEADLINE_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_VIDEO_DURATION_MS = 15_000; // 15 seconds

export { TURN_DEADLINE_MS, MAX_VIDEO_DURATION_MS };

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
  notify: Notification[];
};

type JudgeTurnSuccess = {
  ok: true;
  game: typeof games.$inferSelect;
  turn: Record<string, unknown>;
  gameOver: boolean;
  winnerId?: string | null;
  message: string;
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
// Helpers
// ============================================================================

function activePlayers(players: GamePlayer[]): GamePlayer[] {
  return players.filter((p) => !p.isEliminated);
}

function playerName(players: GamePlayer[], id: string): string {
  return players.find((p) => p.id === id)?.name || "Skater";
}

/** Find the next non-eliminated responder index after `currentIdx` */
function nextResponderIdx(
  players: GamePlayer[],
  setterId: string,
  afterIdx: number | null
): number | null {
  const startIdx = afterIdx === null ? 0 : afterIdx + 1;
  for (let i = startIdx; i < players.length; i++) {
    if (players[i].id !== setterId && !players[i].isEliminated) {
      return i;
    }
  }
  return null;
}

/** Pick the next setter: the next active player after current setter */
function nextSetter(players: GamePlayer[], currentSetterId: string): string | null {
  const active = activePlayers(players);
  if (active.length < 2) return null;
  const currentIdx = active.findIndex((p) => p.id === currentSetterId);
  const nextIdx = (currentIdx + 1) % active.length;
  return active[nextIdx].id;
}

/** Apply a letter to a player, return updated players array */
function applyLetter(players: GamePlayer[], playerId: string): GamePlayer[] {
  return players.map((p) => {
    if (p.id !== playerId) return p;
    const newLetters = p.letters + (SKATE_LETTERS[p.letters.length] || "");
    return { ...p, letters: newLetters, isEliminated: newLetters.length >= SKATE_LETTERS_TO_LOSE };
  });
}

/** Check if the game is over (1 or fewer active players remaining) */
function checkGameOver(players: GamePlayer[]): { over: boolean; winnerId: string | null } {
  const active = activePlayers(players);
  if (active.length <= 1) {
    return { over: true, winnerId: active[0]?.id ?? null };
  }
  return { over: false, winnerId: null };
}

// ============================================================================
// Submit Turn
// ============================================================================

export async function submitTurn(tx: Database, input: SubmitTurnInput): Promise<SubmitTurnResult> {
  const { gameId, playerId, trickDescription, videoUrl, videoDurationMs, thumbnailUrl } = input;

  await tx.execute(sql`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`);
  const [game] = await tx.select().from(games).where(eq(games.id, gameId)).limit(1);

  if (!game) return { ok: false, status: 404, error: "Game not found" };
  if (game.status !== "active") return { ok: false, status: 400, error: "Game is not active" };

  const players: GamePlayer[] = game.players;
  const isPlayer = players.some((p) => p.id === playerId);
  if (!isPlayer) return { ok: false, status: 403, error: "You are not a player in this game" };

  const playerObj = players.find((p) => p.id === playerId)!;
  if (playerObj.isEliminated) return { ok: false, status: 400, error: "You are eliminated" };
  if (game.currentTurn !== playerId) return { ok: false, status: 400, error: "Not your turn" };

  if (game.deadlineAt && new Date(game.deadlineAt) < new Date()) {
    return { ok: false, status: 400, error: "Turn deadline has passed" };
  }

  const turnPhase = game.turnPhase || "set_trick";
  let turnType: "set" | "response";

  if (turnPhase === "set_trick") {
    if (playerId !== game.setterId) {
      return { ok: false, status: 400, error: "Only the setter can set a trick" };
    }
    turnType = "set";
  } else if (turnPhase === "respond_trick") {
    if (playerId === game.setterId) {
      return { ok: false, status: 400, error: "The setter does not respond to their own trick" };
    }
    turnType = "response";
  } else {
    return { ok: false, status: 400, error: "Current phase does not accept video submissions" };
  }

  // Count existing turns for turn number
  const turnCountResult = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(gameTurns)
    .where(eq(gameTurns.gameId, gameId));

  const turnNumber = (turnCountResult[0]?.count || 0) + 1;
  const name = playerName(players, playerId);

  const [newTurn] = await tx
    .insert(gameTurns)
    .values({
      gameId,
      playerId,
      playerName: name,
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
    // After setter sets, find the first responder
    const firstIdx = nextResponderIdx(players, playerId, null);
    if (firstIdx === null) {
      return { ok: false, status: 500, error: "No responders available" };
    }

    const responderId = players[firstIdx].id;

    await tx
      .update(games)
      .set({
        currentTurn: responderId,
        turnPhase: "respond_trick",
        currentResponderIdx: firstIdx,
        lastTrickDescription: trickDescription,
        lastTrickBy: playerId,
        deadlineAt: deadline,
        updatedAt: now,
      })
      .where(eq(games.id, gameId));

    return {
      ok: true,
      turn: newTurn,
      message: "Trick set. Waiting for responses.",
      notify: [
        {
          playerId: responderId,
          type: "your_turn",
          data: { gameId, opponentName: name },
        },
      ],
    };
  } else {
    // Response submitted — setter now judges this response
    await tx
      .update(games)
      .set({
        currentTurn: game.setterId,
        turnPhase: "judge",
        deadlineAt: deadline,
        updatedAt: now,
      })
      .where(eq(games.id, gameId));

    return {
      ok: true,
      turn: newTurn,
      message: "Response sent. Waiting for judgment.",
      notify: game.setterId
        ? [{ playerId: game.setterId, type: "your_turn", data: { gameId, opponentName: name } }]
        : [],
    };
  }
}

// ============================================================================
// Judge Turn
// ============================================================================

export async function judgeTurn(
  tx: Database,
  turnId: number,
  playerId: string,
  result: "landed" | "missed",
  turn: typeof gameTurns.$inferSelect
): Promise<JudgeTurnResult> {
  await tx.execute(sql`SELECT id FROM games WHERE id = ${turn.gameId} FOR UPDATE`);
  const [game] = await tx.select().from(games).where(eq(games.id, turn.gameId)).limit(1);

  if (!game) return { ok: false, status: 404, error: "Game not found" };
  if (playerId !== game.setterId) {
    return { ok: false, status: 403, error: "Only the setter can judge" };
  }
  if (game.turnPhase !== "judge") {
    return { ok: false, status: 400, error: "Game is not in judging phase" };
  }

  // Prevent double-judge
  const [currentTurn] = await tx.select().from(gameTurns).where(eq(gameTurns.id, turnId)).limit(1);
  if (!currentTurn || currentTurn.result !== "pending") {
    return { ok: false, status: 400, error: "Turn has already been judged" };
  }

  const now = new Date();

  // Update the turn with judgment
  await tx
    .update(gameTurns)
    .set({ result, judgedBy: playerId, judgedAt: now })
    .where(eq(gameTurns.id, turnId));

  let updatedPlayers: GamePlayer[] = game.players;
  const responderId = turn.playerId;

  // MISSED = responder gets a letter
  if (result === "missed") {
    updatedPlayers = applyLetter(updatedPlayers, responderId);
  }

  // Check if there are more responders after this one
  const currentRespIdx = game.currentResponderIdx;
  const nextRespIdx = nextResponderIdx(updatedPlayers, game.setterId!, currentRespIdx);

  const deadline = new Date(now.getTime() + TURN_DEADLINE_MS);

  // Check for game over after potential elimination
  const gameOverCheck = checkGameOver(updatedPlayers);

  if (gameOverCheck.over) {
    const [updatedGame] = await tx
      .update(games)
      .set({
        players: updatedPlayers,
        status: "completed",
        winnerId: gameOverCheck.winnerId,
        completedAt: now,
        updatedAt: now,
        turnPhase: null,
        currentTurn: null,
        deadlineAt: null,
        currentResponderIdx: null,
      })
      .where(eq(games.id, game.id))
      .returning();

    return {
      ok: true,
      game: updatedGame,
      turn: { ...turn, result, judgedBy: playerId, judgedAt: now },
      gameOver: true,
      winnerId: gameOverCheck.winnerId,
      message: "Game over.",
      notifications: updatedPlayers.map((p) => ({
        playerId: p.id,
        type: "game_over" as const,
        data: {
          gameId: game.id,
          winnerId: gameOverCheck.winnerId || undefined,
          youWon: p.id === gameOverCheck.winnerId,
        },
      })),
    };
  }

  if (nextRespIdx !== null) {
    // More responders to go — next responder's turn
    const nextResponderId = updatedPlayers[nextRespIdx].id;

    const [updatedGame] = await tx
      .update(games)
      .set({
        players: updatedPlayers,
        currentTurn: nextResponderId,
        turnPhase: "respond_trick",
        currentResponderIdx: nextRespIdx,
        deadlineAt: deadline,
        updatedAt: now,
      })
      .where(eq(games.id, game.id))
      .returning();

    const letterMsg = result === "missed" ? "BAIL. Letter earned." : "LAND.";

    return {
      ok: true,
      game: updatedGame,
      turn: { ...turn, result, judgedBy: playerId, judgedAt: now },
      gameOver: false,
      message: `${letterMsg} Next responder up.`,
      notifications: [
        {
          playerId: nextResponderId,
          type: "your_turn",
          data: { gameId: game.id, opponentName: playerName(updatedPlayers, game.setterId!) },
        },
      ],
    };
  }

  // All responders judged — round complete. Rotate setter.
  const newSetterId = nextSetter(updatedPlayers, game.setterId!);
  if (!newSetterId) {
    return { ok: false, status: 500, error: "Could not determine next setter" };
  }

  const [updatedGame] = await tx
    .update(games)
    .set({
      players: updatedPlayers,
      currentTurn: newSetterId,
      turnPhase: "set_trick",
      setterId: newSetterId,
      currentResponderIdx: null,
      deadlineAt: deadline,
      updatedAt: now,
    })
    .where(eq(games.id, game.id))
    .returning();

  const letterMsg = result === "missed" ? "BAIL. Letter earned." : "LAND.";

  return {
    ok: true,
    game: updatedGame,
    turn: { ...turn, result, judgedBy: playerId, judgedAt: now },
    gameOver: false,
    message: `${letterMsg} Round complete. New setter up.`,
    notifications: [
      {
        playerId: newSetterId,
        type: "your_turn",
        data: { gameId: game.id, opponentName: "all" },
      },
    ],
  };
}

// ============================================================================
// Setter Bail
// ============================================================================

/**
 * Setter bails on their own trick — they take the letter.
 * Roles rotate: next active player becomes setter.
 */
export async function setterBail(
  tx: Database,
  gameId: string,
  playerId: string
): Promise<SetterBailResult> {
  await tx.execute(sql`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`);
  const [game] = await tx.select().from(games).where(eq(games.id, gameId)).limit(1);

  if (!game) return { ok: false, status: 404, error: "Game not found" };
  if (game.status !== "active") return { ok: false, status: 400, error: "Game is not active" };
  if (game.setterId !== playerId) {
    return { ok: false, status: 403, error: "Only the setter can declare a bail" };
  }
  if (game.turnPhase !== "set_trick") {
    return { ok: false, status: 400, error: "Can only bail during set trick phase" };
  }

  let updatedPlayers = applyLetter(game.players, playerId);
  const now = new Date();
  const deadline = new Date(now.getTime() + TURN_DEADLINE_MS);

  const gameOverCheck = checkGameOver(updatedPlayers);

  if (gameOverCheck.over) {
    const [updatedGame] = await tx
      .update(games)
      .set({
        players: updatedPlayers,
        status: "completed",
        winnerId: gameOverCheck.winnerId,
        completedAt: now,
        updatedAt: now,
        turnPhase: null,
        currentTurn: null,
        deadlineAt: null,
        currentResponderIdx: null,
      })
      .where(eq(games.id, gameId))
      .returning();

    return {
      ok: true,
      game: updatedGame,
      gameOver: true,
      winnerId: gameOverCheck.winnerId,
      message: "You bailed your own trick. Game over.",
      notifications: updatedPlayers.map((p) => ({
        playerId: p.id,
        type: "game_over" as const,
        data: {
          gameId: game.id,
          winnerId: gameOverCheck.winnerId || undefined,
          youWon: p.id === gameOverCheck.winnerId,
        },
      })),
    };
  }

  const newSetterId = nextSetter(updatedPlayers, playerId);
  if (!newSetterId) {
    return { ok: false, status: 500, error: "Could not determine next setter" };
  }

  const [updatedGame] = await tx
    .update(games)
    .set({
      players: updatedPlayers,
      currentTurn: newSetterId,
      turnPhase: "set_trick",
      setterId: newSetterId,
      currentResponderIdx: null,
      deadlineAt: deadline,
      updatedAt: now,
    })
    .where(eq(games.id, gameId))
    .returning();

  return {
    ok: true,
    game: updatedGame,
    gameOver: false,
    message: "You bailed your own trick. Letter earned. New setter up.",
    notifications: [
      {
        playerId: newSetterId,
        type: "your_turn",
        data: { gameId: game.id, opponentName: playerName(updatedPlayers, playerId) },
      },
    ],
  };
}
