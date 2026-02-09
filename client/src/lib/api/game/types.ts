/**
 * S.K.A.T.E. Game API Types
 *
 * Async, turn-based 1v1 game. No live play. No retries.
 */

export type TurnPhase = 'set_trick' | 'respond_trick' | 'judge';

export interface Game {
  id: string;
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  status: 'pending' | 'active' | 'completed' | 'declined' | 'forfeited';
  currentTurn: string | null;
  turnPhase: TurnPhase | null;
  offensivePlayerId: string | null;
  defensivePlayerId: string | null;
  player1Letters: string;
  player2Letters: string;
  player1DisputeUsed: boolean;
  player2DisputeUsed: boolean;
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
  turnType: 'set' | 'response';
  trickDescription: string;
  videoUrl: string;
  videoDurationMs?: number;
  result: 'pending' | 'landed' | 'missed';
  judgedBy?: string;
  judgedAt?: string;
  createdAt: string;
}

export interface GameDispute {
  id: number;
  gameId: string;
  turnId: number;
  disputedBy: string;
  againstPlayerId: string;
  originalResult: string;
  finalResult?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  penaltyAppliedTo?: string;
  createdAt: string;
}

export interface GameWithDetails {
  game: Game;
  turns: GameTurn[];
  disputes: GameDispute[];
  isMyTurn: boolean;
  needsToJudge: boolean;
  needsToRespond: boolean;
  pendingTurnId: number | null;
  canDispute: boolean;
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
  videoDurationMs: number;
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

export interface DisputeRequest {
  turnId: number;
}

export interface DisputeResponse {
  dispute: GameDispute;
  message: string;
}

export interface ResolveDisputeRequest {
  finalResult: 'landed' | 'missed';
}

export interface ResolveDisputeResponse {
  dispute: GameDispute;
  message: string;
}

export interface AvailablePlayer {
  id: string;
  username: string;
  photoUrl?: string;
  isOnline: boolean;
}
