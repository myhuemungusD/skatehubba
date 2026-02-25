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
  myLetters?: string;
  oppLetters?: string;
}

/** Returns escalation message based on opponent's letter count */
function getStakesMessage(oppLetters: string, opponentName: string): string | null {
  const count = oppLetters.length;
  if (count === 0) return null;
  if (count <= 2) return `${opponentName} is on ${oppLetters.split("").join(".")}`;
  if (count === 3) return `One more and ${opponentName} is out`;
  if (count === 4) return "MATCH POINT";
  return null;
}

function getStakesColor(oppLetterCount: number): string {
  if (oppLetterCount <= 2) return "text-yellow-400";
  if (oppLetterCount === 3) return "text-orange-400";
  if (oppLetterCount >= 4) return "text-red-400 font-bold animate-pulse";
  return "text-neutral-400";
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
  myLetters = "",
  oppLetters = "",
}: GameStatusHeaderProps) {
  const phaseLabels: Record<string, string> = {
    set_trick: isOffensive ? "Set your trick." : `${opponentName} is setting a trick.`,
    respond_trick: !isOffensive ? "Your turn to respond." : `${opponentName} is responding.`,
    judge: !isOffensive ? "Judge the trick." : `${opponentName} is judging.`,
  };

  const stakesMessage = isActive && !isGameOver ? getStakesMessage(oppLetters, opponentName) : null;
  const myStakesMessage =
    isActive && !isGameOver && myLetters.length >= 3
      ? myLetters.length === 4
        ? "YOU'RE ON MATCH POINT"
        : "One more and you're out"
      : null;

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
        <div
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center",
            myLetters.length >= 4 ? "bg-red-500/10" : "bg-orange-500/10"
          )}
        >
          <Swords
            className={cn("w-6 h-6", myLetters.length >= 4 ? "text-red-500" : "text-orange-500")}
          />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">S.K.A.T.E.</h1>
          <p className="text-sm text-neutral-400">
            {isPending && "Waiting for opponent."}
            {isActive && !isGameOver && turnPhase && phaseLabels[turnPhase]}
            {isGameOver && "Game over."}
          </p>
          {stakesMessage && (
            <p className={cn("text-xs mt-0.5", getStakesColor(oppLetters.length))}>
              {stakesMessage}
            </p>
          )}
          {myStakesMessage && (
            <p
              className={cn(
                "text-xs mt-0.5",
                myLetters.length === 4 ? "text-red-400 font-bold animate-pulse" : "text-orange-400"
              )}
            >
              {myStakesMessage}
            </p>
          )}
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
