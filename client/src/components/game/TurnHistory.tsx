/**
 * TurnHistory Component
 *
 * Displays turn-by-turn history of a game
 */

import { formatDistanceToNow } from 'date-fns';
import { Check, X, Clock, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GameTurn } from '@/lib/api/game';

interface TurnHistoryProps {
  turns: GameTurn[];
  currentUserId: string;
  onVideoClick?: (videoUrl: string) => void;
  className?: string;
}

export function TurnHistory({ turns, currentUserId, onVideoClick, className }: TurnHistoryProps) {
  if (turns.length === 0) {
    return (
      <div className={cn('text-center py-8 text-neutral-500', className)}>
        No turns yet. Set the first trick!
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {turns.map((turn) => {
        const isMyTurn = turn.playerId === currentUserId;
        const isPending = turn.result === 'pending';
        const isLanded = turn.result === 'landed';
        const isMissed = turn.result === 'missed';

        return (
          <div
            key={turn.id}
            className={cn(
              'p-4 rounded-lg border transition-all',
              isPending && 'border-yellow-500/30 bg-yellow-500/5',
              isLanded && 'border-green-500/30 bg-green-500/5',
              isMissed && 'border-red-500/30 bg-red-500/5'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-400">Turn {turn.turnNumber}</span>
                  <span className={cn('font-medium', isMyTurn ? 'text-yellow-400' : 'text-white')}>
                    {turn.playerName}
                  </span>
                </div>

                <div className="text-sm text-neutral-300">{turn.trickDescription}</div>

                {turn.videoUrl && (
                  <button
                    onClick={() => onVideoClick?.(turn.videoUrl)}
                    className="inline-flex items-center gap-2 text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
                    type="button"
                  >
                    <Play className="w-4 h-4" />
                    <span>Watch Video</span>
                  </button>
                )}

                <div className="text-xs text-neutral-500">
                  {formatDistanceToNow(new Date(turn.createdAt), { addSuffix: true })}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                {isPending && (
                  <div className="flex items-center gap-1 text-xs text-yellow-400">
                    <Clock className="w-4 h-4" />
                    <span>Pending</span>
                  </div>
                )}

                {isLanded && (
                  <div className="flex items-center gap-1 text-xs text-green-400">
                    <Check className="w-4 h-4" />
                    <span>Landed</span>
                  </div>
                )}

                {isMissed && (
                  <div className="flex items-center gap-1 text-xs text-red-400">
                    <X className="w-4 h-4" />
                    <span>Missed</span>
                  </div>
                )}

                {turn.judgedBy && turn.judgedAt && (
                  <div className="text-xs text-neutral-500">
                    Judged {formatDistanceToNow(new Date(turn.judgedAt), { addSuffix: true })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
