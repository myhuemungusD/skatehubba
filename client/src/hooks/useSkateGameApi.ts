/**
 * S.K.A.T.E. Game API Hooks
 *
 * React Query hooks for turn-based 1v1 S.K.A.T.E. games
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from './use-toast';
import { gameApi } from '@/lib/api/game';
import type { MyGames, GameWithDetails } from '@/lib/api/game';

const QUERY_KEYS = {
  myGames: ['games', 'my-games'] as const,
  gameDetails: (id: string) => ['games', id] as const,
};

/**
 * Hook to fetch all my games (pending, active, completed)
 */
export function useMyGames() {
  return useQuery({
    queryKey: QUERY_KEYS.myGames,
    queryFn: () => gameApi.getMyGames(),
    refetchInterval: 5000, // Poll every 5 seconds for real-time feel
    staleTime: 3000,
  });
}

/**
 * Hook to fetch game details with turns
 */
export function useGameDetails(gameId: string | null) {
  return useQuery({
    queryKey: gameId ? QUERY_KEYS.gameDetails(gameId) : ['games', 'null'],
    queryFn: () => (gameId ? gameApi.getGameDetails(gameId) : null),
    enabled: !!gameId,
    refetchInterval: 3000, // Poll every 3 seconds for real-time updates
    staleTime: 2000,
  });
}

/**
 * Hook to create a new game challenge
 */
export function useCreateGame() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (opponentId: string) => gameApi.createGame(opponentId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.myGames });
      toast({
        title: 'Challenge Sent! 🎮',
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Create Challenge',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to respond to a game challenge (accept or decline)
 */
export function useRespondToGame() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ gameId, accept }: { gameId: string; accept: boolean }) =>
      gameApi.respondToGame(gameId, accept),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.myGames });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gameDetails(variables.gameId) });

      toast({
        title: variables.accept ? 'Challenge Accepted! 🔥' : 'Challenge Declined',
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Respond',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to submit a turn (video trick)
 */
export function useSubmitTurn() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      gameId,
      trickDescription,
      videoUrl,
    }: {
      gameId: string;
      trickDescription: string;
      videoUrl: string;
    }) => gameApi.submitTurn(gameId, trickDescription, videoUrl),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gameDetails(variables.gameId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.myGames });

      toast({
        title: 'Trick Submitted! 🛹',
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Submit Turn',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to judge a turn (landed or missed)
 */
export function useJudgeTurn() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      turnId,
      result,
      gameId,
    }: {
      turnId: number;
      result: 'landed' | 'missed';
      gameId: string;
    }) => gameApi.judgeTurn(turnId, result),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gameDetails(variables.gameId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.myGames });

      const title = data.gameOver
        ? '🏆 Game Over!'
        : result === 'landed'
        ? '✅ Landed!'
        : '❌ Missed!';

      toast({
        title,
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Judge Turn',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to get game state for a specific player
 */
export function useGameState(gameId: string | null, userId: string | undefined) {
  const { data, isLoading, error } = useGameDetails(gameId);

  if (!data || !userId) {
    return {
      game: null,
      isLoading,
      error,
      isMyTurn: false,
      needsToJudge: false,
      myLetters: '',
      oppLetters: '',
      opponentName: '',
      isGameOver: false,
      iWon: false,
    };
  }

  const { game, turns, isMyTurn, needsToJudge, pendingTurnId } = data;
  const isPlayer1 = game.player1Id === userId;
  const myLetters = isPlayer1 ? game.player1Letters : game.player2Letters;
  const oppLetters = isPlayer1 ? game.player2Letters : game.player1Letters;
  const opponentName = isPlayer1 ? game.player2Name : game.player1Name;
  const isGameOver = game.status === 'completed' || game.status === 'forfeited';
  const iWon = game.winnerId === userId;

  return {
    game,
    turns,
    isLoading,
    error,
    isMyTurn,
    needsToJudge,
    pendingTurnId,
    myLetters,
    oppLetters,
    opponentName,
    isGameOver,
    iWon,
  };
}
