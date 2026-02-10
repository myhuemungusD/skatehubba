/**
 * GameComplete - Game over screen
 *
 * Shows winner/loser, final letter state, and CTA to start a new game.
 */

import { Trophy, Skull } from "lucide-react";
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

export function GameComplete({ game, winnerUid, loserUid, onNewGame }: GameCompleteProps) {
  const uid = auth.currentUser?.uid;
  const iWon = winnerUid === uid;

  const playerALetters = game.letters?.[game.playerAUid] || "";
  const playerBLetters = game.playerBUid ? game.letters?.[game.playerBUid] || "" : "";

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

        <p className={cn("text-sm mb-1", iWon ? "text-green-400" : "text-red-400")}>
          {iWon ? "You won the game!" : "You lost the game."}
        </p>
      </div>

      {/* Final letters */}
      <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-6">
        <h3 className="text-sm font-medium text-neutral-400 text-center mb-4">Final Score</h3>
        <div className="flex items-center justify-between gap-4">
          <LetterDisplay
            letters={uid === game.playerAUid ? playerALetters : playerBLetters}
            label="You"
            isCurrentUser
          />
          <div className="text-xs text-neutral-500 font-medium">VS</div>
          <LetterDisplay
            letters={uid === game.playerAUid ? playerBLetters : playerALetters}
            label="Opponent"
          />
        </div>
      </div>

      {/* Winner/Loser UIDs */}
      <div className="space-y-2 text-center">
        {winnerUid && (
          <p className="text-xs text-neutral-500">
            Winner: <span className="text-green-400 font-mono">{winnerUid}</span>
          </p>
        )}
        {loserUid && (
          <p className="text-xs text-neutral-500">
            Loser: <span className="text-red-400 font-mono">{loserUid}</span>
          </p>
        )}
        <p className="text-xs text-neutral-500">
          Player A: {playerALetters || "Clean"} | Player B: {playerBLetters || "Clean"}
        </p>
      </div>

      {/* New Game CTA */}
      <button
        type="button"
        onClick={onNewGame}
        className="w-full py-3 px-4 rounded-lg bg-yellow-400 text-black font-medium text-sm hover:bg-yellow-300 transition-colors"
      >
        Start New Game
      </button>
    </div>
  );
}
