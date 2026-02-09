/**
 * S.K.A.T.E. Game API Service
 *
 * Async turn-based game. No retries. No previews. Final.
 */

import { apiRequest } from "../client";
import type {
  GameWithDetails,
  MyGames,
  CreateGameRequest,
  CreateGameResponse,
  RespondToGameRequest,
  RespondToGameResponse,
  SubmitTurnRequest,
  SubmitTurnResponse,
  JudgeTurnRequest,
  JudgeTurnResponse,
  DisputeRequest,
  DisputeResponse,
  ResolveDisputeRequest,
  ResolveDisputeResponse,
} from "./types";

export const gameApi = {
  async createGame(opponentId: string): Promise<CreateGameResponse> {
    return apiRequest<CreateGameResponse, CreateGameRequest>({
      method: "POST",
      path: "/api/games/create",
      body: { opponentId },
    });
  },

  async respondToGame(gameId: string, accept: boolean): Promise<RespondToGameResponse> {
    return apiRequest<RespondToGameResponse, RespondToGameRequest>({
      method: "POST",
      path: `/api/games/${gameId}/respond`,
      body: { accept },
    });
  },

  async submitTurn(
    gameId: string,
    trickDescription: string,
    videoUrl: string,
    videoDurationMs: number,
    thumbnailUrl?: string
  ): Promise<SubmitTurnResponse> {
    return apiRequest<SubmitTurnResponse, SubmitTurnRequest>({
      method: "POST",
      path: `/api/games/${gameId}/turns`,
      body: { trickDescription, videoUrl, videoDurationMs, thumbnailUrl },
    });
  },

  async judgeTurn(turnId: number, result: "landed" | "missed"): Promise<JudgeTurnResponse> {
    return apiRequest<JudgeTurnResponse, JudgeTurnRequest>({
      method: "POST",
      path: `/api/games/turns/${turnId}/judge`,
      body: { result },
    });
  },

  async fileDispute(gameId: string, turnId: number): Promise<DisputeResponse> {
    return apiRequest<DisputeResponse, DisputeRequest>({
      method: "POST",
      path: `/api/games/${gameId}/dispute`,
      body: { turnId },
    });
  },

  async resolveDispute(
    disputeId: number,
    finalResult: "landed" | "missed"
  ): Promise<ResolveDisputeResponse> {
    return apiRequest<ResolveDisputeResponse, ResolveDisputeRequest>({
      method: "POST",
      path: `/api/games/disputes/${disputeId}/resolve`,
      body: { finalResult },
    });
  },

  async forfeitGame(gameId: string): Promise<{ game: any; message: string }> {
    return apiRequest({
      method: "POST",
      path: `/api/games/${gameId}/forfeit`,
    });
  },

  async getMyGames(): Promise<MyGames> {
    return apiRequest<MyGames>({
      method: "GET",
      path: "/api/games/my-games",
    });
  },

  async getGameDetails(gameId: string): Promise<GameWithDetails> {
    return apiRequest<GameWithDetails>({
      method: "GET",
      path: `/api/games/${gameId}`,
    });
  },
};
