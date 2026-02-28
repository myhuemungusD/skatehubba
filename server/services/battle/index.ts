/**
 * Battle State Service
 *
 * Manages battle voting using PostgreSQL with row-level locking.
 *
 * Features:
 * - Vote timeouts (60 seconds, defender wins on timeout)
 * - Tie handling (creator wins on tie as the challenger)
 * - Idempotency keys to prevent duplicate votes
 * - Double-vote protection
 * - SELECT FOR UPDATE for distributed locking
 *
 * @module services/battle
 */

export type { BattleVoteStateData, VoteResult } from "./types";
export { generateEventId } from "./idempotency";
export { calculateWinner } from "./calculation";
export { processVoteTimeouts } from "./timeout";
export { initializeVoting, castVote, getBattleVoteState } from "./service";
