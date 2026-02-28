/**
 * PlayerStats Component
 *
 * Displays S.K.A.T.E. game stats: W/L record, win streak, top tricks.
 * Every game is a permanent record. Your stats tell your story.
 */

import { Trophy, Flame, Target, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GameStats } from "@/lib/api/game/types";

interface PlayerStatsProps {
  stats: GameStats;
  className?: string;
}

export function PlayerStats({ stats, className }: PlayerStatsProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Main stats row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-700 text-center">
          <div className="text-2xl font-bold text-white">{stats.totalGames}</div>
          <div className="text-xs text-neutral-400">Games</div>
        </div>
        <div className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-700 text-center">
          <div className="text-2xl font-bold text-green-400">{stats.wins}</div>
          <div className="text-xs text-neutral-400">Wins</div>
        </div>
        <div className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-700 text-center">
          <div className="text-2xl font-bold text-red-400">{stats.losses}</div>
          <div className="text-xs text-neutral-400">Losses</div>
        </div>
        <div className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-700 text-center">
          <div className="text-2xl font-bold text-yellow-400">{stats.winRate}%</div>
          <div className="text-xs text-neutral-400">Win Rate</div>
        </div>
      </div>

      {/* Streak */}
      {stats.currentStreak > 0 && (
        <div
          className={cn(
            "p-4 rounded-lg border flex items-center gap-3",
            stats.currentStreak >= 3
              ? "bg-orange-500/10 border-orange-500/30"
              : "bg-neutral-800/50 border-neutral-700"
          )}
        >
          <Flame
            className={cn(
              "w-6 h-6",
              stats.currentStreak >= 5
                ? "text-red-400"
                : stats.currentStreak >= 3
                  ? "text-orange-400"
                  : "text-yellow-400"
            )}
          />
          <div>
            <div className="text-white font-bold">{stats.currentStreak} game win streak</div>
            {stats.bestStreak > stats.currentStreak && (
              <div className="text-xs text-neutral-400">Best: {stats.bestStreak}</div>
            )}
          </div>
        </div>
      )}

      {/* Opponent bragging rights */}
      {stats.opponentRecords.filter((r) => r.streak >= 3).length > 0 && (
        <div className="space-y-2">
          {stats.opponentRecords
            .filter((r) => r.streak >= 3)
            .map((record) => (
              <div
                key={record.opponentId}
                className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 flex items-center gap-2"
              >
                <Trophy className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400">
                  You've beaten @{record.name} {record.streak} times in a row
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Top tricks */}
      {stats.topTricks.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-neutral-400" />
            <span className="text-sm text-neutral-400">Most Set Tricks</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.topTricks.map((t) => (
              <span
                key={t.trick}
                className="px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-xs text-white"
              >
                {t.trick} <span className="text-neutral-500">x{t.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent results strip */}
      {stats.recentGames.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-neutral-400" />
            <span className="text-sm text-neutral-400">Recent</span>
          </div>
          <div className="flex gap-1">
            {stats.recentGames.map((g) => (
              <div
                key={g.id}
                className={cn(
                  "w-8 h-8 rounded flex items-center justify-center text-xs font-bold",
                  g.won
                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                    : "bg-red-500/20 text-red-400 border border-red-500/30"
                )}
                title={`${g.won ? "W" : "L"} vs ${g.opponentName}`}
              >
                {g.won ? "W" : "L"}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
