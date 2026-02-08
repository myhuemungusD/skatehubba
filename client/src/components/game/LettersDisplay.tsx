/**
 * LettersDisplay Component
 *
 * Displays S.K.A.T.E. letter progress for a player
 */

import { cn } from '@/lib/utils';

interface LettersDisplayProps {
  letters: string;
  playerName: string;
  isCurrentPlayer?: boolean;
  className?: string;
}

const SKATE = ['S', 'K', 'A', 'T', 'E'];

export function LettersDisplay({
  letters,
  playerName,
  isCurrentPlayer = false,
  className,
}: LettersDisplayProps) {
  const letterArray = letters.split('');

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div
        className={cn(
          'text-sm font-medium',
          isCurrentPlayer ? 'text-yellow-400' : 'text-neutral-400'
        )}
      >
        {playerName}
      </div>

      <div className="flex gap-1">
        {SKATE.map((letter, index) => {
          const hasLetter = index < letterArray.length;
          return (
            <div
              key={index}
              className={cn(
                'w-10 h-12 flex items-center justify-center rounded-lg border-2 text-lg font-bold transition-all',
                hasLetter
                  ? 'bg-red-500/20 border-red-500 text-red-400'
                  : 'bg-neutral-800/50 border-neutral-700 text-neutral-600'
              )}
            >
              {letter}
            </div>
          );
        })}
      </div>

      {letterArray.length === 5 && (
        <div className="text-xs text-red-400 font-medium">ELIMINATED</div>
      )}
    </div>
  );
}
