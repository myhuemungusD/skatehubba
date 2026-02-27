import { useRef } from "react";
import { Trophy, WifiOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useRealtimeLeaderboard,
  type LeaderboardEntry,
} from "@/features/leaderboard/useRealtimeLeaderboard";
import { useVirtualizer } from "@tanstack/react-virtual";

const LEADERBOARD_ROW_HEIGHT = 90;

function VirtualizedLeaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LEADERBOARD_ROW_HEIGHT,
    overscan: 10,
  });

  if (entries.length === 0) return null;

  return (
    <div ref={parentRef} className="max-h-[70vh] overflow-y-auto">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const entry = entries[virtualRow.index];
          const rank = entry.rank ?? virtualRow.index + 1;
          return (
            <div
              key={entry.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div className="pb-3">
                <Card className="bg-neutral-900/70 border-neutral-800">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base text-white">
                        #{rank} {entry.displayName}
                      </CardTitle>
                      {entry.xp !== undefined ? (
                        <Badge className="bg-yellow-500/20 text-yellow-300">
                          {entry.xp.toLocaleString()} XP
                        </Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="text-xs text-neutral-400">
                    <div className="flex flex-wrap gap-3">
                      {entry.username ? <span>@{entry.username.replace(/^@/, "")}</span> : null}
                      {entry.totalCheckIns !== undefined ? (
                        <span>{entry.totalCheckIns} check-ins</span>
                      ) : null}
                      {entry.spotsVisited !== undefined ? (
                        <span>{entry.spotsVisited} spots</span>
                      ) : null}
                      {entry.streak !== undefined ? <span>{entry.streak} day streak</span> : null}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const { entries, isLoading, error, isOffline } = useRealtimeLeaderboard();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-yellow-400" />
          <h1 className="text-2xl font-semibold text-white">Leaderboard</h1>
        </div>
        <p className="text-sm text-neutral-400">
          Real-time rankings from the SkateHubba live leaderboard.
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
            No rankings to display yet. Be the first to check in and claim the top spot!
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !error && entries.length === 0 ? (
        <Card className="bg-neutral-900/60 border-neutral-800">
          <CardContent className="py-8 text-center text-sm text-neutral-400">
            No rankings yet. Check in at a spot to start climbing.
          </CardContent>
        </Card>
      ) : null}

      <VirtualizedLeaderboard entries={entries} />
    </div>
  );
}
