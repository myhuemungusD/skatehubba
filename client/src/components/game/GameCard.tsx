/**
 * GameCard Component
 *
 * Displays a game summary card
 */

import { formatDistanceToNow } from 'date-fns';
import { Clock, Trophy, User } from 'lucide-react';
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

  const statusColors = {
    pending: 'border-yellow-500/30 bg-yellow-500/5',
    active: 'border-green-500/30 bg-green-500/5',
    completed: 'border-neutral-700 bg-neutral-800/50',
    declined: 'border-neutral-700 bg-neutral-800/50',
    forfeited: 'border-neutral-700 bg-neutral-800/50',
  };

  const statusLabels = {
    pending: 'Pending',
    active: isMyTurn ? 'Your Turn' : "Opponent's Turn",
    completed: isWinner ? 'You Won!' : 'You Lost',
    declined: 'Declined',
    forfeited: 'Forfeited',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-4 rounded-lg border-2 transition-all hover:border-yellow-400/50',
        statusColors[game.status],
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

          {game.deadlineAt && game.status === 'active' && (
            <div className="flex items-center gap-1 text-xs text-neutral-400">
              <Clock className="w-3 h-3" />
              <span>
                Deadline: {formatDistanceToNow(new Date(game.deadlineAt), { addSuffix: true })}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            className={cn(
              'px-2 py-1 rounded text-xs font-medium',
              game.status === 'active' && isMyTurn && 'bg-yellow-500/20 text-yellow-400',
              game.status === 'active' && !isMyTurn && 'bg-neutral-700 text-neutral-300',
              game.status === 'pending' && 'bg-yellow-500/20 text-yellow-400',
              game.status === 'completed' &&
                isWinner &&
                'bg-green-500/20 text-green-400 flex items-center gap-1',
              game.status === 'completed' && !isWinner && 'bg-red-500/20 text-red-400',
              (game.status === 'declined' || game.status === 'forfeited') &&
                'bg-neutral-700 text-neutral-400'
            )}
          >
            {game.status === 'completed' && isWinner && <Trophy className="w-3 h-3" />}
            {statusLabels[game.status]}
          </span>

          <span className="text-xs text-neutral-500">
            {formatDistanceToNow(new Date(game.updatedAt), { addSuffix: true })}
          </span>
        </div>
      </div>
    </button>
  );
}
