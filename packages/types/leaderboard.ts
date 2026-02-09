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
