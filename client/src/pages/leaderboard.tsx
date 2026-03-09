import { useCallback } from "react";
import { Link } from "wouter";
import { Trophy, Swords, WifiOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useRealtimeLeaderboard,
  type LeaderboardEntry,
} from "@/features/leaderboard/useRealtimeLeaderboard";
import { useAuth } from "@/hooks/useAuth";
import { useCreateGame } from "@/hooks/useSkateGameApi";

function winRate(wins: number, losses: number): string {
  const total = wins + losses;
  if (total === 0) return "0%";
  return `${Math.round((wins / total) * 100)}%`;
}

function RankingsEntry({
  entry,
  index,
  isMe,
  onChallenge,
  isChallengePending,
}: {
  entry: LeaderboardEntry;
  index: number;
  isMe: boolean;
  onChallenge: (userId: string) => void;
  isChallengePending: boolean;
}) {
  const rank = entry.rank ?? index + 1;

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg bg-neutral-800/50 border ${isMe ? "border-orange-500/30" : "border-neutral-700"}`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="text-sm font-bold text-yellow-400 w-6 text-center shrink-0">#{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {entry.username ? (
              <Link
                href={`/skater/${entry.username}`}
                className="text-sm font-medium text-white hover:text-yellow-400 transition-colors truncate"
              >
                {entry.displayName}
              </Link>
            ) : (
              <span className="text-sm font-medium text-white truncate">{entry.displayName}</span>
            )}
            {isMe && <span className="text-xs text-orange-400 font-medium shrink-0">You</span>}
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            {entry.username ? <span>@{entry.username.replace(/^@/, "")}</span> : null}
            <span>
              {entry.wins}W - {entry.losses}L
            </span>
            <span>{winRate(entry.wins, entry.losses)}</span>
          </div>
        </div>
      </div>
      {!isMe && (
        <Button
          size="sm"
          onClick={() => onChallenge(entry.id)}
          disabled={isChallengePending}
          className="shrink-0 ml-2 bg-orange-500 hover:bg-orange-600 text-black font-semibold h-7 px-2.5 text-xs"
        >
          <Swords className="h-3 w-3 mr-1" />
          Challenge
        </Button>
      )}
    </div>
  );
}

export default function RankingsPage() {
  const { entries, isLoading, error, isOffline } = useRealtimeLeaderboard();
  const { user } = useAuth();
  const createGame = useCreateGame();

  const handleChallenge = useCallback(
    (opponentId: string) => {
      createGame.mutate(opponentId);
    },
    [createGame]
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-yellow-400" />
          <h1 className="text-2xl font-semibold text-white">Rankings</h1>
        </div>
        <p className="text-sm text-neutral-400">Who&apos;s winning the most games of S.K.A.T.E.</p>
        {isOffline ? (
          <div className="flex items-center gap-2 text-xs text-yellow-300">
            <WifiOff className="h-4 w-4" />
            Offline — rankings will update when you reconnect.
          </div>
        ) : null}
      </header>

      {isLoading ? (
        <Card className="bg-neutral-900/60 border-neutral-800">
          <CardContent className="py-8 text-center text-sm text-neutral-400">
            Loading rankings...
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

      {!isLoading && !error && entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((entry, idx) => (
            <RankingsEntry
              key={entry.id}
              entry={entry}
              index={idx}
              isMe={user?.uid === entry.firebaseUid}
              onChallenge={handleChallenge}
              isChallengePending={createGame.isPending}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
