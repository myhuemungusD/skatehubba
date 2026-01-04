// Shared types for SkateHubba Mobile

export interface User {
  id: string;
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  createdAt: string;
}

export interface Challenge {
  id: string;
  createdBy: string;
  opponent: string;
  participants: string[]; // Required for Firestore queries
  status: 'pending' | 'accepted' | 'completed' | 'forfeit';
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

export interface Spot {
  id: number;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  address: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'legendary';
  tags: string[];
  imageUrl?: string;
  checkInCount: number;
}

export interface CheckIn {
  id: number;
  userId: string;
  spotId: number;
  timestamp: string;
  expiresAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  photoURL: string | null;
  totalPoints: number;
  checkInCount: number;
  spotsUnlocked: number;
  tricksCompleted: number;
  currentStreak: number;
}

// Firebase Cloud Function types
export interface CreateChallengeRequest {
  opponentUid: string;
  clipUrl: string;
  clipDurationSec: number;
  thumbnailUrl?: string;
}

export interface CreateChallengeResponse {
  challengeId: string;
}
