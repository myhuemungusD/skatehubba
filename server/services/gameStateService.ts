/**
 * Game State Service
 *
 * Manages real-time S.K.A.T.E. game state using PostgreSQL with transactional updates.
 * Uses SELECT FOR UPDATE for distributed locking to prevent race conditions.
 *
 * Features:
 * - Atomic state transitions via PostgreSQL transactions with row-level locking
 * - Idempotency keys to prevent duplicate event processing
 * - Turn timeouts (60s, defender wins on timeout)
 * - Disconnect handling with reconnection window
 * - Auto-forfeit after disconnection timeout
 */

import crypto from "node:crypto";
import { getDb } from "../db";
import { gameSessions } from "@shared/schema";
import { eq, and, lt } from "drizzle-orm";
import logger from "../logger";
import { logServerEvent } from "./analyticsService";

// ============================================================================
// Types
// ============================================================================

export interface GamePlayer {
  odv: string;
  letters: string; // "" -> "S" -> "SK" -> "SKA" -> "SKAT" -> "SKATE"
  connected: boolean;
  disconnectedAt?: string;
}

export interface GameState {
  id: string;
  spotId: string;
  creatorId: string;
  players: GamePlayer[];
  maxPlayers: number;
  currentTurnIndex: number;
  currentAction: "set" | "attempt";
  currentTrick?: string;
  setterId?: string; // Who set the current trick
  status: "waiting" | "active" | "paused" | "completed";
  winnerId?: string;
  createdAt: string;
  updatedAt: string;
  turnDeadlineAt?: string; // ISO timestamp for current turn deadline
  pausedAt?: string; // When game was paused due to disconnect
  processedEventIds: string[]; // Idempotency keys - last 100 events
}

export interface GameEvent {
  eventId: string; // Idempotency key
  type: "create" | "join" | "trick" | "pass" | "disconnect" | "reconnect" | "forfeit" | "timeout";
  odv: string;
  gameId: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}

