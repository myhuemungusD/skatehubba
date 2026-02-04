/**
 * WebSocket Types
 *
 * Enterprise-grade type definitions for Socket.io events.
 * All events are strictly typed for compile-time safety.
 */

import type { Socket } from "socket.io";

// ============================================================================
// User & Auth Types
// ============================================================================

export interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    firebaseUid: string;
    roles: string[];
    connectedAt: Date;
  };
}

// ============================================================================
// Room Types
// ============================================================================

export type RoomType = "battle" | "game" | "spot" | "global";

export interface RoomInfo {
  type: RoomType;
  id: string;
  members: Set<string>;
  createdAt: Date;
}

// ============================================================================
// Battle Events
// ============================================================================

export interface BattleCreatedPayload {
  battleId: string;
  creatorId: string;
  matchmaking: "open" | "direct";
  opponentId?: string;
  createdAt: string;
}

export interface BattleJoinedPayload {
  battleId: string;
  odv: string;
  joinedAt: string;
}

export interface BattleVotePayload {
  battleId: string;
  odv: string;
  vote: "clean" | "sketch" | "redo";
  votedAt: string;
}

export interface BattleCompletedPayload {
  battleId: string;
  winnerId?: string;
  finalScore: { [odv: string]: number };
  completedAt: string;
}

export interface BattleUpdatePayload {
  battleId: string;
  state: "waiting" | "active" | "voting" | "completed";
  currentTurn?: string;
  roundNumber?: number;
}

// ============================================================================
// S.K.A.T.E. Game Events
// ============================================================================

export interface GameCreatedPayload {
  gameId: string;
  spotId: string;
  creatorId: string;
  maxPlayers: number;
  createdAt: string;
}

export interface GameJoinedPayload {
  gameId: string;
  odv: string;
  playerCount: number;
}

export interface GameTrickPayload {
  gameId: string;
  odv: string;
  trickName: string;
  clipUrl?: string;
  sentAt: string;
}

export interface GameLetterPayload {
  gameId: string;
  odv: string;
  letters: string; // e.g., "S", "SK", "SKA", etc.
}

export interface GameTurnPayload {
  gameId: string;
  currentPlayer: string;
  action: "set" | "attempt";
  timeLimit?: number;
}

export interface GameEndedPayload {
  gameId: string;
  winnerId: string;
  finalStandings: Array<{ odv: string; letters: string }>;
}

export interface GameStatePayload {
  gameId: string;
  players: Array<{ odv: string; letters: string; connected: boolean }>;
  currentPlayer?: string;
  currentAction: "set" | "attempt";
  currentTrick?: string;
  status: "waiting" | "active" | "paused" | "completed";
}

export interface GamePausedPayload {
  gameId: string;
  disconnectedPlayer: string;
  reconnectTimeout: number; // seconds
}

export interface GameResumedPayload {
  gameId: string;
  reconnectedPlayer: string;
}

export interface BattleVotingStartedPayload {
  battleId: string;
  timeoutSeconds: number;
  startedAt: string;
}

// ============================================================================
// Notification Events
// ============================================================================

export interface NotificationPayload {
  id: string;
  type: "challenge" | "turn" | "result" | "system";
  title: string;
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

// ============================================================================
// Presence Events
// ============================================================================

export interface PresencePayload {
  odv: string;
  status: "online" | "away" | "offline";
  lastSeen?: string;
}

// ============================================================================
// Client → Server Events
// ============================================================================

export interface ClientToServerEvents {
  // Room management
  "room:join": (roomType: RoomType, roomId: string) => void;
  "room:leave": (roomType: RoomType, roomId: string) => void;

  // Battle actions
  "battle:create": (data: Omit<BattleCreatedPayload, "battleId" | "createdAt">) => void;
  "battle:join": (battleId: string) => void;
  "battle:vote": (data: Omit<BattleVotePayload, "votedAt">) => void;
  "battle:ready": (battleId: string) => void;

  // S.K.A.T.E. game actions
  "game:create": (spotId: string, maxPlayers?: number) => void;
  "game:join": (gameId: string) => void;
  "game:trick": (data: Omit<GameTrickPayload, "sentAt">) => void;
  "game:pass": (gameId: string) => void;
  "game:forfeit": (gameId: string) => void;
  "game:reconnect": (gameId: string) => void;

  // Battle voting
  "battle:startVoting": (battleId: string) => void;

  // Presence
  "presence:update": (status: "online" | "away") => void;

  // Typing indicators
  typing: (roomId: string, isTyping: boolean) => void;
}

// ============================================================================
// Server → Client Events
// ============================================================================

export interface ServerToClientEvents {
  // Connection
  connected: (data: { userId: string; serverTime: string }) => void;
  error: (data: { code: string; message: string }) => void;

  // Battle events
  "battle:created": (data: BattleCreatedPayload) => void;
  "battle:joined": (data: BattleJoinedPayload) => void;
  "battle:voted": (data: BattleVotePayload) => void;
  "battle:completed": (data: BattleCompletedPayload) => void;
  "battle:update": (data: BattleUpdatePayload) => void;

  // S.K.A.T.E. game events
  "game:created": (data: GameCreatedPayload) => void;
  "game:joined": (data: GameJoinedPayload) => void;
  "game:trick": (data: GameTrickPayload) => void;
  "game:letter": (data: GameLetterPayload) => void;
  "game:turn": (data: GameTurnPayload) => void;
  "game:ended": (data: GameEndedPayload) => void;
  "game:state": (data: GameStatePayload) => void;
  "game:paused": (data: GamePausedPayload) => void;
  "game:resumed": (data: GameResumedPayload) => void;

  // Battle voting events
  "battle:votingStarted": (data: BattleVotingStartedPayload) => void;

  // Notifications
  notification: (data: NotificationPayload) => void;

  // Presence
  "presence:update": (data: PresencePayload) => void;

  // Typing
  typing: (data: { odv: string; roomId: string; isTyping: boolean }) => void;
}

// ============================================================================
// Inter-Server Events (for horizontal scaling with Redis adapter)
// ============================================================================

export interface InterServerEvents {
  ping: () => void;
}

// ============================================================================
// Socket Data (attached to each socket)
// ============================================================================

export interface SocketData {
  userId: string;
  odv: string;
  firebaseUid: string;
  roles: string[];
  connectedAt: Date;
  rooms: Set<string>;
}
