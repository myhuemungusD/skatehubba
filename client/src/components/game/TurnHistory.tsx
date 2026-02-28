/**
 * TurnHistory Component
 *
 * Displays turn-by-turn history with thumbnails, turn type indicators,
 * and result badges.
 */

import { memo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Check, X, Clock, Play, Target, Shield, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GameTurn } from "@/lib/api/game";

interface TurnHistoryProps {
  turns: GameTurn[];
  currentUserId: string;
  onVideoClick?: (videoUrl: string) => void;
  className?: string;
}

export const TurnHistory = memo(function TurnHistory({
  turns,
  currentUserId,
  onVideoClick,
  className,
}: TurnHistoryProps) {
  if (turns.length === 0) {
    return <div className={cn("text-center py-8 text-neutral-500", className)}>No turns yet.</div>;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {turns.map((turn) => {
        const isMyTurn = turn.playerId === currentUserId;
        const isPending = turn.result === "pending";
        const isLanded = turn.result === "landed";
        const isMissed = turn.result === "missed";
        const isSetTrick = turn.turnType === "set";

        return (
          <div
            key={turn.id}
            className={cn(
              "p-3 rounded-lg border transition-all",
              isPending && "border-yellow-500/20 bg-yellow-500/5",
              isLanded && "border-green-500/20 bg-green-500/5",
              isMissed && "border-red-500/20 bg-red-500/5"
            )}
          >
            <div className="flex items-start gap-3">
              {/* Thumbnail */}
              {turn.videoUrl && (
                <button
                  onClick={() => onVideoClick?.(turn.videoUrl)}
                  className="relative flex-shrink-0 w-16 h-20 rounded bg-black overflow-hidden group"
                  type="button"
                  aria-label={`Play video: ${turn.trickDescription}`}
                >
                  {turn.thumbnailUrl ? (
                    <img
                      src={turn.thumbnailUrl}
                      alt={turn.trickDescription}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="w-5 h-5 text-neutral-600" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                    <Play className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              )}

              {/* Turn Info */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  {isSetTrick ? (
                    <Target className="w-3 h-3 text-orange-400" />
                  ) : (
                    <Shield className="w-3 h-3 text-blue-400" />
                  )}
                  <span className="text-xs text-neutral-500">
                    {isSetTrick ? "SET" : "RESPONSE"}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isMyTurn ? "text-yellow-400" : "text-white"
                    )}
                  >
                    {turn.playerName}
                  </span>
                </div>

                <div className="text-sm text-neutral-300 truncate">{turn.trickDescription}</div>

                {turn.videoUrl && !turn.thumbnailUrl && (
                  <button
                    onClick={() => onVideoClick?.(turn.videoUrl)}
                    className="inline-flex items-center gap-1.5 text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
                    type="button"
                    aria-label={`Watch video: ${turn.trickDescription}`}
                  >
                    <Play className="w-3 h-3" />
                    Watch
                  </button>
                )}
              </div>

              {/* Result + Timestamp */}
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {isPending && (
                  <div className="flex items-center gap-1 text-xs text-yellow-400">
                    <Clock className="w-3 h-3" />
                    <span>Pending</span>
                  </div>
                )}
                {isLanded && (
                  <div className="flex items-center gap-1 text-xs text-green-400">
                    <Check className="w-3 h-3" />
                    <span>LAND</span>
                  </div>
                )}
                {isMissed && (
                  <div className="flex items-center gap-1 text-xs text-red-400">
                    <X className="w-3 h-3" />
                    <span>BAIL</span>
                  </div>
                )}
                <span className="text-xs text-neutral-600">
                  {formatDistanceToNow(new Date(turn.createdAt), { addSuffix: true })}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});
