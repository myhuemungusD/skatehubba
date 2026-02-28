/**
 * Battle State Service — Vote Timeout Processing
 *
 * Scheduled handler that resolves battles whose voting deadline has expired.
 * Defender-wins rule: the player who submitted a vote before the deadline is
 * declared the winner; if neither voted, the creator wins by default.
 */

import { getDb } from "../../db";
import { battles, battleVoteState } from "@shared/schema";
import { eq, and, lt } from "drizzle-orm";
import logger from "../../logger";
import { logServerEvent } from "../analyticsService";
import { generateEventId, MAX_PROCESSED_EVENTS } from "./idempotency";
import type { BattleVoteStateData } from "./types";

export async function processVoteTimeouts(): Promise<void> {
  try {
    const db = getDb();
    const now = new Date();

    // Find voting states with expired deadlines
    const expiredStates = await db
      .select()
      .from(battleVoteState)
      .where(and(eq(battleVoteState.status, "voting"), lt(battleVoteState.voteDeadlineAt, now)));

    for (const state of expiredStates) {
      const sequenceKey = `deadline-${state.voteDeadlineAt?.toISOString()}`;
      const eventId = generateEventId("timeout", state.battleId, state.battleId, sequenceKey);

      const updated = await db.transaction(async (tx) => {
        const [fresh] = await tx
          .select()
          .from(battleVoteState)
          .where(eq(battleVoteState.battleId, state.battleId))
          .for("update");

        if (!fresh) return false;

        const processedIds = fresh.processedEventIds as string[];
        if (processedIds.includes(eventId)) return false;
        if (fresh.status !== "voting") return false;

        const currentVotes = fresh.votes as BattleVoteStateData["votes"];
        const creatorVoted = currentVotes.some((v) => v.odv === fresh.creatorId);
        const opponentVoted =
          fresh.opponentId && currentVotes.some((v) => v.odv === fresh.opponentId);

        let winnerId: string;
        let reason: string;

        if (creatorVoted && !opponentVoted) {
          winnerId = fresh.creatorId;
          reason = "opponent_timeout";
        } else if (!creatorVoted && opponentVoted && fresh.opponentId) {
          winnerId = fresh.opponentId;
          reason = "creator_timeout";
        } else {
          winnerId = fresh.creatorId;
          reason = "both_timeout";
        }

        await tx
          .update(battleVoteState)
          .set({
            status: "completed",
            winnerId,
            processedEventIds: [...processedIds, eventId].slice(-MAX_PROCESSED_EVENTS),
            updatedAt: now,
          })
          .where(eq(battleVoteState.battleId, state.battleId));

        return { winnerId, reason };
      });

      if (!updated) continue;

      // Update battles table
      await db
        .update(battles)
        .set({
          status: "completed",
          winnerId: updated.winnerId,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(battles.id, state.battleId));

      await logServerEvent(updated.winnerId, "battle_completed", {
        battle_id: state.battleId,
        winner_id: updated.winnerId,
        completion_reason: updated.reason,
      });

      logger.info("[BattleState] Vote timeout processed", {
        battleId: state.battleId,
        winnerId: updated.winnerId,
        reason: updated.reason,
      });
    }
  } catch (error) {
    logger.error("[BattleState] Failed to process vote timeouts", { error });
  }
}
