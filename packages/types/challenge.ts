export interface Challenge {
  id: string;
  createdBy: string;
  opponent: string;
  participants: string[]; // Required for Firestore queries
  status: "pending" | "accepted" | "completed" | "forfeit";
  createdAt: Date;
  deadline: Date;
  rules: {
    oneTake: boolean;
    durationSec: number;
  };
  clipA: {
    url: string;
    thumbnailUrl?: string;
    durationSec: number;
  };
  clipB?: {
    url: string;
    thumbnailUrl?: string;
    durationSec: number;
  };
  winner: string | null;
}

export interface CreateChallengeRequest {
  opponentUid: string;
  clipUrl: string;
  clipDurationSec: number;
  thumbnailUrl?: string;
}

export interface CreateChallengeResponse {
  challengeId: string;
}
