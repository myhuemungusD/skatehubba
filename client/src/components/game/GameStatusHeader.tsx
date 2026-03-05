import { ArrowLeft, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GameStatusHeaderProps {
  isActive: boolean;
  isGameOver: boolean;
  isPending: boolean;
  opponentName: string;
  turnPhase: string | null;
  isOffensive: boolean;
  onBack: () => void;
  onForfeit: () => void;
  forfeitPending: boolean;
}

export function GameStatusHeader({
  isActive,
  isGameOver,
  isPending,
  opponentName,
  turnPhase,
  isOffensive,
  onBack,
  onForfeit,
  forfeitPending,
}: GameStatusHeaderProps) {
  const phaseLabels: Record<string, string> = {
    set_trick: isOffensive ? "Set your trick" : `${opponentName} is setting`,
    respond_trick: !isOffensive ? "Your turn to respond" : `${opponentName} is responding`,
    judge: !isOffensive ? "Judge the trick" : `${opponentName} is judging`,
  };

  const statusText = isPending
    ? "Waiting for opponent"
    : isGameOver
      ? "Game over"
      : turnPhase
        ? phaseLabels[turnPhase]
        : "";

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 px-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <span className="text-sm text-neutral-400">{statusText}</span>
      </div>
      {isActive && !isGameOver && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onForfeit}
          disabled={forfeitPending}
          className="gap-1.5 px-2 text-red-400 hover:text-red-300"
        >
          <Flag className="w-4 h-4" />
          Forfeit
        </Button>
      )}
    </div>
  );
}
