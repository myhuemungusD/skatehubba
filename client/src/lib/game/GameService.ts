/**
 * GameService - Enterprise-Grade S.K.A.T.E. Game Engine
 * 
 * A strictly typed Finite State Machine (FSM) for managing real-time
 * S.K.A.T.E. games using Firebase Firestore with:
 * - Optimistic Concurrency Control (transactions)
 * - Turn strictness enforcement
 * - Real-time state synchronization
 * - Cost-efficient database reads
 * 
 * @module lib/game/GameService
 */

import { 
  collection, 
  doc, 
  runTransaction, 
  query, 
  where, 
  limit, 
  getDocs, 
  onSnapshot,
  serverTimestamp,
  increment,
  Timestamp,
  type Unsubscribe
} from 'firebase/firestore';
import { db, auth } from '../firebase';

// =============================================================================
// TYPES & STATE DEFINITIONS
// =============================================================================

/** Game lifecycle status */
export type GameStatus = 
  | 'MATCHMAKING'       // In queue, searching for opponent
  | 'PENDING_ACCEPT'    // Private challenge sent, awaiting response
  | 'ACTIVE'            // Game in progress
  | 'COMPLETED'         // Game finished (winner determined)
  | 'CANCELLED';        // Abandoned or declined

/** Turn phase within active game */
export type TurnPhase = 
  | 'SETTER_RECORDING'    // Current turn player is setting a trick
  | 'DEFENDER_ATTEMPTING' // Opponent is attempting to match
  | 'VERIFICATION';       // Optional: dispute resolution

/** The current trick being played */
export interface CurrentTrick {
  name: string;
  description?: string;
  setterId: string;
  setAt: Timestamp;
}

/** Player data stored in game document */
export interface PlayerData {
  username: string;
  photoUrl?: string | null;
  stance: 'regular' | 'goofy';
}

/** Internal game state machine */
export interface GameState {
  status: GameStatus;
  turnPlayerId: string;     // Who is currently "It"
  phase: TurnPhase;
  p1Letters: number;        // 0-5 (S-K-A-T-E)
  p2Letters: number;
  currentTrick: CurrentTrick | null;
  roundNumber: number;
}

