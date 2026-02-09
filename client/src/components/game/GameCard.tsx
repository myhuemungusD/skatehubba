/**
 * GameCard Component
 *
 * Compact game summary card with turn phase indicator.
 */

import { formatDistanceToNow } from 'date-fns';
import { Clock, Trophy, User, Target, Shield, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Game } from '@/lib/api/game';

interface GameCardProps {
  game: Game;
  currentUserId: string;
  onClick?: () => void;
  className?: string;
}

export function GameCard({ game, currentUserId, onClick, className }: GameCardProps) {
  const isPlayer1 = game.player1Id === currentUserId;
  const opponentName = isPlayer1 ? game.player2Name : game.player1Name;
  const myLetters = isPlayer1 ? game.player1Letters : game.player2Letters;
  const oppLetters = isPlayer1 ? game.player2Letters : game.player1Letters;
  const isMyTurn = game.currentTurn === currentUserId;
  const isWinner = game.winnerId === currentUserId;
  const isOffensive = game.offensivePlayerId === currentUserId;
  const isDefensive = game.defensivePlayerId === currentUserId;

  const statusColors: Record<string, string> = {
    pending: 'border-yellow-500/30 bg-yellow-500/5',
    active: isMyTurn ? 'border-orange-500/30 bg-orange-500/5' : 'border-neutral-700 bg-neutral-800/50',
    completed: 'border-neutral-700 bg-neutral-800/50',
    declined: 'border-neutral-700 bg-neutral-800/50',
    forfeited: 'border-neutral-700 bg-neutral-800/50',
  };

  const getPhaseLabel = () => {
    if (game.status !== 'active') return null;
    if (!isMyTurn) return 'Waiting';
    if (game.turnPhase === 'set_trick' && isOffensive) return 'Set trick';
    if (game.turnPhase === 'respond_trick' && isDefensive) return 'Respond';
    if (game.turnPhase === 'judge' && isDefensive) return 'Judge';
    return 'Your turn';
  };

  const statusLabels: Record<string, string> = {
    pending: 'Pending',
    active: isMyTurn ? (getPhaseLabel() || 'Your Turn') : 'Waiting',
    completed: isWinner ? 'Won' : 'Lost',
    declined: 'Declined',
    forfeited: 'Forfeit',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-4 rounded-lg border-2 transition-all hover:border-yellow-400/50',
        statusColors[game.status] || 'border-neutral-700 bg-neutral-800/50',
        onClick && 'cursor-pointer',
        className
      )}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-neutral-400" />
            <span className="font-medium text-white">{opponentName}</span>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <span className="text-neutral-400">You:</span>
              <span className={cn('font-bold', myLetters ? 'text-red-400' : 'text-green-400')}>
                {myLetters || 'Clean'}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-neutral-400">Them:</span>
              <span className={cn('font-bold', oppLetters ? 'text-red-400' : 'text-green-400')}>
                {oppLetters || 'Clean'}
              </span>
            </div>
          </div>

          {game.status === 'active' && isMyTurn && game.turnPhase && (
            <div className="flex items-center gap-1 text-xs">
              {game.turnPhase === 'set_trick' && <Target className="w-3 h-3 text-orange-400" />}
              {game.turnPhase === 'respond_trick' && <Shield className="w-3 h-3 text-blue-400" />}
              {game.turnPhase === 'judge' && <AlertTriangle className="w-3 h-3 text-yellow-400" />}
              <span className="text-neutral-400">{getPhaseLabel()}</span>
            </div>
          )}

          {game.deadlineAt && game.status === 'active' && (
            <div className="flex items-center gap-1 text-xs text-neutral-500">
              <Clock className="w-3 h-3" />
              <span>
                {formatDistanceToNow(new Date(game.deadlineAt), { addSuffix: true })}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            className={cn(
              'px-2 py-1 rounded text-xs font-medium',
              game.status === 'active' && isMyTurn && 'bg-orange-500/20 text-orange-400',
              game.status === 'active' && !isMyTurn && 'bg-neutral-700 text-neutral-300',
              game.status === 'pending' && 'bg-yellow-500/20 text-yellow-400',
              game.status === 'completed' && isWinner && 'bg-green-500/20 text-green-400 flex items-center gap-1',
              game.status === 'completed' && !isWinner && 'bg-red-500/20 text-red-400',
              (game.status === 'declined' || game.status === 'forfeited') && 'bg-neutral-700 text-neutral-400'
            )}
          >
            {game.status === 'completed' && isWinner && <Trophy className="w-3 h-3" />}
            {statusLabels[game.status] || game.status}
          </span>

          <span className="text-xs text-neutral-500">
            {formatDistanceToNow(new Date(game.updatedAt), { addSuffix: true })}
          </span>
        </div>
      </div>
    </button>
  );
}
