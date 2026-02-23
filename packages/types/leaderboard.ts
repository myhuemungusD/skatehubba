export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  photoURL: string | null;
  wins: number;
  losses: number;
  winRate: number;
}
