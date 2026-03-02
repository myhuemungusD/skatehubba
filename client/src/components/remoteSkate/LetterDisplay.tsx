/**
 * LetterDisplay — Adapter for the shared LettersDisplay component.
 *
 * Maps the remote-skate prop names (label, isCurrentUser) to the
 * canonical LettersDisplay props (playerName, isCurrentPlayer).
 */

import { LettersDisplay } from "@/components/game/LettersDisplay";

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
  return (
    <LettersDisplay
      letters={letters}
      playerName={label}
      isCurrentPlayer={isCurrentUser}
      className={className}
    />
  );
}
