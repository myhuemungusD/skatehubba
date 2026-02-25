/**
 * LettersDisplay Component
 *
 * Displays S.K.A.T.E. letter progress with escalating visual tension.
 * Color shifts from green (clean) → yellow → orange → red as letters accumulate.
 * Red glow animation at MATCH POINT (4 letters / "SKAT").
 */

import { cn } from "@/lib/utils";

interface LettersDisplayProps {
  letters: string;
  playerName: string;
  isCurrentPlayer?: boolean;
  className?: string;
}

const SKATE = ["S", "K", "A", "T", "E"];

/**
 * Returns escalation color based on letter count.
 * 0 = green (clean), 1-2 = yellow, 3 = orange, 4+ = red (match point / eliminated)
 */
function getEscalationColors(letterCount: number) {
  if (letterCount === 0)
    return { border: "border-green-500", bg: "bg-green-500/20", text: "text-green-400" };
  if (letterCount <= 2)
    return { border: "border-yellow-500", bg: "bg-yellow-500/20", text: "text-yellow-400" };
  if (letterCount === 3)
    return { border: "border-orange-500", bg: "bg-orange-500/20", text: "text-orange-400" };
  return { border: "border-red-500", bg: "bg-red-500/20", text: "text-red-400" };
}

function getStatusLabel(letterCount: number): string | null {
  if (letterCount === 0) return "Clean";
  if (letterCount <= 2) return null;
  if (letterCount === 3) return "One more and they're out";
  if (letterCount === 4) return "MATCH POINT";
  if (letterCount >= 5) return "S.K.A.T.E.";
  return null;
}

export function LettersDisplay({
  letters,
  playerName,
  isCurrentPlayer = false,
  className,
}: LettersDisplayProps) {
  const letterCount = letters.length;
  const isMatchPoint = letterCount === 4;
  const isEliminated = letterCount >= 5;
  const colors = getEscalationColors(letterCount);
  const statusLabel = getStatusLabel(letterCount);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div
        className={cn(
          "text-sm font-medium",
          isCurrentPlayer ? "text-yellow-400" : "text-neutral-400"
        )}
      >
        {playerName}
      </div>

      <div className={cn("flex gap-1", isMatchPoint && "animate-pulse")}>
        {SKATE.map((letter, index) => {
          const hasLetter = index < letterCount;
          return (
            <div
              key={index}
              className={cn(
                "w-10 h-12 flex items-center justify-center rounded-lg border-2 text-lg font-bold transition-all duration-300",
                hasLetter
                  ? cn(colors.bg, colors.border, colors.text)
                  : "bg-neutral-800/50 border-neutral-700 text-neutral-600",
                hasLetter && isMatchPoint && "shadow-[0_0_12px_rgba(239,68,68,0.5)]",
                hasLetter && isEliminated && "shadow-[0_0_16px_rgba(239,68,68,0.7)]"
              )}
            >
              {letter}
            </div>
          );
        })}
      </div>

      {statusLabel && (
        <div
          className={cn(
            "text-xs font-medium",
            isEliminated && "text-red-400",
            isMatchPoint && "text-red-400 animate-pulse font-bold",
            letterCount === 3 && "text-orange-400",
            letterCount === 0 && "text-green-400"
          )}
        >
          {statusLabel}
        </div>
      )}
    </div>
  );
}
