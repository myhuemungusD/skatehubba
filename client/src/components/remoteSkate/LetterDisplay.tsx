/**
 * LetterDisplay - Shows S.K.A.T.E. letter progress for a player
 */

import { cn } from "@/lib/utils";

const SKATE_LETTERS = ["S", "K", "A", "T", "E"];

interface LetterDisplayProps {
  letters: string;
  label: string;
  isCurrentUser?: boolean;
  className?: string;
}

export function LetterDisplay({
  letters,
  label,
  isCurrentUser = false,
  className,
}: LetterDisplayProps) {
  const activeCount = letters.length;

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <span
        className={cn(
          "text-xs font-medium truncate max-w-[120px]",
          isCurrentUser ? "text-yellow-400" : "text-neutral-400"
        )}
      >
        {label}
      </span>
      <div className="flex gap-1">
        {SKATE_LETTERS.map((letter, i) => (
          <span
            key={letter}
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded text-sm font-bold transition-colors",
              i < activeCount
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "bg-neutral-800 text-neutral-600 border border-neutral-700"
            )}
          >
            {letter}
          </span>
        ))}
      </div>
    </div>
  );
}
