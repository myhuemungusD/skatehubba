import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from './use-toast';
import type { Game } from '@shared/schema';

type GameMove = {
  type: 'set' | 'land' | 'bail';
  trickName?: string;
};

export function useSkateGame(gameId: string | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 1. Fetch Game State (with polling for real-time feel)
  const { 
    data: game, 
    isLoading, 
    error 
  } = useQuery<Game>({
    queryKey: ['/api/games', gameId],
    queryFn: async () => {
      if (!gameId) throw new Error('No game ID provided');
      const res = await fetch(`/api/games/${gameId}`);
      if (!res.ok) throw new Error('Failed to fetch game');
      return res.json();
    },
    enabled: !!gameId,
    refetchInterval: 2000, // Poll every 2s for opponent moves
    staleTime: 1000,
  });

  // 2. Game Move Mutation (Optimistic Updates)
  const { mutate: submitMove, isPending: isMovePending } = useMutation({
    mutationFn: async (move: GameMove) => {
      if (!gameId) return;
      const res = await fetch(`/api/games/${gameId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(move),
      });
      if (!res.ok) throw new Error('Failed to submit move');
      return res.json();
    },
    onMutate: async (newMove) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['/api/games', gameId] });

      // Snapshot previous value
      const previousGame = queryClient.getQueryData<Game>(['/api/games', gameId]);

      // Optimistically update to new value
      if (previousGame) {
        queryClient.setQueryData<Game>(['/api/games', gameId], (old) => {
          if (!old) return old;
          
          // Simple optimistic logic (refines actual state on next fetch)
          const isP1 = old.currentTurn === old.player1Id;
          let p1Letters = old.player1Letters || "";
          let p2Letters = old.player2Letters || "";

          if (newMove.type === 'bail') {
            if (isP1) p1Letters += "S"; // Placeholder logic
            else p2Letters += "S";
          }

          return {
            ...old,
            player1Letters: p1Letters,
            player2Letters: p2Letters,
            // Toggle turn optimistically
            currentTurn: isP1 ? old.player2Id : old.player1Id, 
          };
        });
      }

      return { previousGame };
    },
    onError: (_error, _newMove, context) => {
      toast({
        title: "Foul!",
        description: "Could not sync your move. Retrying...",
        variant: "destructive",
      });
      // Rollback
      if (context?.previousGame) {
        queryClient.setQueryData(['/api/games', gameId], context.previousGame);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['/api/games', gameId] });
    },
  });

  // 3. Helper: Calculate Game Status
  const getGameState = (userId: string | undefined) => {
    if (!game || !userId) return { isMyTurn: false, isOffense: false, myLetters: 0, oppLetters: 0 };

    const isP1 = userId === game.player1Id;
    const isMyTurn = game.currentTurn === userId;
    
    // In S.K.A.T.E:
    // If it's my turn and I'm setting (no last trick pending), I'm Offense.
    // If it's my turn and there IS a last trick, I'm Defense (trying to copy).
    // If it's NOT my turn, I'm waiting.
    
    // Simplified logic for UI:
    // Offense = It is my turn AND (I am P1 and P2 didn't just set, or I landed a set)
    // This logic depends heavily on backend state machine, but for UI:
    const isOffense = isMyTurn && !game.lastTrickDescription; 

    const myLettersStr = isP1 ? game.player1Letters : game.player2Letters;
    const oppLettersStr = isP1 ? game.player2Letters : game.player1Letters;

    return {
      isMyTurn,
      isOffense,
      myLetters: myLettersStr?.length || 0,
      oppLetters: oppLettersStr?.length || 0,
      myLettersStr: myLettersStr || "",
      oppLettersStr: oppLettersStr || "",
      opponentName: isP1 ? game.player2Name : game.player1Name,
      winnerId: game.winnerId,
      isGameOver: !!game.winnerId,
      iWon: game.winnerId === userId
    };
  };

  return {
    game,
    isLoading,
    error,
    submitMove,
    isMovePending,
    getGameState
  };
}
