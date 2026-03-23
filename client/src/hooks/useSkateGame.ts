import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api/client";

// Types matching the server response
interface GamePlayer {
  id: string;
  name: string;
  letters: string;
  isEliminated: boolean;
}

interface Game {
  id: string;
  creatorId: string;
  players: GamePlayer[];
  maxPlayers: number;
  status: string;
  currentTurn: string | null;
  turnPhase: string | null;
  setterId: string | null;
  currentResponderIdx: number | null;
  lastTrickDescription: string | null;
  lastTrickBy: string | null;
  deadlineAt: string | null;
  winnerId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface GameTurn {
  id: number;
  gameId: string;
  playerId: string;
  playerName: string;
  turnNumber: number;
  turnType: string;
  trickDescription: string;
  videoUrl: string | null;
  videoDurationMs: number | null;
  result: string;
  judgedBy: string | null;
  judgedAt: string | null;
  createdAt: string;
}

export function useMyGames() {
  return useQuery({
    queryKey: ["myGames"],
    queryFn: () => api.get<{ games: Game[] }>("/games/my-games"),
  });
}

export function useGameDetails(gameId: string | undefined) {
  return useQuery({
    queryKey: ["game", gameId],
    queryFn: () => api.get<{ game: Game; turns: GameTurn[] }>(`/games/${gameId}`),
    enabled: !!gameId,
    refetchInterval: (query) => {
      const status = query.state.data?.game.status;
      return status === "active" || status === "pending" ? 10_000 : false;
    },
  });
}

export function useCreateGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opponentIds: string[]) =>
      api.post<{ game: Game; message: string }>("/games/create", { opponentIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myGames"] }),
  });
}

export function useJoinGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ gameId, accept }: { gameId: string; accept: boolean }) =>
      api.post<{ game: Game; message: string }>(`/games/${gameId}/join`, { accept }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myGames"] }),
  });
}

export function useSubmitTurn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      gameId,
      ...body
    }: {
      gameId: string;
      trickDescription: string;
      videoUrl: string;
      videoDurationMs: number;
      thumbnailUrl?: string;
    }) => api.post<{ turn: GameTurn; message: string }>(`/games/${gameId}/turns`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["game", vars.gameId] });
      qc.invalidateQueries({ queryKey: ["myGames"] });
    },
  });
}

export function useJudgeTurn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ turnId, result }: { turnId: number; result: "landed" | "missed" }) =>
      api.post<{ game: Game; turn: GameTurn; gameOver: boolean; winnerId?: string; message: string }>(
        `/games/turns/${turnId}/judge`,
        { result }
      ),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["game", data.game.id] });
      qc.invalidateQueries({ queryKey: ["myGames"] });
    },
  });
}

export function useSetterBail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gameId: string) =>
      api.post<{ game: Game; gameOver: boolean; winnerId?: string; message: string }>(
        `/games/${gameId}/setter-bail`
      ),
    onSuccess: (_data, gameId) => {
      qc.invalidateQueries({ queryKey: ["game", gameId] });
      qc.invalidateQueries({ queryKey: ["myGames"] });
    },
  });
}

export function useForfeitGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gameId: string) =>
      api.post<{ game: Game; message: string }>(`/games/${gameId}/forfeit`),
    onSuccess: (_data, gameId) => {
      qc.invalidateQueries({ queryKey: ["game", gameId] });
      qc.invalidateQueries({ queryKey: ["myGames"] });
    },
  });
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ["leaderboard"],
    queryFn: () =>
      api.get<{
        leaderboard: Array<{
          id: string;
          handle: string;
          displayName: string | null;
          photoURL: string | null;
          wins: number;
          losses: number;
        }>;
      }>("/games/leaderboard"),
  });
}
