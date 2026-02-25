/**
 * S.K.A.T.E. Game API Hooks
 *
 * React Query hooks for async turn-based S.K.A.T.E. games.
 * No soft language. Direct feedback.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "./use-toast";
import { gameApi } from "@/lib/api/game";

const QUERY_KEYS = {
  myGames: ["games", "my-games"] as const,
  gameDetails: (id: string) => ["games", id] as const,
  myStats: ["games", "stats", "me"] as const,
};

export function useMyGames() {
  return useQuery({
    queryKey: QUERY_KEYS.myGames,
    queryFn: () => gameApi.getMyGames(),
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

export function useGameDetails(gameId: string | null) {
  return useQuery({
    queryKey: gameId ? QUERY_KEYS.gameDetails(gameId) : ["games", "null"],
    queryFn: () => (gameId ? gameApi.getGameDetails(gameId) : null),
    enabled: !!gameId,
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

export function useCreateGame() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (opponentId: string) => gameApi.createGame(opponentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.myGames });
      toast({ title: "Challenge sent." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useRespondToGame() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ gameId, accept }: { gameId: string; accept: boolean }) =>
      gameApi.respondToGame(gameId, accept),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.myGames });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gameDetails(variables.gameId) });
      toast({ title: variables.accept ? "Game on." : "Declined." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useSubmitTurn() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      gameId,
      trickDescription,
      videoUrl,
      videoDurationMs,
      thumbnailUrl,
    }: {
      gameId: string;
      trickDescription: string;
      videoUrl: string;
      videoDurationMs: number;
      thumbnailUrl?: string;
    }) => gameApi.submitTurn(gameId, trickDescription, videoUrl, videoDurationMs, thumbnailUrl),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gameDetails(variables.gameId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.myGames });
      toast({ title: "Sent." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useJudgeTurn() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { turnId: number; result: "landed" | "missed"; gameId: string }) =>
      gameApi.judgeTurn(variables.turnId, variables.result),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gameDetails(variables.gameId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.myGames });
      toast({ title: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useFileDispute() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ gameId, turnId }: { gameId: string; turnId: number }) =>
      gameApi.fileDispute(gameId, turnId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gameDetails(variables.gameId) });
      toast({ title: "Dispute filed." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useResolveDispute() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      disputeId,
      finalResult,
    }: {
      disputeId: number;
      finalResult: "landed" | "missed";
      gameId: string;
    }) => gameApi.resolveDispute(disputeId, finalResult),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gameDetails(variables.gameId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.myGames });
      toast({ title: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useSetterBail() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (gameId: string) => gameApi.setterBail(gameId),
    onSuccess: (data, gameId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gameDetails(gameId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.myGames });
      toast({ title: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useMyStats() {
  return useQuery({
    queryKey: QUERY_KEYS.myStats,
    queryFn: () => gameApi.getMyStats(),
    staleTime: 30000,
  });
}

export function useForfeitGame() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (gameId: string) => gameApi.forfeitGame(gameId),
    onSuccess: (_data, gameId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gameDetails(gameId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.myGames });
      toast({ title: "You forfeited." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useGameState(gameId: string | null, userId: string | undefined) {
  const { data, isLoading, error } = useGameDetails(gameId);

  if (!data || !userId) {
    return {
      game: null,
      turns: [],
      disputes: [],
      isLoading,
      error,
      isMyTurn: false,
      needsToJudge: false,
      needsToRespond: false,
      pendingTurnId: null as number | null,
      canDispute: false,
      myLetters: "",
      oppLetters: "",
      opponentName: "",
      isGameOver: false,
      iWon: false,
      turnPhase: null as string | null,
      isOffensive: false,
      isDefensive: false,
    };
  }

  const {
    game,
    turns,
    disputes,
    isMyTurn,
    needsToJudge,
    needsToRespond,
    pendingTurnId,
    canDispute,
  } = data;
  const isPlayer1 = game.player1Id === userId;
  const myLetters = isPlayer1 ? game.player1Letters : game.player2Letters;
  const oppLetters = isPlayer1 ? game.player2Letters : game.player1Letters;
  const opponentName = isPlayer1 ? game.player2Name : game.player1Name;
  const isGameOver = game.status === "completed" || game.status === "forfeited";
  const iWon = game.winnerId === userId;
  const isOffensive = game.offensivePlayerId === userId;
  const isDefensive = game.defensivePlayerId === userId;

  return {
    game,
    turns,
    disputes,
    isLoading,
    error,
    isMyTurn,
    needsToJudge,
    needsToRespond,
    pendingTurnId,
    canDispute,
    myLetters,
    oppLetters,
    opponentName,
    isGameOver,
    iWon,
    turnPhase: game.turnPhase,
    isOffensive,
    isDefensive,
  };
}
