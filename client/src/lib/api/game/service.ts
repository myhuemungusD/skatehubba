/**
 * S.K.A.T.E. Game API Service
 *
 * API client for turn-based 1v1 S.K.A.T.E. games
 */

import { apiRequest } from '../client';
import type {
  Game,
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
} from './types';

export const gameApi = {
  /**
   * Create a new game challenge
   */
  async createGame(opponentId: string): Promise<CreateGameResponse> {
    return apiRequest<CreateGameResponse, CreateGameRequest>({
      method: 'POST',
      path: '/api/games/create',
      body: { opponentId },
    });
  },

  /**
   * Accept or decline a game challenge
   */
  async respondToGame(gameId: string, accept: boolean): Promise<RespondToGameResponse> {
    return apiRequest<RespondToGameResponse, RespondToGameRequest>({
      method: 'POST',
      path: `/api/games/${gameId}/respond`,
      body: { accept },
    });
  },

  /**
   * Submit a turn (video trick)
   */
  async submitTurn(
    gameId: string,
    trickDescription: string,
    videoUrl: string
  ): Promise<SubmitTurnResponse> {
    return apiRequest<SubmitTurnResponse, SubmitTurnRequest>({
      method: 'POST',
      path: `/api/games/${gameId}/turns`,
      body: { trickDescription, videoUrl },
    });
  },

  /**
   * Judge a turn (mark as landed or missed)
   */
  async judgeTurn(turnId: number, result: 'landed' | 'missed'): Promise<JudgeTurnResponse> {
    return apiRequest<JudgeTurnResponse, JudgeTurnRequest>({
      method: 'POST',
      path: `/api/games/turns/${turnId}/judge`,
      body: { result },
    });
  },

  /**
   * Get all my games (pending, active, completed)
   */
  async getMyGames(): Promise<MyGames> {
    return apiRequest<MyGames>({
      method: 'GET',
      path: '/api/games/my-games',
    });
  },

  /**
   * Get game details with turns
   */
  async getGameDetails(gameId: string): Promise<GameWithDetails> {
    return apiRequest<GameWithDetails>({
      method: 'GET',
      path: `/api/games/${gameId}`,
    });
  },
};
