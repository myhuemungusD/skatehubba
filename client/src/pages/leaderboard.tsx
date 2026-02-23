import { Trophy, WifiOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRealtimeLeaderboard } from "@/features/leaderboard/useRealtimeLeaderboard";

function winRate(wins: number, losses: number): string {
  const total = wins + losses;
  if (total === 0) return "0%";
  return `${Math.round((wins / total) * 100)}%`;
}

export default function LeaderboardPage() {
  const { entries, isLoading, error, isOffline } = useRealtimeLeaderboard();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-yellow-400" />
          <h1 className="text-2xl font-semibold text-white">S.K.A.T.E. Leaderboard</h1>
        </div>
        <p className="text-sm text-neutral-400">
          Who&apos;s winning the most games of S.K.A.T.E.
        </p>
        {isOffline ? (
          <div className="flex items-center gap-2 text-xs text-yellow-300">
            <WifiOff className="h-4 w-4" />
            Offline mode: leaderboard updates will resume when you reconnect.
          </div>
        ) : null}
      </header>

      {isLoading ? (
        <Card className="bg-neutral-900/60 border-neutral-800">
          <CardContent className="py-8 text-center text-sm text-neutral-400">
            Pulling the latest rankings...
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="bg-neutral-900/60 border-neutral-800">
          <CardContent className="py-8 text-center text-sm text-neutral-400">
            No rankings to display yet. Challenge someone to a game of S.K.A.T.E.!
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !error && entries.length === 0 ? (
        <Card className="bg-neutral-900/60 border-neutral-800">
          <CardContent className="py-8 text-center text-sm text-neutral-400">
            No rankings yet. Challenge someone to start climbing.
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3">
        {entries.map((entry, index) => {
          const rank = entry.rank ?? index + 1;
          return (
            <Card key={entry.id} className="bg-neutral-900/70 border-neutral-800">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base text-white">
                    #{rank} {entry.displayName}
                  </CardTitle>
                  <Badge className="bg-yellow-500/20 text-yellow-300">
                    {entry.wins}W - {entry.losses}L
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="text-xs text-neutral-400">
                <div className="flex flex-wrap gap-3">
                  {entry.username ? <span>@{entry.username.replace(/^@/, "")}</span> : null}
                  <span>{winRate(entry.wins, entry.losses)} win rate</span>
                  <span>{entry.wins + entry.losses} games played</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
