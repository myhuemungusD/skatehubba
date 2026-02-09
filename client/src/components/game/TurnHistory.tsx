/**
 * TurnHistory Component
 *
 * Displays turn-by-turn history with turn type indicators (set/response).
 */

import { formatDistanceToNow } from 'date-fns';
import { Check, X, Clock, Play, Target, Shield } from 'lucide-react';
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
        No turns yet.
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {turns.map((turn) => {
        const isMyTurn = turn.playerId === currentUserId;
        const isPending = turn.result === 'pending';
        const isLanded = turn.result === 'landed';
        const isMissed = turn.result === 'missed';
        const isSetTrick = turn.turnType === 'set';

        return (
          <div
            key={turn.id}
            className={cn(
              'p-3 rounded-lg border transition-all',
              isPending && 'border-yellow-500/20 bg-yellow-500/5',
              isLanded && 'border-green-500/20 bg-green-500/5',
              isMissed && 'border-red-500/20 bg-red-500/5'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  {isSetTrick ? (
                    <Target className="w-3 h-3 text-orange-400" />
                  ) : (
                    <Shield className="w-3 h-3 text-blue-400" />
                  )}
                  <span className="text-xs text-neutral-500">
                    {isSetTrick ? 'SET' : 'RESPONSE'}
                  </span>
                  <span className={cn('text-sm font-medium', isMyTurn ? 'text-yellow-400' : 'text-white')}>
                    {turn.playerName}
                  </span>
                </div>

                <div className="text-sm text-neutral-300">{turn.trickDescription}</div>

                {turn.videoUrl && (
                  <button
                    onClick={() => onVideoClick?.(turn.videoUrl)}
                    className="inline-flex items-center gap-1.5 text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
                    type="button"
                  >
                    <Play className="w-3 h-3" />
                    Watch
                  </button>
                )}
              </div>

              <div className="flex flex-col items-end gap-1">
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
}
