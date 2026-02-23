import { Clock, Swords, ArrowLeft, Flag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Game } from "@/lib/api/game/types";

interface GameStatusHeaderProps {
  game: Game;
  isActive: boolean;
  isGameOver: boolean;
  isPending: boolean;
  isMyTurn: boolean;
  opponentName: string;
  turnPhase: string | null;
  isOffensive: boolean;
  onBack: () => void;
  onForfeit: () => void;
  forfeitPending: boolean;
}

export function GameStatusHeader({
  game,
  isActive,
  isGameOver,
  isPending,
  isMyTurn,
  opponentName,
  turnPhase,
  isOffensive,
  onBack,
  onForfeit,
  forfeitPending,
}: GameStatusHeaderProps) {
  const phaseLabels: Record<string, string> = {
    set_trick: isOffensive ? "Set your trick." : `${opponentName} is setting a trick.`,
    respond_trick: !isOffensive ? "Your turn to respond." : `${opponentName} is responding.`,
    judge: !isOffensive ? "Judge the trick." : `${opponentName} is judging.`,
  };

  return (
    <>
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        {isActive && !isGameOver && (
          <Button
            variant="ghost"
            onClick={onForfeit}
            disabled={forfeitPending}
            className="gap-2 text-red-400 hover:text-red-300"
          >
            <Flag className="w-4 h-4" />
            Forfeit
          </Button>
        )}
      </div>

      {/* Game Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
          <Swords className="w-6 h-6 text-orange-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">S.K.A.T.E.</h1>
          <p className="text-sm text-neutral-400">
            {isPending && "Waiting for opponent."}
            {isActive && !isGameOver && turnPhase && phaseLabels[turnPhase]}
            {isGameOver && (game.winnerId ? "Game over." : "Game over.")}
          </p>
        </div>
      </div>

      {/* Deadline */}
      {game.deadlineAt && isActive && !isGameOver && (
        <div
          className={cn(
            "p-3 rounded-lg flex items-center gap-3",
            isMyTurn
              ? "bg-red-500/10 border border-red-500/30"
              : "bg-neutral-800/50 border border-neutral-700"
          )}
        >
          <Clock className={cn("w-4 h-4", isMyTurn ? "text-red-400" : "text-neutral-400")} />
          <div className="text-sm">
            <span className={cn(isMyTurn ? "text-red-400" : "text-neutral-400")}>
              {formatDistanceToNow(new Date(game.deadlineAt), { addSuffix: true })}
            </span>
            {isMyTurn && <span className="text-red-400/60 ml-2">— your move</span>}
          </div>
        </div>
      )}
    </>
  );
}
