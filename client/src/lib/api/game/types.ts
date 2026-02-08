/**
 * S.K.A.T.E. Game API Types
 *
 * Type definitions for the turn-based 1v1 S.K.A.T.E. game API
 */

export interface Game {
  id: string;
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  status: 'pending' | 'active' | 'completed' | 'declined' | 'forfeited';
  currentTurn: string;
  player1Letters: string;
  player2Letters: string;
  lastTrickDescription?: string;
  lastTrickBy?: string;
  winnerId?: string;
  deadlineAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface GameTurn {
  id: number;
  gameId: string;
  playerId: string;
  playerName: string;
  turnNumber: number;
  trickDescription: string;
  videoUrl: string;
  result: 'pending' | 'landed' | 'missed';
  judgedBy?: string;
  judgedAt?: string;
  createdAt: string;
}

export interface GameWithDetails {
  game: Game;
  turns: GameTurn[];
  isMyTurn: boolean;
  needsToJudge: boolean;
  pendingTurnId: number | null;
}

export interface MyGames {
  pendingChallenges: Game[];
  sentChallenges: Game[];
  activeGames: Game[];
  completedGames: Game[];
  total: number;
}

export interface CreateGameRequest {
  opponentId: string;
}

export interface CreateGameResponse {
  game: Game;
  message: string;
}

export interface RespondToGameRequest {
  accept: boolean;
}

export interface RespondToGameResponse {
  game: Game;
  message: string;
}

export interface SubmitTurnRequest {
  trickDescription: string;
  videoUrl: string;
}

export interface SubmitTurnResponse {
  turn: GameTurn;
  message: string;
}

export interface JudgeTurnRequest {
  result: 'landed' | 'missed';
}

export interface JudgeTurnResponse {
  game: Game;
  turn: GameTurn;
  gameOver: boolean;
  winnerId?: string;
  message: string;
}

export interface AvailablePlayer {
  id: string;
  username: string;
  photoUrl?: string;
  isOnline: boolean;
}
