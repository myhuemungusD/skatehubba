/**
 * GameService — Game Loop Actions (State Machine)
 *
 * Implements SET, LAND, BAIL, FORFEIT actions and setter-miss rule.
 * All mutations use atomic Firestore transactions.
 */

import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { COLLECTIONS, MAX_LETTERS } from "./constants";
import type { GameAction, GameDocument } from "./types";

/**
 * Submit a game action (SET, LAND, BAIL, FORFEIT).
 * Enforces turn strictness and game rules.
 */
export async function submitAction(
  gameId: string,
  action: GameAction,
  payload?: { trickName?: string; trickDescription?: string }
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Unauthorized");

  const userId = currentUser.uid;

  await runTransaction(db, async (transaction) => {
    const gameRef = doc(db, COLLECTIONS.GAMES, gameId);
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists()) throw new Error("Game not found");

    const game = { id: gameDoc.id, ...gameDoc.data() } as GameDocument;
    const { state, players } = game;

    // Validate game is active
    if (state.status !== "ACTIVE") {
      throw new Error("Game is not active");
    }

    // Validate player is in game
    if (!players.includes(userId)) {
      throw new Error("You are not in this game");
    }

    const isPlayer1 = players[0] === userId;
    const opponentId = isPlayer1 ? players[1] : players[0];

    // ===== ACTION: SET A TRICK =====
    if (action === "SET") {
      // Must be the setter's turn in SETTER_RECORDING phase
      if (state.phase !== "SETTER_RECORDING") {
        throw new Error("Not in setting phase");
      }
      if (state.turnPlayerId !== userId) {
        throw new Error("Not your turn to set");
      }
      if (!payload?.trickName) {
        throw new Error("Trick name required");
      }

      transaction.update(gameRef, {
        "state.phase": "DEFENDER_ATTEMPTING",
        "state.currentTrick": {
          name: payload.trickName,
          description: payload.trickDescription || null,
          setterId: userId,
          setAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });
    }

    // ===== ACTION: LAND THE TRICK =====
    else if (action === "LAND") {
      // Must be defender's turn in DEFENDER_ATTEMPTING phase
      if (state.phase !== "DEFENDER_ATTEMPTING") {
        throw new Error("Not in defending phase");
      }
      if (state.turnPlayerId === userId) {
        throw new Error("Defender must attempt, not setter");
      }

      // Defender landed it - setter continues to set
      // (Traditional SKATE rules: if defender lands, setter keeps setting)
      transaction.update(gameRef, {
        "state.phase": "SETTER_RECORDING",
        "state.currentTrick": null,
        "state.roundNumber": increment(1),
        updatedAt: serverTimestamp(),
      });
    }

    // ===== ACTION: BAIL (MISS) =====
    else if (action === "BAIL") {
      // Must be defender's turn in DEFENDER_ATTEMPTING phase
      if (state.phase !== "DEFENDER_ATTEMPTING") {
        throw new Error("Not in defending phase");
      }
      if (state.turnPlayerId === userId) {
        throw new Error("Defender must bail, not setter");
      }

      // Defender missed - they get a letter
      const letterField = isPlayer1 ? "state.p1Letters" : "state.p2Letters";
      const currentLetters = isPlayer1 ? state.p1Letters : state.p2Letters;
      const newLetterCount = currentLetters + 1;

      // Check for game over (S-K-A-T-E = 5 letters)
      if (newLetterCount >= MAX_LETTERS) {
        // Game over - setter wins
        transaction.update(gameRef, {
          "state.status": "COMPLETED",
          "state.phase": "VERIFICATION",
          [letterField]: MAX_LETTERS,
          "state.currentTrick": null,
          winnerId: state.turnPlayerId, // The setter wins
          updatedAt: serverTimestamp(),
        });
      } else {
        // Defender takes a letter, setter keeps control
        // (Berrics rules: if defender misses, setter sets again)
        transaction.update(gameRef, {
          [letterField]: increment(1),
          "state.phase": "SETTER_RECORDING",
          "state.currentTrick": null,
          "state.roundNumber": increment(1),
          updatedAt: serverTimestamp(),
        });
      }
    }

    // ===== ACTION: FORFEIT =====
    else if (action === "FORFEIT") {
      // Either player can forfeit at any time
      transaction.update(gameRef, {
        "state.status": "CANCELLED",
        "state.currentTrick": null,
        winnerId: opponentId, // Other player wins by default
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/**
 * Alternative: Setter missed their own trick attempt.
 * In traditional rules, if setter can't land what they set,
 * defender becomes the new setter.
 */
export async function setterMissed(gameId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Unauthorized");

  const userId = currentUser.uid;

  await runTransaction(db, async (transaction) => {
    const gameRef = doc(db, COLLECTIONS.GAMES, gameId);
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists()) throw new Error("Game not found");

    const game = { id: gameDoc.id, ...gameDoc.data() } as GameDocument;
    const { state, players } = game;

    if (state.status !== "ACTIVE") {
      throw new Error("Game is not active");
    }

    // Must be the setter making this call
    if (state.turnPlayerId !== userId) {
      throw new Error("Only setter can declare a miss");
    }

    // Only valid during defending phase (setter tried to prove it)
    if (state.phase !== "DEFENDER_ATTEMPTING") {
      throw new Error("Can only miss during defend phase");
    }

    // Swap turns - defender becomes setter
    const opponentId = players[0] === userId ? players[1] : players[0];

    transaction.update(gameRef, {
      "state.turnPlayerId": opponentId,
      "state.phase": "SETTER_RECORDING",
      "state.currentTrick": null,
      "state.roundNumber": increment(1),
      updatedAt: serverTimestamp(),
    });
  });
}
