/**
 * Game State Service
 *
 * Manages real-time S.K.A.T.E. game state using Firestore with transactional updates.
 * Replaces in-memory Map storage with persistent, race-condition-safe storage.
 *
 * Features:
 * - Atomic state transitions via Firestore transactions
 * - Idempotency keys to prevent duplicate event processing
 * - Vote timeouts (60s, defender wins on timeout)
 * - Disconnect handling with reconnection window
 * - Auto-forfeit after disconnection timeout
 */

import { db as firestore, collections } from "../firestore";
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
 *
 * IMPORTANT: For client-initiated actions, generate the eventId ONCE before
 * the first request attempt and reuse it on all retries. This ensures that
 * duplicate requests (due to network timeouts) are properly deduplicated.
 *
 * For server-side timeout processing, include a sequence number or timestamp
 * bucket to ensure deterministic IDs for the same logical timeout event.
 *
 * @param type - Event type (e.g., 'trick', 'join', 'timeout')
 * @param odv - User ID
 * @param gameId - Game ID
 * @param sequenceKey - Optional deterministic key (e.g., turn number, timestamp bucket)
 */
function generateEventId(type: string, odv: string, gameId: string, sequenceKey?: string): string {
  // If a sequence key is provided, use it for deterministic ID generation
  if (sequenceKey) {
    return `${type}-${gameId}-${odv}-${sequenceKey}`;
  }
  // For backward compatibility, generate a unique ID (caller should cache and reuse on retries)
  return `${type}-${gameId}-${odv}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function getGameDocRef(gameId: string) {
  return firestore.collection(collections.gameSessions).doc(gameId);
}

// ============================================================================
// Core Game State Operations
// ============================================================================

/**
 * Create a new game with atomic Firestore write
 */
export async function createGame(input: {
  eventId: string;
  spotId: string;
  creatorId: string;
  maxPlayers?: number;
}): Promise<TransitionResult> {
  const { eventId, spotId, creatorId, maxPlayers = 4 } = input;
  const gameId = `game-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  try {
    const now = new Date().toISOString();
    const gameState: GameState = {
      id: gameId,
      spotId,
      creatorId,
      players: [
        {
          odv: creatorId,
          letters: "",
          connected: true,
        },
      ],
      maxPlayers: Math.min(maxPlayers, 8),
      currentTurnIndex: 0,
      currentAction: "set",
      status: "waiting",
      createdAt: now,
      updatedAt: now,
      processedEventIds: [eventId],
    };

    await getGameDocRef(gameId).set(gameState);

    await logServerEvent(creatorId, "game_created", {
      game_id: gameId,
      spot_id: spotId,
    });

    logger.info("[GameState] Game created", { gameId, creatorId, spotId });

    return { success: true, game: gameState };
  } catch (error) {
    logger.error("[GameState] Failed to create game", { error, creatorId, spotId });
    return { success: false, error: "Failed to create game" };
  }
}

/**
 * Join an existing game with transactional update
 */
