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

export type RoomType = "battle" | "spot" | "global";

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