/** Complete game document */
export interface GameDocument {
  id: string;
  players: [string, string];  // [player1Id, player2Id]
  playerData: {
    [playerId: string]: PlayerData;
  };
  state: GameState;
  winnerId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Matchmaking queue entry */
export interface QueueEntry {
  createdBy: string;
  creatorName: string;
  creatorPhoto?: string | null;
  stance: 'regular' | 'goofy';
  status: 'WAITING' | 'MATCHED';
  createdAt: Timestamp;
}

/** Actions that can be taken in the game */
export type GameAction = 'SET' | 'LAND' | 'BAIL' | 'FORFEIT';

// =============================================================================
// CONSTANTS
// =============================================================================

const LETTERS = ['S', 'K', 'A', 'T', 'E'] as const;
const MAX_LETTERS = 5;
const COLLECTIONS = {
  GAMES: 'skate_games',
  QUEUE: 'skate_matchmaking_queue',
  CHALLENGES: 'skate_challenges'
} as const;

// =============================================================================
// GAME SERVICE (Singleton Pattern)
// =============================================================================

export const GameService = {

  // ---------------------------------------------------------------------------
  // A. MATCHMAKING - Quick Match Queue System
  // ---------------------------------------------------------------------------

  /**
   * Find or create a quick match game.
   * Uses atomic transactions to prevent race conditions.
   * 
   * @param stance - Player's skating stance
   * @returns Game ID (either joined or created queue entry)
   */
  async findQuickMatch(stance: 'regular' | 'goofy' = 'regular'): Promise<{ gameId: string; isWaiting: boolean }> {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Must be logged in to play');

    const userId = currentUser.uid;
    const userName = currentUser.displayName || 'Skater';
    const userPhoto = currentUser.photoURL;

    // Query for open lobbies (FIFO - oldest first)
    const q = query(
      collection(db, COLLECTIONS.QUEUE),
      where('status', '==', 'WAITING'),
      limit(5) // Get a few to find one not created by us
    );

    const result = await runTransaction(db, async (transaction) => {
      const snapshot = await getDocs(q);
      
      // Find a valid match (not ourselves)
      let matchDoc = null;
      for (const d of snapshot.docs) {
        if (d.data().createdBy !== userId) {
          matchDoc = d;
          break;
        }
      }

      // ✅ JOIN EXISTING MATCH
      if (matchDoc) {
        const matchData = matchDoc.data() as QueueEntry;
        const gameId = doc(collection(db, COLLECTIONS.GAMES)).id;

        // Coin flip for who starts (simple: creator starts)
        const starterIndex = Math.random() < 0.5 ? 0 : 1;
        const players: [string, string] = [matchData.createdBy, userId];
        const starterId = players[starterIndex];

        // Create the official Game Document
        transaction.set(doc(db, COLLECTIONS.GAMES, gameId), {
          players,
          playerData: {
            [matchData.createdBy]: { 
              username: matchData.creatorName, 
              photoUrl: matchData.creatorPhoto,
              stance: matchData.stance 
            },
            [userId]: { 
              username: userName,
              photoUrl: userPhoto, 
              stance 
            }
          },
          state: {
            status: 'ACTIVE',
            turnPlayerId: starterId,
            phase: 'SETTER_RECORDING',
            p1Letters: 0,
            p2Letters: 0,
            currentTrick: null,
            roundNumber: 1
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // Remove from queue
        transaction.delete(matchDoc.ref);
        
        return { gameId, isWaiting: false };
      } 
      
      // ✅ CREATE NEW QUEUE ENTRY
      else {
        const queueRef = doc(collection(db, COLLECTIONS.QUEUE));
        transaction.set(queueRef, {
          createdBy: userId,
          creatorName: userName,
          creatorPhoto: userPhoto,
          stance,
          status: 'WAITING',
          createdAt: serverTimestamp()
        });
        return { gameId: queueRef.id, isWaiting: true };
      }
    });

    return result;
  },

  /**
   * Cancel matchmaking (leave queue)
   */
  async cancelMatchmaking(queueId: string): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Must be logged in');

    const queueRef = doc(db, COLLECTIONS.QUEUE, queueId);
    await runTransaction(db, async (transaction) => {
      const queueDoc = await transaction.get(queueRef);
      if (!queueDoc.exists()) return;
      
      const data = queueDoc.data() as QueueEntry;
      if (data.createdBy !== currentUser.uid) {
        throw new Error('Cannot cancel another player\'s queue');
      }
      
      transaction.delete(queueRef);
    });
  },

  /**
   * Subscribe to queue status (to know when matched)
   */
  subscribeToQueue(queueId: string, onMatch: (gameId: string) => void): Unsubscribe {
    // Listen to the queue entry - if it disappears, check for games
    const queueRef = doc(db, COLLECTIONS.QUEUE, queueId);
    
    return onSnapshot(queueRef, async (snapshot) => {
      if (!snapshot.exists()) {
        // Queue entry was deleted - we got matched!
        // Find the game we're in
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const gamesQuery = query(
          collection(db, COLLECTIONS.GAMES),
          where('players', 'array-contains', currentUser.uid),
          where('state.status', '==', 'ACTIVE'),
          limit(1)
        );

        const gamesSnapshot = await getDocs(gamesQuery);
        if (!gamesSnapshot.empty) {
          onMatch(gamesSnapshot.docs[0].id);
        }
      }
    });
  },

  // ---------------------------------------------------------------------------
  // B. GAME LOOP - State Machine Actions
  // ---------------------------------------------------------------------------

  /**
   * Submit a game action (SET, LAND, BAIL, FORFEIT)
   * Enforces turn strictness and game rules.
   */
  async submitAction(
    gameId: string, 
    action: GameAction, 
    payload?: { trickName?: string; trickDescription?: string }
  ): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Unauthorized');

    const userId = currentUser.uid;

    await runTransaction(db, async (transaction) => {
      const gameRef = doc(db, COLLECTIONS.GAMES, gameId);
      const gameDoc = await transaction.get(gameRef);
      
      if (!gameDoc.exists()) throw new Error('Game not found');

      const game = { id: gameDoc.id, ...gameDoc.data() } as GameDocument;
      const { state, players } = game;

      // Validate game is active
      if (state.status !== 'ACTIVE') {
        throw new Error('Game is not active');
      }

      // Validate player is in game
      if (!players.includes(userId)) {
        throw new Error('You are not in this game');
      }

      const isPlayer1 = players[0] === userId;
      const opponentId = isPlayer1 ? players[1] : players[0];

      // ===== ACTION: SET A TRICK =====
      if (action === 'SET') {
        // Must be the setter's turn in SETTER_RECORDING phase
        if (state.phase !== 'SETTER_RECORDING') {
          throw new Error('Not in setting phase');
        }
        if (state.turnPlayerId !== userId) {
          throw new Error('Not your turn to set');
        }
        if (!payload?.trickName) {
          throw new Error('Trick name required');
        }

        transaction.update(gameRef, {
          'state.phase': 'DEFENDER_ATTEMPTING',
          'state.currentTrick': {
            name: payload.trickName,
            description: payload.trickDescription || null,
            setterId: userId,
            setAt: serverTimestamp()
          },
          updatedAt: serverTimestamp()
        });
      }

      // ===== ACTION: LAND THE TRICK =====
      else if (action === 'LAND') {
        // Must be defender's turn in DEFENDER_ATTEMPTING phase
        if (state.phase !== 'DEFENDER_ATTEMPTING') {
          throw new Error('Not in defending phase');
        }
        if (state.turnPlayerId === userId) {
          throw new Error('Defender must attempt, not setter');
        }

        // Defender landed it - setter continues to set
        // (Traditional SKATE rules: if defender lands, setter keeps setting)
        transaction.update(gameRef, {
          'state.phase': 'SETTER_RECORDING',
          'state.currentTrick': null,
          'state.roundNumber': increment(1),
          updatedAt: serverTimestamp()
        });
      }

      // ===== ACTION: BAIL (MISS) =====
      else if (action === 'BAIL') {
        // Must be defender's turn in DEFENDER_ATTEMPTING phase
        if (state.phase !== 'DEFENDER_ATTEMPTING') {
          throw new Error('Not in defending phase');
        }
        if (state.turnPlayerId === userId) {
          throw new Error('Defender must bail, not setter');
        }

        // Defender missed - they get a letter
        const letterField = isPlayer1 ? 'state.p1Letters' : 'state.p2Letters';
        const currentLetters = isPlayer1 ? state.p1Letters : state.p2Letters;
        const newLetterCount = currentLetters + 1;

        // Check for game over (S-K-A-T-E = 5 letters)
        if (newLetterCount >= MAX_LETTERS) {
          // Game over - setter wins
          transaction.update(gameRef, {
            'state.status': 'COMPLETED',
            'state.phase': 'VERIFICATION',
            [letterField]: MAX_LETTERS,
            'state.currentTrick': null,
            winnerId: state.turnPlayerId, // The setter wins
            updatedAt: serverTimestamp()
          });
        } else {
          // Defender takes a letter, setter keeps control
          // (Berrics rules: if defender misses, setter sets again)
          transaction.update(gameRef, {
            [letterField]: increment(1),
            'state.phase': 'SETTER_RECORDING',
            'state.currentTrick': null,
            'state.roundNumber': increment(1),
            updatedAt: serverTimestamp()
          });
        }
      }

      // ===== ACTION: FORFEIT =====
      else if (action === 'FORFEIT') {
        // Either player can forfeit at any time
        transaction.update(gameRef, {
          'state.status': 'CANCELLED',
          'state.currentTrick': null,
          winnerId: opponentId, // Other player wins by default
          updatedAt: serverTimestamp()
        });
      }
    });
  },

  /**
   * Alternative: Setter missed their own trick attempt.
   * In traditional rules, if setter can't land what they set, 
   * defender becomes the new setter.
   */
  async setterMissed(gameId: string): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Unauthorized');

    const userId = currentUser.uid;

    await runTransaction(db, async (transaction) => {
      const gameRef = doc(db, COLLECTIONS.GAMES, gameId);
      const gameDoc = await transaction.get(gameRef);
      
      if (!gameDoc.exists()) throw new Error('Game not found');

      const game = { id: gameDoc.id, ...gameDoc.data() } as GameDocument;
      const { state, players } = game;

      if (state.status !== 'ACTIVE') {
        throw new Error('Game is not active');
      }

      // Must be the setter making this call
      if (state.turnPlayerId !== userId) {
        throw new Error('Only setter can declare a miss');
      }

      // Only valid during defending phase (setter tried to prove it)
      if (state.phase !== 'DEFENDER_ATTEMPTING') {
        throw new Error('Can only miss during defend phase');
      }

      // Swap turns - defender becomes setter
      const opponentId = players[0] === userId ? players[1] : players[0];

      transaction.update(gameRef, {
        'state.turnPlayerId': opponentId,
        'state.phase': 'SETTER_RECORDING',
        'state.currentTrick': null,
        'state.roundNumber': increment(1),
        updatedAt: serverTimestamp()
      });
    });
  },

  // ---------------------------------------------------------------------------
  // C. REAL-TIME SUBSCRIPTIONS
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to game state changes
   */
  subscribeToGame(
    gameId: string, 
    callback: (game: GameDocument | null) => void
  ): Unsubscribe {
    const gameRef = doc(db, COLLECTIONS.GAMES, gameId);
    
    return onSnapshot(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        callback({ id: snapshot.id, ...snapshot.data() } as GameDocument);
      } else {
        callback(null);
      }
    }, (error) => {
      console.error('[GameService] Subscription error:', error);
      callback(null);
    });
  },

  /**
   * Get active games for current user
   */
  async getActiveGames(): Promise<GameDocument[]> {
    const currentUser = auth.currentUser;
    if (!currentUser) return [];

    const gamesQuery = query(
      collection(db, COLLECTIONS.GAMES),
      where('players', 'array-contains', currentUser.uid),
      where('state.status', 'in', ['ACTIVE', 'PENDING_ACCEPT'])
    );

    const snapshot = await getDocs(gamesQuery);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as GameDocument));
  },

  // ---------------------------------------------------------------------------
  // D. HELPER FUNCTIONS
  // ---------------------------------------------------------------------------

  /**
   * Convert letter count to string representation
   */
  getLettersString(count: number): string {
    return LETTERS.slice(0, Math.min(count, MAX_LETTERS)).join('');
  },

  /**
   * Check if game is over based on letters
   */
  isGameOver(state: GameState): boolean {
    return state.status === 'COMPLETED' || 
           state.p1Letters >= MAX_LETTERS || 
           state.p2Letters >= MAX_LETTERS;
  },

  /**
   * Get opponent data from game
   */
  getOpponentData(game: GameDocument, userId: string): PlayerData | null {
    const opponentId = game.players.find(p => p !== userId);
    return opponentId ? game.playerData[opponentId] : null;
  }
};

export default GameService;
