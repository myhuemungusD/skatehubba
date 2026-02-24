/**
 * Battle State Service — Type Definitions
 */

export interface BattleVoteStateData {
  battleId: string;
  creatorId: string;
  opponentId: string | null;
  status: "waiting" | "active" | "voting" | "completed";
  votes: {
    odv: string;
    vote: "clean" | "sketch" | "redo";
    votedAt: string;
  }[];
  votingStartedAt?: string;
  voteDeadlineAt?: string;
  winnerId?: string;
  processedEventIds: string[];
}

export interface VoteResult {
  success: boolean;
  error?: string;
  alreadyProcessed?: boolean;
  battleComplete?: boolean;
  winnerId?: string;
  finalScore?: Record<string, number>;
}