interface TransitionResult {
  success: boolean;
  game?: GameState;
  error?: string;
  alreadyProcessed?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const SKATE = "SKATE";
const TURN_TIMEOUT_MS = 60 * 1000; // 60 seconds for voting/turns
const RECONNECT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes to reconnect
const MAX_PROCESSED_EVENTS = 100; // Keep last 100 event IDs for idempotency

// ============================================================================
// Helper Functions
// ============================================================================

function getNextLetter(currentLetters: string): string {
  const nextIndex = currentLetters.length;
  return nextIndex < SKATE.length ? currentLetters + SKATE[nextIndex] : currentLetters;
}

function isEliminated(letters: string): boolean {
  return letters === SKATE;
}

/**
 * Generate a deterministic event ID for idempotency.
 */
function generateEventId(type: string, odv: string, gameId: string, sequenceKey?: string): string {
  if (sequenceKey) {
    return `${type}-${gameId}-${odv}-${sequenceKey}`;
  }
  // For backward compatibility, generate a unique ID (caller should cache and reuse on retries)
  return `${type}-${gameId}-${odv}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

/** Convert a DB row to GameState */
function rowToGameState(row: typeof gameSessions.$inferSelect): GameState {
  return {
    id: row.id,
    spotId: row.spotId,
    creatorId: row.creatorId,
    players: row.players as GamePlayer[],
    maxPlayers: row.maxPlayers,
    currentTurnIndex: row.currentTurnIndex,
    currentAction: row.currentAction as "set" | "attempt",
    currentTrick: row.currentTrick ?? undefined,
    setterId: row.setterId ?? undefined,
    status: row.status as GameState["status"],
    winnerId: row.winnerId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    turnDeadlineAt: row.turnDeadlineAt?.toISOString(),
    pausedAt: row.pausedAt?.toISOString(),
    processedEventIds: row.processedEventIds as string[],
  };
}

// ============================================================================
// Core Game State Operations
// ============================================================================

/**
 * Create a new game with atomic PostgreSQL write
 */
export async function createGame(input: {
  eventId: string;
  spotId: string;
  creatorId: string;
  maxPlayers?: number;
}): Promise<TransitionResult> {
  const { eventId, spotId, creatorId, maxPlayers = 4 } = input;

  try {
    const db = getDb();
    const now = new Date();

    const [row] = await db
      .insert(gameSessions)
      .values({
        spotId,
        creatorId,
        players: [{ odv: creatorId, letters: "", connected: true }],
        maxPlayers: Math.min(maxPlayers, 8),
        currentTurnIndex: 0,
        currentAction: "set",
        status: "waiting",
        processedEventIds: [eventId],
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const gameState = rowToGameState(row);

    await logServerEvent(creatorId, "game_created", {
      game_id: gameState.id,
      spot_id: spotId,
    });

    logger.info("[GameState] Game created", { gameId: gameState.id, creatorId, spotId });

    return { success: true, game: gameState };
  } catch (error) {
    logger.error("[GameState] Failed to create game", { error, creatorId, spotId });
    return { success: false, error: "Failed to create game" };
  }
}

/**
 * Join an existing game with transactional update and row-level locking
 */
export async function joinGame(input: {
  eventId: string;
  gameId: string;
  odv: string;
}): Promise<TransitionResult> {
  const { eventId, gameId, odv } = input;

  try {
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      // Lock the row for update to prevent concurrent joins
      const [game] = await tx
        .select()
        .from(gameSessions)
        .where(eq(gameSessions.id, gameId))
        .for("update");

      if (!game) {
        return { success: false, error: "Game not found" } as TransitionResult;
      }

      const state = rowToGameState(game);

      // Check idempotency
      if (state.processedEventIds.includes(eventId)) {
        return { success: true, game: state, alreadyProcessed: true } as TransitionResult;
      }

      if (state.status !== "waiting") {
        return { success: false, error: "Game has already started" } as TransitionResult;
      }

      if (state.players.length >= state.maxPlayers) {
        return { success: false, error: "Game is full" } as TransitionResult;
      }

      if (state.players.some((p) => p.odv === odv)) {
        return { success: false, error: "Already in game" } as TransitionResult;
      }

      const updatedPlayers = [...state.players, { odv, letters: "", connected: true }];
      const now = new Date();
      const shouldStartGame = updatedPlayers.length >= 2;
      const processedEventIds = [...state.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS);

      const [updated] = await tx
        .update(gameSessions)
        .set({
          players: updatedPlayers,
          updatedAt: now,
          processedEventIds,
          ...(shouldStartGame && {
            status: "active",
            turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS),
          }),
        })
        .where(eq(gameSessions.id, gameId))
        .returning();

      return { success: true, game: rowToGameState(updated) } as TransitionResult;
    });

    if (result.success && !result.alreadyProcessed) {
      await logServerEvent(odv, "game_joined", { game_id: gameId });
      logger.info("[GameState] Player joined game", { gameId, odv });
    }

    return result;
  } catch (error) {
    logger.error("[GameState] Failed to join game", { error, gameId, odv });
    return { success: false, error: "Failed to join game" };
  }
}

/**
 * Submit a trick with transactional state update and row-level locking
 */
export async function submitTrick(input: {
  eventId: string;
  gameId: string;
  odv: string;
  trickName: string;
  clipUrl?: string;
}): Promise<TransitionResult> {
  const { eventId, gameId, odv, trickName } = input;

  try {
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const [game] = await tx
        .select()
        .from(gameSessions)
        .where(eq(gameSessions.id, gameId))
        .for("update");

      if (!game) {
        return { success: false, error: "Game not found" } as TransitionResult;
      }

      const state = rowToGameState(game);

      if (state.processedEventIds.includes(eventId)) {
        return { success: true, game: state, alreadyProcessed: true } as TransitionResult;
      }

      if (state.status !== "active") {
        return { success: false, error: "Game is not active" } as TransitionResult;
      }

      const currentPlayer = state.players[state.currentTurnIndex];
      if (currentPlayer?.odv !== odv) {
        return { success: false, error: "Not your turn" } as TransitionResult;
      }

      const now = new Date();
      const processedEventIds = [...state.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS);
      let updateData: Partial<typeof gameSessions.$inferInsert>;

      if (state.currentAction === "set") {
        // Find the next non-eliminated player to attempt the trick
        let nextTurnIndex = (state.currentTurnIndex + 1) % state.players.length;
        let skipAttempts = 0;
        while (
          isEliminated(state.players[nextTurnIndex].letters) &&
          skipAttempts < state.players.length
        ) {
          nextTurnIndex = (nextTurnIndex + 1) % state.players.length;
          skipAttempts++;
        }

        updateData = {
          currentAction: "attempt",
          currentTrick: trickName,
          setterId: odv,
          currentTurnIndex: nextTurnIndex,
          updatedAt: now,
          turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS),
          processedEventIds,
        };
      } else {
        let nextTurnIndex = (state.currentTurnIndex + 1) % state.players.length;

        let attempts = 0;
        while (
          isEliminated(state.players[nextTurnIndex].letters) &&
          attempts < state.players.length
        ) {
          nextTurnIndex = (nextTurnIndex + 1) % state.players.length;
          attempts++;
        }

        const setterIndex = state.players.findIndex((p) => p.odv === state.setterId);
        const isBackToSetter = nextTurnIndex === setterIndex;

        if (isBackToSetter) {
          // Find the next non-eliminated player to be the new setter
          let newSetterIndex = (setterIndex + 1) % state.players.length;
          let skipCount = 0;
          while (
            isEliminated(state.players[newSetterIndex].letters) &&
            skipCount < state.players.length
          ) {
            newSetterIndex = (newSetterIndex + 1) % state.players.length;
            skipCount++;
          }

          updateData = {
            currentTurnIndex: newSetterIndex,
            currentAction: "set",
            currentTrick: null,
            setterId: null,
            updatedAt: now,
            turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS),
            processedEventIds,
          };
        } else {
          updateData = {
            currentTurnIndex: nextTurnIndex,
            currentAction: "attempt",
            currentTrick: trickName,
            setterId: state.setterId,
            updatedAt: now,
            turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS),
            processedEventIds,
          };
        }
      }

      const [updated] = await tx
        .update(gameSessions)
        .set(updateData)
        .where(eq(gameSessions.id, gameId))
        .returning();

      return { success: true, game: rowToGameState(updated) } as TransitionResult;
    });

    if (result.success && !result.alreadyProcessed) {
      await logServerEvent(odv, "game_trick_submitted", {
        game_id: gameId,
        trick_name: trickName,
      });
      logger.info("[GameState] Trick submitted", { gameId, odv, trickName });
    }

    return result;
  } catch (error) {
    logger.error("[GameState] Failed to submit trick", { error, gameId, odv });
    return { success: false, error: "Failed to submit trick" };
  }
}

/**
 * Pass on a trick (player gets a letter) with transactional update
 */
export async function passTrick(input: {
  eventId: string;
  gameId: string;
  odv: string;
}): Promise<TransitionResult & { letterGained?: string; isEliminated?: boolean }> {
  const { eventId, gameId, odv } = input;

  try {
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const [game] = await tx
        .select()
        .from(gameSessions)
        .where(eq(gameSessions.id, gameId))
        .for("update");

      if (!game) {
        return { success: false, error: "Game not found" };
      }

      const state = rowToGameState(game);

      if (state.processedEventIds.includes(eventId)) {
        return { success: true, game: state, alreadyProcessed: true };
      }

      if (state.status !== "active") {
        return { success: false, error: "Game is not active" };
      }

      if (state.currentAction !== "attempt") {
        return { success: false, error: "Can only pass during attempt phase" };
      }

      const currentPlayer = state.players[state.currentTurnIndex];
      if (currentPlayer?.odv !== odv) {
        return { success: false, error: "Not your turn" };
      }

      const currentLetters = currentPlayer.letters;
      const newLetters = getNextLetter(currentLetters);
      const playerEliminated = isEliminated(newLetters);

      const updatedPlayers = state.players.map((p) =>
        p.odv === odv ? { ...p, letters: newLetters } : p
      );

      const activePlayers = updatedPlayers.filter((p) => !isEliminated(p.letters));

      const now = new Date();
      const processedEventIds = [...state.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS);
      let updateData: Partial<typeof gameSessions.$inferInsert>;

      if (activePlayers.length === 1) {
        updateData = {
          players: updatedPlayers,
          status: "completed",
          winnerId: activePlayers[0].odv,
          updatedAt: now,
          turnDeadlineAt: null,
          processedEventIds,
        };
      } else {
        let nextTurnIndex = (state.currentTurnIndex + 1) % state.players.length;

        let attempts = 0;
        while (
          isEliminated(updatedPlayers[nextTurnIndex].letters) &&
          attempts < state.players.length
        ) {
          nextTurnIndex = (nextTurnIndex + 1) % state.players.length;
          attempts++;
        }

        const setterIndex = state.players.findIndex((p) => p.odv === state.setterId);
        const isBackToSetter = nextTurnIndex === setterIndex;

        if (isBackToSetter) {
          let newSetterIndex = (setterIndex + 1) % state.players.length;
          while (
            isEliminated(updatedPlayers[newSetterIndex].letters) &&
            attempts < state.players.length
          ) {
            newSetterIndex = (newSetterIndex + 1) % state.players.length;
            attempts++;
          }

          updateData = {
            players: updatedPlayers,
            currentTurnIndex: newSetterIndex,
            currentAction: "set",
            currentTrick: null,
            setterId: null,
            updatedAt: now,
            turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS),
            processedEventIds,
          };
        } else {
          updateData = {
            players: updatedPlayers,
            currentTurnIndex: nextTurnIndex,
            updatedAt: now,
            turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS),
            processedEventIds,
          };
        }
      }

      const [updated] = await tx
        .update(gameSessions)
        .set(updateData)
        .where(eq(gameSessions.id, gameId))
        .returning();

      return {
        success: true,
        game: rowToGameState(updated),
        letterGained: newLetters,
        isEliminated: playerEliminated,
      };
    });

    if (result.success && !result.alreadyProcessed) {
      await logServerEvent(odv, "game_trick_passed", {
        game_id: gameId,
        letters: result.letterGained,
      });
      logger.info("[GameState] Player passed", { gameId, odv, letters: result.letterGained });
    }

    return result;
  } catch (error) {
    logger.error("[GameState] Failed to pass trick", { error, gameId, odv });
    return { success: false, error: "Failed to pass trick" };
  }
}

/**
 * Handle player disconnect - pause game and start reconnection timer
 */
export async function handleDisconnect(input: {
  eventId: string;
  gameId: string;
  odv: string;
}): Promise<TransitionResult> {
  const { eventId, gameId, odv } = input;

  try {
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const [game] = await tx
        .select()
        .from(gameSessions)
        .where(eq(gameSessions.id, gameId))
        .for("update");

      if (!game) {
        return { success: false, error: "Game not found" } as TransitionResult;
      }

      const state = rowToGameState(game);

      if (state.processedEventIds.includes(eventId)) {
        return { success: true, game: state, alreadyProcessed: true } as TransitionResult;
      }

      if (state.status !== "active" && state.status !== "paused") {
        return { success: true, game: state } as TransitionResult;
      }

      const playerIndex = state.players.findIndex((p) => p.odv === odv);
      if (playerIndex === -1) {
        return { success: false, error: "Player not in game" } as TransitionResult;
      }

      const now = new Date();
      const nowISO = now.toISOString();
      const updatedPlayers = state.players.map((p) =>
        p.odv === odv ? { ...p, connected: false, disconnectedAt: nowISO } : p
      );

      const [updated] = await tx
        .update(gameSessions)
        .set({
          players: updatedPlayers,
          status: state.status === "active" ? "paused" : state.status,
          pausedAt: state.status === "active" ? now : game.pausedAt,
          updatedAt: now,
          processedEventIds: [...state.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS),
        })
        .where(eq(gameSessions.id, gameId))
        .returning();

      return { success: true, game: rowToGameState(updated) } as TransitionResult;
    });

    if (result.success && !result.alreadyProcessed) {
      logger.info("[GameState] Player disconnected", { gameId, odv });
    }

    return result;
  } catch (error) {
    logger.error("[GameState] Failed to handle disconnect", { error, gameId, odv });
    return { success: false, error: "Failed to handle disconnect" };
  }
}

/**
 * Handle player reconnect - resume game if all players connected
 */
export async function handleReconnect(input: {
  eventId: string;
  gameId: string;
  odv: string;
}): Promise<TransitionResult> {
  const { eventId, gameId, odv } = input;

  try {
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const [game] = await tx
        .select()
        .from(gameSessions)
        .where(eq(gameSessions.id, gameId))
        .for("update");

      if (!game) {
        return { success: false, error: "Game not found" } as TransitionResult;
      }

      const state = rowToGameState(game);

      if (state.processedEventIds.includes(eventId)) {
        return { success: true, game: state, alreadyProcessed: true } as TransitionResult;
      }

      const playerIndex = state.players.findIndex((p) => p.odv === odv);
      if (playerIndex === -1) {
        return { success: false, error: "Player not in game" } as TransitionResult;
      }

      const updatedPlayers = state.players.map((p) =>
        p.odv === odv ? { ...p, connected: true, disconnectedAt: undefined } : p
      );

      const allConnected = updatedPlayers.every((p) => p.connected);
      const now = new Date();

      const [updated] = await tx
        .update(gameSessions)
        .set({
          players: updatedPlayers,
          status: allConnected && state.status === "paused" ? "active" : state.status,
          pausedAt: allConnected ? null : game.pausedAt,
          updatedAt: now,
          turnDeadlineAt:
            allConnected && state.status === "paused"
              ? new Date(Date.now() + TURN_TIMEOUT_MS)
              : game.turnDeadlineAt,
          processedEventIds: [...state.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS),
        })
        .where(eq(gameSessions.id, gameId))
        .returning();

      return { success: true, game: rowToGameState(updated) } as TransitionResult;
    });

    if (result.success && !result.alreadyProcessed) {
      logger.info("[GameState] Player reconnected", { gameId, odv });
    }

    return result;
  } catch (error) {
    logger.error("[GameState] Failed to handle reconnect", { error, gameId, odv });
    return { success: false, error: "Failed to handle reconnect" };
  }
}

/**
 * Forfeit a game (voluntary or due to timeout)
 */
export async function forfeitGame(input: {
  eventId: string;
  gameId: string;
  odv: string;
  reason: "voluntary" | "disconnect_timeout" | "turn_timeout";
}): Promise<TransitionResult> {
  const { eventId, gameId, odv, reason } = input;

  try {
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const [game] = await tx
        .select()
        .from(gameSessions)
        .where(eq(gameSessions.id, gameId))
        .for("update");

      if (!game) {
        return { success: false, error: "Game not found" } as TransitionResult;
      }

      const state = rowToGameState(game);

      if (state.processedEventIds.includes(eventId)) {
        return { success: true, game: state, alreadyProcessed: true } as TransitionResult;
      }

      if (state.status === "completed") {
        return { success: false, error: "Game already completed" } as TransitionResult;
      }

      const playerIndex = state.players.findIndex((p) => p.odv === odv);
      if (playerIndex === -1) {
        return { success: false, error: "Player not in game" } as TransitionResult;
      }

      const activePlayers = state.players.filter((p) => p.odv !== odv && !isEliminated(p.letters));
      const winnerId = activePlayers[0]?.odv;

      const now = new Date();
      const [updated] = await tx
        .update(gameSessions)
        .set({
          status: "completed",
          winnerId: winnerId ?? null,
          updatedAt: now,
          turnDeadlineAt: null,
          processedEventIds: [...state.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS),
        })
        .where(eq(gameSessions.id, gameId))
        .returning();

      return { success: true, game: rowToGameState(updated) } as TransitionResult;
    });

    if (result.success && !result.alreadyProcessed) {
      await logServerEvent(odv, "game_forfeited", {
        game_id: gameId,
        reason,
        winner_id: result.game?.winnerId,
      });
      logger.info("[GameState] Game forfeited", { gameId, odv, reason });
    }

    return result;
  } catch (error) {
    logger.error("[GameState] Failed to forfeit game", { error, gameId, odv });
    return { success: false, error: "Failed to forfeit game" };
  }
}

/**
 * Get current game state
 */
export async function getGameState(gameId: string): Promise<GameState | null> {
  try {
    const db = getDb();
    const [row] = await db.select().from(gameSessions).where(eq(gameSessions.id, gameId));
    if (!row) {
      return null;
    }
    return rowToGameState(row);
  } catch (error) {
    logger.error("[GameState] Failed to get game state", { error, gameId });
    return null;
  }
}

/**
 * Check and process timed out games
 * Should be called periodically (e.g., every 10 seconds)
 */
export async function processTimeouts(): Promise<void> {
  try {
    const db = getDb();
    const now = new Date();

    // Find active games with expired turn deadlines
    const activeGames = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.status, "active"), lt(gameSessions.turnDeadlineAt, now)));

    for (const game of activeGames) {
      const state = rowToGameState(game);

      if (state.currentAction === "attempt") {
        // Attempt phase timeout — defender wins round, move to next setter
        await db.transaction(async (tx) => {
          const [fresh] = await tx
            .select()
            .from(gameSessions)
            .where(eq(gameSessions.id, game.id))
            .for("update");

          if (!fresh) return;
          const freshState = rowToGameState(fresh);

          if (freshState.status !== "active") return;
          if (!fresh.turnDeadlineAt || fresh.turnDeadlineAt >= now) return;
          if (freshState.currentAction !== "attempt") return;

          const freshPlayer = freshState.players[freshState.currentTurnIndex];
          if (!freshPlayer) return;

          const sequenceKey = `deadline-${fresh.turnDeadlineAt.toISOString()}`;
          const eventId = generateEventId("timeout", freshPlayer.odv, freshState.id, sequenceKey);

          if (freshState.processedEventIds.includes(eventId)) return;

          const setterIndex = freshState.players.findIndex((p) => p.odv === freshState.setterId);
          let newSetterIndex = (setterIndex + 1) % freshState.players.length;
          let attempts = 0;
          while (
            isEliminated(freshState.players[newSetterIndex].letters) &&
            attempts < freshState.players.length
          ) {
            newSetterIndex = (newSetterIndex + 1) % freshState.players.length;
            attempts++;
          }

          await tx
            .update(gameSessions)
            .set({
              currentTurnIndex: newSetterIndex,
              currentAction: "set",
              currentTrick: null,
              setterId: null,
              updatedAt: now,
              turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS),
              processedEventIds: [...freshState.processedEventIds, eventId].slice(
                -MAX_PROCESSED_EVENTS
              ),
            })
            .where(eq(gameSessions.id, game.id));

          logger.info("[GameState] Turn timeout - defender wins round", {
            gameId: game.id,
            timedOutPlayer: freshPlayer.odv,
          });
        });
      } else {
        // Set phase timeout — forfeit the game
        const result = await db.transaction(async (tx) => {
          const [fresh] = await tx
            .select()
            .from(gameSessions)
            .where(eq(gameSessions.id, game.id))
            .for("update");

          if (!fresh) return null;
          const freshState = rowToGameState(fresh);

          if (freshState.status !== "active") return null;
          if (!fresh.turnDeadlineAt || fresh.turnDeadlineAt >= now) return null;
          if (freshState.currentAction !== "set") return null;

          const freshPlayer = freshState.players[freshState.currentTurnIndex];
          if (!freshPlayer) return null;

          const sequenceKey = `deadline-${fresh.turnDeadlineAt.toISOString()}`;
          const eventId = generateEventId("timeout", freshPlayer.odv, freshState.id, sequenceKey);

          if (freshState.processedEventIds.includes(eventId)) return null;

          return { eventId, odv: freshPlayer.odv };
        });

        if (result) {
          await forfeitGame({
            eventId: result.eventId,
            gameId: game.id,
            odv: result.odv,
            reason: "turn_timeout",
          });
        }
      }
    }

    // Find paused games that exceeded reconnection window
    const pausedGames = await db
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.status, "paused"));

    for (const game of pausedGames) {
      const state = rowToGameState(game);

      for (const player of state.players) {
        if (!player.connected && player.disconnectedAt) {
          const disconnectedTime = new Date(player.disconnectedAt).getTime();
          const elapsed = now.getTime() - disconnectedTime;

          if (elapsed > RECONNECT_WINDOW_MS) {
            const result = await db.transaction(async (tx) => {
              const [fresh] = await tx
                .select()
                .from(gameSessions)
                .where(eq(gameSessions.id, game.id))
                .for("update");

              if (!fresh) return null;
              const freshState = rowToGameState(fresh);

              const freshPlayer = freshState.players.find((p) => p.odv === player.odv);
              if (
                !freshPlayer ||
                freshPlayer.connected ||
                freshPlayer.disconnectedAt !== player.disconnectedAt
              ) {
                return null;
              }

              const sequenceKey = `disconnected-${freshPlayer.disconnectedAt}`;
              const eventId = generateEventId(
                "disconnect_timeout",
                freshPlayer.odv,
                freshState.id,
                sequenceKey
              );

              if (freshState.processedEventIds.includes(eventId)) return null;

              return { eventId, odv: freshPlayer.odv };
            });

            if (result) {
              await forfeitGame({
                eventId: result.eventId,
                gameId: game.id,
                odv: result.odv,
                reason: "disconnect_timeout",
              });
              break;
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error("[GameState] Failed to process timeouts", { error });
  }
}

/**
 * Delete a game (cleanup)
 */
export async function deleteGame(gameId: string): Promise<boolean> {
  try {
    const db = getDb();
    await db.delete(gameSessions).where(eq(gameSessions.id, gameId));
    logger.info("[GameState] Game deleted", { gameId });
    return true;
  } catch (error) {
    logger.error("[GameState] Failed to delete game", { error, gameId });
    return false;
  }
}

// ============================================================================
// Event ID Generation (for clients)
// ============================================================================

export { generateEventId };
