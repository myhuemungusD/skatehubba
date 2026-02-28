/**
 * Battle State Service — Winner Calculation
 *
 * Pure function: determines the winner from a set of votes.
 * Tie-breaker: creator wins (they issued the challenge).
 */

import logger from "../../logger";

/**
 * Calculate winner with proper tie handling.
 * Each "clean" vote awards a point to the *other* player.
 * On a tie the creator wins (challenger advantage rule).
 */
export function calculateWinner(
  votes: { odv: string; vote: "clean" | "sketch" | "redo" }[],
  creatorId: string,
  opponentId: string
): { winnerId: string; scores: Record<string, number> } {
  const scores: Record<string, number> = {
    [creatorId]: 0,
    [opponentId]: 0,
  };

  for (const v of votes) {
    if (v.vote === "clean") {
      const otherPlayer = v.odv === creatorId ? opponentId : creatorId;
      scores[otherPlayer] = (scores[otherPlayer] || 0) + 1;
    }
  }

  const creatorScore = scores[creatorId];
  const opponentScore = scores[opponentId];

  let winnerId: string;
  if (creatorScore > opponentScore) {
    winnerId = creatorId;
  } else if (opponentScore > creatorScore) {
    winnerId = opponentId;
  } else {
    winnerId = creatorId;
    logger.info("[BattleState] Tie resolved - creator wins", {
      creatorId,
      opponentId,
      scores,
    });
  }

  return { winnerId, scores };
}
