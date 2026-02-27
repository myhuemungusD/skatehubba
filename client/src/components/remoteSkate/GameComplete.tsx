/**
 * GameComplete - Game over screen
 *
 * Shows winner/loser, final letter state, and CTA to start a new game.
 */

import { Trophy, Skull, RotateCcw, ArrowLeft } from "lucide-react";
import { LetterDisplay } from "./LetterDisplay";
import { cn } from "@/lib/utils";
import type { GameDoc } from "@/lib/remoteSkate";
import { auth } from "@/lib/firebase";

interface GameCompleteProps {
  game: GameDoc & { id: string };
  winnerUid: string | null;
  loserUid: string | null;
  onNewGame: () => void;
}

export function GameComplete({
  game,
  winnerUid,
  loserUid: _loserUid,
  onNewGame,
}: GameCompleteProps) {
  const uid = auth.currentUser?.uid;
  const iWon = winnerUid === uid;

  const myLetters = uid ? game.letters?.[uid] || "" : "";
  const opponentUid = uid === game.playerAUid ? game.playerBUid : game.playerAUid;
  const opponentLetters = opponentUid ? game.letters?.[opponentUid] || "" : "";

  return (
    <div className="space-y-6">
      {/* Result banner */}
      <div
        className={cn(
          "p-8 rounded-lg border-2 text-center",
          iWon ? "bg-green-500/10 border-green-500/50" : "bg-red-500/10 border-red-500/50"
        )}
      >
        {iWon ? (
          <Trophy className="w-14 h-14 text-green-400 mx-auto mb-3" />
        ) : (
          <Skull className="w-14 h-14 text-red-400 mx-auto mb-3" />
        )}

        <h2 className="text-3xl font-black mb-2 text-white">{iWon ? "VICTORY" : "GAME OVER"}</h2>

        <p className={cn("text-sm", iWon ? "text-green-400" : "text-red-400")}>
          {iWon
            ? "You won! Your opponent spelled out S.K.A.T.E."
            : "You spelled out S.K.A.T.E. Better luck next time!"}
        </p>
      </div>

      {/* Final score */}
      <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-6">
        <h3 className="text-sm font-medium text-neutral-400 text-center mb-4">Final Score</h3>
        <div className="flex items-center justify-between gap-4">
          <LetterDisplay letters={myLetters} label="You" isCurrentUser />
          <div className="text-xs text-neutral-500 font-medium">VS</div>
          <LetterDisplay letters={opponentLetters} label="Opponent" />
        </div>
        <p className="text-xs text-neutral-500 text-center mt-3">
          {iWon
            ? `You finished clean with ${myLetters.length === 0 ? "no letters" : `only "${myLetters}"`}!`
            : `Your opponent finished with ${opponentLetters.length === 0 ? "no letters" : `only "${opponentLetters}"`}.`}
        </p>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={onNewGame}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-yellow-400 text-black font-bold text-sm hover:bg-yellow-300 transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          Play Again
        </button>

        <button
          type="button"
          onClick={onNewGame}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-neutral-700 text-neutral-300 text-sm hover:bg-neutral-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Lobby
        </button>
      </div>
    </div>
  );
}
