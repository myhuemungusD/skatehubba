/**
 * @skatehubba/db — Shared database schema and types
 *
 * Single entry point for all Drizzle ORM table definitions and inferred
 * TypeScript types. Import from `@skatehubba/db` instead of reaching
 * into `@shared/schema` directly.
 *
 * Usage:
 *   import { customUsers, type CustomUser, type InsertCustomUser } from "@skatehubba/db";
 *   import { spots, type Spot, games, type Game } from "@skatehubba/db";
 *   import { createDbClient } from "@skatehubba/db";
 */

// ─── Re-export all Drizzle tables, enums, and inferred types ─────────────────

// Auth tables & types
export {
  customUsers,
  usernames,
  authSessions,
  auditLogs,
  loginAttempts,
  accountLockouts,
  mfaSecrets,
  accountTierEnum,
  ACCOUNT_TIERS,
} from "@shared/schema/auth";

export type {
  CustomUser,
  InsertCustomUser,
  AuthSession,
  InsertAuthSession,
  AccountTier,
  RegisterInput,
  LoginInput,
  InsertUser,
  VerifyEmailInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from "@shared/schema/auth";

// Spots tables & types
export {
  spots,
  spotRatings,
  checkIns,
  filmerRequests,
  filmerDailyCounters,
  checkinNonces,
  filmerRequestStatusEnum,
  insertSpotSchema,
  SPOT_TYPES,
  SPOT_TIERS,
} from "@shared/schema/spots";

export type {
  Spot,
  InsertSpot,
  CheckIn,
  InsertCheckIn,
  FilmerRequest,
  InsertFilmerRequest,
  FilmerDailyCounter,
  SpotRating,
  SpotType,
  SpotTier,
} from "@shared/schema/spots";

// Games tables & types
export {
  games,
  gameTurns,
  gameDisputes,
  challenges,
  insertGameSchema,
  insertGameTurnSchema,
  insertGameDisputeSchema,
  insertChallengeSchema,
  GAME_STATUSES,
  TURN_PHASES,
  TURN_RESULTS,
} from "@shared/schema/games";

export type {
  Game,
  InsertGame,
  GameTurn,
  InsertGameTurn,
  GameDispute,
  InsertGameDispute,
  Challenge,
  InsertChallenge,
  GameStatus,
  TurnPhase,
  TurnResult,
} from "@shared/schema/games";

// Battles (remote skate)
export * from "@shared/schema/battles";

// Tricks (TrickMint video clips)
export * from "@shared/schema/tricks";

// Commerce (orders, products, donations)
export * from "@shared/schema/commerce";

// Profiles (user profiles, achievements)
export * from "@shared/schema/profiles";

// Notifications (push tokens, notification history)
export * from "@shared/schema/notifications";

// Moderation (reports, mod actions, bans)
export * from "@shared/schema/moderation";

// Engagement (likes, follows)
export * from "@shared/schema/engagement";

// Tutorials
export * from "@shared/schema/tutorials";

// Validation schemas (Zod)
export * from "@shared/schema/validation";