export async function joinGame(input: {
  eventId: string;
  gameId: string;
  odv: string;
}): Promise<TransitionResult> {
  const { eventId, gameId, odv } = input;

  try {
    const result = await firestore.runTransaction(async (transaction) => {
      const gameRef = getGameDocRef(gameId);
      const gameDoc = await transaction.get(gameRef);

      if (!gameDoc.exists) {
        return { success: false, error: "Game not found" };
      }

      const game = gameDoc.data() as GameState;

      // Check idempotency
      if (game.processedEventIds.includes(eventId)) {
        return { success: true, game, alreadyProcessed: true };
      }

      if (game.status !== "waiting") {
        return { success: false, error: "Game has already started" };
      }

      if (game.players.length >= game.maxPlayers) {
        return { success: false, error: "Game is full" };
      }

      if (game.players.some((p) => p.odv === odv)) {
        return { success: false, error: "Already in game" };
      }

      // Add player
      const updatedPlayers = [...game.players, { odv, letters: "", connected: true }];

      const now = new Date().toISOString();
      const shouldStartGame = updatedPlayers.length >= 2;

      // Keep last N event IDs for idempotency
      const processedEventIds = [...game.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS);

      const updates: Partial<GameState> = {
        players: updatedPlayers,
        updatedAt: now,
        processedEventIds,
        ...(shouldStartGame && {
          status: "active",
          turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS).toISOString(),
        }),
      };

      transaction.update(gameRef, updates);

      const updatedGame: GameState = { ...game, ...updates };
      return { success: true, game: updatedGame };
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
 * Submit a trick with transactional state update
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
    const result = await firestore.runTransaction(async (transaction) => {
      const gameRef = getGameDocRef(gameId);
      const gameDoc = await transaction.get(gameRef);

      if (!gameDoc.exists) {
        return { success: false, error: "Game not found" };
      }

      const game = gameDoc.data() as GameState;

      // Check idempotency
      if (game.processedEventIds.includes(eventId)) {
        return { success: true, game, alreadyProcessed: true };
      }

      if (game.status !== "active") {
        return { success: false, error: "Game is not active" };
      }

      const currentPlayer = game.players[game.currentTurnIndex];
      if (currentPlayer?.odv !== odv) {
        return { success: false, error: "Not your turn" };
      }

      const now = new Date().toISOString();
      let updates: Partial<GameState>;

      if (game.currentAction === "set") {
        // Player is setting the trick - move to attempt phase
        const nextTurnIndex = (game.currentTurnIndex + 1) % game.players.length;

        updates = {
          currentAction: "attempt",
          currentTrick: trickName,
          setterId: odv,
          currentTurnIndex: nextTurnIndex,
          updatedAt: now,
          turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS).toISOString(),
          processedEventIds: [...game.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS),
        };
      } else {
        // Player landed the trick during attempt - move to next player
        let nextTurnIndex = (game.currentTurnIndex + 1) % game.players.length;

        // Skip eliminated players
        let attempts = 0;
        while (
          isEliminated(game.players[nextTurnIndex].letters) &&
          attempts < game.players.length
        ) {
          nextTurnIndex = (nextTurnIndex + 1) % game.players.length;
          attempts++;
        }

        // Check if we've gone through all attempters and need a new setter
        const setterIndex = game.players.findIndex((p) => p.odv === game.setterId);
        const isBackToSetter = nextTurnIndex === setterIndex;

        updates = {
          currentTurnIndex: isBackToSetter
            ? (setterIndex + 1) % game.players.length
            : nextTurnIndex,
          currentAction: isBackToSetter ? "set" : "attempt",
          currentTrick: isBackToSetter ? undefined : game.currentTrick,
          setterId: isBackToSetter ? undefined : game.setterId,
          updatedAt: now,
          turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS).toISOString(),
          processedEventIds: [...game.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS),
        };
      }

      transaction.update(gameRef, updates);

      const updatedGame: GameState = { ...game, ...updates };
      return { success: true, game: updatedGame };
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
    const result = await firestore.runTransaction(async (transaction) => {
      const gameRef = getGameDocRef(gameId);
      const gameDoc = await transaction.get(gameRef);

      if (!gameDoc.exists) {
        return { success: false, error: "Game not found" };
      }

      const game = gameDoc.data() as GameState;

      // Check idempotency
      if (game.processedEventIds.includes(eventId)) {
        return { success: true, game, alreadyProcessed: true };
      }

      if (game.status !== "active") {
        return { success: false, error: "Game is not active" };
      }

      if (game.currentAction !== "attempt") {
        return { success: false, error: "Can only pass during attempt phase" };
      }

      const currentPlayer = game.players[game.currentTurnIndex];
      if (currentPlayer?.odv !== odv) {
        return { success: false, error: "Not your turn" };
      }

      // Add letter to player
      const currentLetters = currentPlayer.letters;
      const newLetters = getNextLetter(currentLetters);
      const playerEliminated = isEliminated(newLetters);

      const updatedPlayers = game.players.map((p) =>
        p.odv === odv ? { ...p, letters: newLetters } : p
      );

      // Check for game over (only one player left)
      const activePlayers = updatedPlayers.filter((p) => !isEliminated(p.letters));

      const now = new Date().toISOString();
      let updates: Partial<GameState>;

      if (activePlayers.length === 1) {
        // Game over!
        updates = {
          players: updatedPlayers,
          status: "completed",
          winnerId: activePlayers[0].odv,
          updatedAt: now,
          turnDeadlineAt: undefined,
          processedEventIds: [...game.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS),
        };
      } else {
        // Move to next player
        let nextTurnIndex = (game.currentTurnIndex + 1) % game.players.length;

        // Skip eliminated players
        let attempts = 0;
        while (
          isEliminated(updatedPlayers[nextTurnIndex].letters) &&
          attempts < game.players.length
        ) {
          nextTurnIndex = (nextTurnIndex + 1) % game.players.length;
          attempts++;
        }

        // Check if we've gone through all attempters
        const setterIndex = game.players.findIndex((p) => p.odv === game.setterId);
        const isBackToSetter = nextTurnIndex === setterIndex;

        if (isBackToSetter) {
          // New round - next person sets
          let newSetterIndex = (setterIndex + 1) % game.players.length;
          while (
            isEliminated(updatedPlayers[newSetterIndex].letters) &&
            attempts < game.players.length
          ) {
            newSetterIndex = (newSetterIndex + 1) % game.players.length;
            attempts++;
          }

          updates = {
            players: updatedPlayers,
            currentTurnIndex: newSetterIndex,
            currentAction: "set",
            currentTrick: undefined,
            setterId: undefined,
            updatedAt: now,
            turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS).toISOString(),
            processedEventIds: [...game.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS),
          };
        } else {
          updates = {
            players: updatedPlayers,
            currentTurnIndex: nextTurnIndex,
            updatedAt: now,
            turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS).toISOString(),
            processedEventIds: [...game.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS),
          };
        }
      }

      transaction.update(gameRef, updates);

      const updatedGame: GameState = { ...game, ...updates };
      return {
        success: true,
        game: updatedGame,
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
    const result = await firestore.runTransaction(async (transaction) => {
      const gameRef = getGameDocRef(gameId);
      const gameDoc = await transaction.get(gameRef);

      if (!gameDoc.exists) {
        return { success: false, error: "Game not found" };
      }

      const game = gameDoc.data() as GameState;

      // Check idempotency
      if (game.processedEventIds.includes(eventId)) {
        return { success: true, game, alreadyProcessed: true };
      }

      // Only process if game is active
      if (game.status !== "active" && game.status !== "paused") {
        return { success: true, game }; // No action needed for waiting/completed
      }

      const playerIndex = game.players.findIndex((p) => p.odv === odv);
      if (playerIndex === -1) {
        return { success: false, error: "Player not in game" };
      }

      const now = new Date().toISOString();
      const updatedPlayers = game.players.map((p) =>
        p.odv === odv ? { ...p, connected: false, disconnectedAt: now } : p
      );

      // Pause the game if it was active
      const updates: Partial<GameState> = {
        players: updatedPlayers,
        status: game.status === "active" ? "paused" : game.status,
        pausedAt: game.status === "active" ? now : game.pausedAt,
        updatedAt: now,
        processedEventIds: [...game.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS),
      };

      transaction.update(gameRef, updates);

      const updatedGame: GameState = { ...game, ...updates };
      return { success: true, game: updatedGame };
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
    const result = await firestore.runTransaction(async (transaction) => {
      const gameRef = getGameDocRef(gameId);
      const gameDoc = await transaction.get(gameRef);

      if (!gameDoc.exists) {
        return { success: false, error: "Game not found" };
      }

      const game = gameDoc.data() as GameState;

      // Check idempotency
      if (game.processedEventIds.includes(eventId)) {
        return { success: true, game, alreadyProcessed: true };
      }

      const playerIndex = game.players.findIndex((p) => p.odv === odv);
      if (playerIndex === -1) {
        return { success: false, error: "Player not in game" };
      }

      const now = new Date().toISOString();
      const updatedPlayers = game.players.map((p) =>
        p.odv === odv ? { ...p, connected: true, disconnectedAt: undefined } : p
      );

      // Check if all players are now connected
      const allConnected = updatedPlayers.every((p) => p.connected);

      const updates: Partial<GameState> = {
        players: updatedPlayers,
        status: allConnected && game.status === "paused" ? "active" : game.status,
        pausedAt: allConnected ? undefined : game.pausedAt,
        updatedAt: now,
        turnDeadlineAt:
          allConnected && game.status === "paused"
            ? new Date(Date.now() + TURN_TIMEOUT_MS).toISOString()
            : game.turnDeadlineAt,
        processedEventIds: [...game.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS),
      };

      transaction.update(gameRef, updates);

      const updatedGame: GameState = { ...game, ...updates };
      return { success: true, game: updatedGame };
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
    const result = await firestore.runTransaction(async (transaction) => {
      const gameRef = getGameDocRef(gameId);
      const gameDoc = await transaction.get(gameRef);

      if (!gameDoc.exists) {
        return { success: false, error: "Game not found" };
      }

      const game = gameDoc.data() as GameState;

      // Check idempotency
      if (game.processedEventIds.includes(eventId)) {
        return { success: true, game, alreadyProcessed: true };
      }

      if (game.status === "completed") {
        return { success: false, error: "Game already completed" };
      }

      const playerIndex = game.players.findIndex((p) => p.odv === odv);
      if (playerIndex === -1) {
        return { success: false, error: "Player not in game" };
      }

      // Find winner (any other active player)
      const activePlayers = game.players.filter((p) => p.odv !== odv && !isEliminated(p.letters));
      const winnerId = activePlayers[0]?.odv;

      const now = new Date().toISOString();
      const updates: Partial<GameState> = {
        status: "completed",
        winnerId,
        updatedAt: now,
        turnDeadlineAt: undefined,
        processedEventIds: [...game.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS),
      };

      transaction.update(gameRef, updates);

      const updatedGame: GameState = { ...game, ...updates };
      return { success: true, game: updatedGame };
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
    const doc = await getGameDocRef(gameId).get();
    if (!doc.exists) {
      return null;
    }
    return doc.data() as GameState;
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
    const now = new Date();
    const nowISO = now.toISOString();

    // Find games with expired turn deadlines
    const activeGamesQuery = await firestore
      .collection(collections.gameSessions)
      .where("status", "==", "active")
      .where("turnDeadlineAt", "<", nowISO)
      .get();

    for (const doc of activeGamesQuery.docs) {
      const game = doc.data() as GameState;

      // During attempt phase, timeout means defender wins (they don't get a letter)
      // The setter's trick is invalidated - new round starts
      if (game.currentAction === "attempt") {
        // Move to next setter without giving anyone a letter
        const result = await firestore.runTransaction(async (transaction) => {
          const gameRef = getGameDocRef(game.id);
          const freshDoc = await transaction.get(gameRef);
          if (!freshDoc.exists) return null;

          const freshGame = freshDoc.data() as GameState;

          // Verify game is still active and deadline hasn't changed
          if (freshGame.status !== "active") return null;
          if (!freshGame.turnDeadlineAt || new Date(freshGame.turnDeadlineAt) >= now) return null;
          if (freshGame.currentAction !== "attempt") return null;

          // Derive eventId from fresh state to ensure consistency
          const freshPlayer = freshGame.players[freshGame.currentTurnIndex];
          if (!freshPlayer) return null;

          const sequenceKey = `deadline-${freshGame.turnDeadlineAt}`;
          const eventId = generateEventId("timeout", freshPlayer.odv, freshGame.id, sequenceKey);

          // Check idempotency
          if (freshGame.processedEventIds.includes(eventId)) return null;

          // Find next setter (skip eliminated players)
          const setterIndex = freshGame.players.findIndex((p) => p.odv === freshGame.setterId);
          let newSetterIndex = (setterIndex + 1) % freshGame.players.length;
          let attempts = 0;
          while (
            isEliminated(freshGame.players[newSetterIndex].letters) &&
            attempts < freshGame.players.length
          ) {
            newSetterIndex = (newSetterIndex + 1) % freshGame.players.length;
            attempts++;
          }

          transaction.update(gameRef, {
            currentTurnIndex: newSetterIndex,
            currentAction: "set",
            currentTrick: undefined,
            setterId: undefined,
            updatedAt: nowISO,
            turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS).toISOString(),
            processedEventIds: [...freshGame.processedEventIds, eventId].slice(
              -MAX_PROCESSED_EVENTS
            ),
          });

          return { timedOutPlayer: freshPlayer.odv };
        });

        if (result) {
          logger.info("[GameState] Turn timeout - defender wins round", {
            gameId: game.id,
            timedOutPlayer: result.timedOutPlayer,
          });
        }
      } else {
        // Set phase timeout - forfeit the game
        // Need to verify fresh state and generate eventId inside forfeitGame transaction
        const result = await firestore.runTransaction(async (transaction) => {
          const gameRef = getGameDocRef(game.id);
          const freshDoc = await transaction.get(gameRef);
          if (!freshDoc.exists) return null;

          const freshGame = freshDoc.data() as GameState;

          // Verify game state hasn't changed
          if (freshGame.status !== "active") return null;
          if (!freshGame.turnDeadlineAt || new Date(freshGame.turnDeadlineAt) >= now) return null;
          if (freshGame.currentAction !== "set") return null;

          const freshPlayer = freshGame.players[freshGame.currentTurnIndex];
          if (!freshPlayer) return null;

          // Derive eventId from fresh state
          const sequenceKey = `deadline-${freshGame.turnDeadlineAt}`;
          const eventId = generateEventId("timeout", freshPlayer.odv, freshGame.id, sequenceKey);

          // Check idempotency
          if (freshGame.processedEventIds.includes(eventId)) return null;

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
    const pausedGamesQuery = await firestore
      .collection(collections.gameSessions)
      .where("status", "==", "paused")
      .get();

    for (const doc of pausedGamesQuery.docs) {
      const game = doc.data() as GameState;

      // Check each disconnected player
      for (const player of game.players) {
        if (!player.connected && player.disconnectedAt) {
          const disconnectedTime = new Date(player.disconnectedAt).getTime();
          const elapsed = now.getTime() - disconnectedTime;

          if (elapsed > RECONNECT_WINDOW_MS) {
            // Verify fresh state before forfeiting
            const result = await firestore.runTransaction(async (transaction) => {
              const gameRef = getGameDocRef(game.id);
              const freshDoc = await transaction.get(gameRef);
              if (!freshDoc.exists) return null;

              const freshGame = freshDoc.data() as GameState;

              // Verify player is still disconnected with same disconnectedAt timestamp
              const freshPlayer = freshGame.players.find((p) => p.odv === player.odv);
              if (
                !freshPlayer ||
                freshPlayer.connected ||
                freshPlayer.disconnectedAt !== player.disconnectedAt
              ) {
                return null;
              }

              // Derive eventId from fresh state
              const sequenceKey = `disconnected-${freshPlayer.disconnectedAt}`;
              const eventId = generateEventId(
                "disconnect_timeout",
                freshPlayer.odv,
                freshGame.id,
                sequenceKey
              );

              // Check idempotency (forfeitGame will also check, but this avoids unnecessary call)
              if (freshGame.processedEventIds.includes(eventId)) return null;

              return { eventId, odv: freshPlayer.odv };
            });

            if (result) {
              await forfeitGame({
                eventId: result.eventId,
                gameId: game.id,
                odv: result.odv,
                reason: "disconnect_timeout",
              });
              break; // Only process one forfeit per game
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
    await getGameDocRef(gameId).delete();
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
