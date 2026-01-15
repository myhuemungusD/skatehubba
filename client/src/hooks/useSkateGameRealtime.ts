/**
 * useSkateGameRealtime - Enterprise-Grade S.K.A.T.E. Game Hook
 * 
 * Real-time game state management using Firestore snapshots
 * instead of REST API polling. Provides instant updates with
 * optimistic UI and strict type safety.
 * 
 * @module hooks/useSkateGameRealtime
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from './use-toast';
import { 
  GameService, 
  type GameDocument,
  type TurnPhase 
} from '../lib/game';

// =============================================================================
// TYPES
// =============================================================================

interface GameUIState {
  isMyTurn: boolean;
  isOffense: boolean;       // True = I'm the setter, False = I'm defending
  myLetters: number;
  oppLetters: number;
  myLettersStr: string;
  oppLettersStr: string;
  opponentName: string;
  opponentPhoto: string | null;
  currentTrickName: string | null;
  currentTrickDescription: string | null;
  phase: TurnPhase;
  winnerId: string | null;
  isGameOver: boolean;
  iWon: boolean;
}

interface MatchmakingState {
  isSearching: boolean;
  queueId: string | null;
}

// =============================================================================
// HOOK: useSkateGameRealtime
// =============================================================================

export function useSkateGameRealtime(gameId: string | null, userId: string | undefined) {
  const { toast } = useToast();
  
  // Local state
  const [game, setGame] = useState<GameDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);

  // ---------------------------------------------------------------------------
  // REAL-TIME SUBSCRIPTION
  // ---------------------------------------------------------------------------
  
  useEffect(() => {
    if (!gameId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Subscribe to game document (real-time updates)
    const unsubscribe = GameService.subscribeToGame(gameId, (gameDoc) => {
      setIsLoading(false);
      
      if (gameDoc) {
        setGame(gameDoc);
        setError(null);
      } else {
        setError('Game not found');
        setGame(null);
      }
    });

    return () => unsubscribe();
  }, [gameId]);

  // ---------------------------------------------------------------------------
  // DERIVED STATE (computed from game doc)
  // ---------------------------------------------------------------------------
  
  const gameUIState: GameUIState = useMemo(() => {
    const defaultState: GameUIState = {
      isMyTurn: false,
      isOffense: false,
      myLetters: 0,
      oppLetters: 0,
      myLettersStr: '',
      oppLettersStr: '',
      opponentName: 'Opponent',
      opponentPhoto: null,
      currentTrickName: null,
      currentTrickDescription: null,
      phase: 'SETTER_RECORDING',
      winnerId: null,
      isGameOver: false,
      iWon: false
    };

    if (!game || !userId) return defaultState;

    const { state, players, playerData, winnerId } = game;
    const isP1 = players[0] === userId;
    const opponentId = isP1 ? players[1] : players[0];

    const isMyTurn = state.turnPlayerId === userId;
    const isOffense = isMyTurn && state.phase === 'SETTER_RECORDING';

    const myLetters = isP1 ? state.p1Letters : state.p2Letters;
    const oppLetters = isP1 ? state.p2Letters : state.p1Letters;

    return {
      isMyTurn,
      isOffense,
      myLetters,
      oppLetters,
      myLettersStr: GameService.getLettersString(myLetters),
      oppLettersStr: GameService.getLettersString(oppLetters),
      opponentName: playerData[opponentId]?.username || 'Opponent',
      opponentPhoto: playerData[opponentId]?.photoUrl || null,
      currentTrickName: state.currentTrick?.name || null,
      currentTrickDescription: state.currentTrick?.description || null,
      phase: state.phase,
      winnerId: winnerId || null,
      isGameOver: GameService.isGameOver(state),
      iWon: winnerId === userId
    };
  }, [game, userId]);

  // ---------------------------------------------------------------------------
  // GAME ACTIONS
  // ---------------------------------------------------------------------------

  /**
   * Set a trick (setter action)
   */
  const setTrick = useCallback(async (trickName: string, description?: string) => {
    if (!gameId || !userId) return;
    
    setIsActionPending(true);
    try {
      await GameService.submitAction(gameId, 'SET', { 
        trickName, 
        trickDescription: description 
      });
      
      toast({
        title: "Trick Set! 🛹",
        description: `You set: ${trickName}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set trick';
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setIsActionPending(false);
    }
  }, [gameId, userId, toast]);

  /**
   * Land the trick (defender action)
   */
  const landTrick = useCallback(async () => {
    if (!gameId || !userId) return;
    
    setIsActionPending(true);
    try {
      await GameService.submitAction(gameId, 'LAND');
      
      toast({
        title: "LANDED! 🎯",
        description: "Clean! You matched the trick.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to land trick';
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setIsActionPending(false);
    }
  }, [gameId, userId, toast]);

  /**
   * Bail on the trick (defender action - takes a letter)
   */
  const bail = useCallback(async () => {
    if (!gameId || !userId) return;
    
    setIsActionPending(true);
    try {
      await GameService.submitAction(gameId, 'BAIL');
      
      // Letter will be reflected in state via subscription
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit bail';
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setIsActionPending(false);
    }
  }, [gameId, userId, toast]);

  /**
   * Forfeit the game
   */
  const forfeit = useCallback(async () => {
    if (!gameId || !userId) return;
    
    setIsActionPending(true);
    try {
      await GameService.submitAction(gameId, 'FORFEIT');
      
      toast({
        title: "Game Forfeit",
        description: "You left the game.",
        variant: "destructive"
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to forfeit';
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setIsActionPending(false);
    }
  }, [gameId, userId, toast]);

  /**
   * Setter missed their own trick (swap turns)
   */
  const setterMissed = useCallback(async () => {
    if (!gameId || !userId) return;
    
    setIsActionPending(true);
    try {
      await GameService.setterMissed(gameId);
      
      toast({
        title: "Oops!",
        description: "You couldn't land your own trick. Turn swapped.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit';
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setIsActionPending(false);
    }
  }, [gameId, userId, toast]);

  return {
    // Game data
    game,
    isLoading,
    error,
    
    // Computed UI state
    ...gameUIState,
    
    // Actions
    setTrick,
    landTrick,
    bail,
    forfeit,
    setterMissed,
    isActionPending,
  };
}

// =============================================================================
// HOOK: useMatchmaking
// =============================================================================

export function useMatchmaking() {
  const { toast } = useToast();
  
  const [state, setState] = useState<MatchmakingState>({
    isSearching: false,
    queueId: null
  });
  const [matchedGameId, setMatchedGameId] = useState<string | null>(null);

  /**
   * Start searching for a quick match
   */
  const startMatchmaking = useCallback(async (stance: 'regular' | 'goofy' = 'regular') => {
    setState({ isSearching: true, queueId: null });
    setMatchedGameId(null);

    try {
      const result = await GameService.findQuickMatch(stance);
      
      if (!result.isWaiting) {
        // Immediately matched!
        setMatchedGameId(result.gameId);
        setState({ isSearching: false, queueId: null });
        
        toast({
          title: "Match Found! 🎮",
          description: "Game starting...",
        });
      } else {
        // In queue, waiting
        setState({ isSearching: true, queueId: result.gameId });
        
        toast({
          title: "Searching...",
          description: "Looking for an opponent",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Matchmaking failed';
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
      setState({ isSearching: false, queueId: null });
    }
  }, [toast]);

  /**
   * Cancel matchmaking
   */
  const cancelMatchmaking = useCallback(async () => {
    if (!state.queueId) return;
    
    try {
      await GameService.cancelMatchmaking(state.queueId);
      setState({ isSearching: false, queueId: null });
      
      toast({
        title: "Cancelled",
        description: "Left the queue",
      });
    } catch (err) {
      console.error('Failed to cancel matchmaking:', err);
    }
  }, [state.queueId, toast]);

  // Subscribe to queue updates when waiting
  useEffect(() => {
    if (!state.queueId || !state.isSearching) return;

    const unsubscribe = GameService.subscribeToQueue(state.queueId, (gameId) => {
      setMatchedGameId(gameId);
      setState({ isSearching: false, queueId: null });
      
      toast({
        title: "Opponent Found! 🎮",
        description: "Starting the game...",
      });
    });

    return () => unsubscribe();
  }, [state.queueId, state.isSearching, toast]);

  return {
    isSearching: state.isSearching,
    queueId: state.queueId,
    matchedGameId,
    startMatchmaking,
    cancelMatchmaking,
    clearMatchedGame: () => setMatchedGameId(null)
  };
}

export default useSkateGameRealtime;
