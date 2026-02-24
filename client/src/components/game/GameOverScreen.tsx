import { Trophy, Skull } from "lucide-react";
import { SocialShare } from "./SocialShare";
import { cn } from "@/lib/utils";

interface GameOverScreenProps {
  iWon: boolean;
  myLetters: string;
  oppLetters: string;
  opponentName: string;
  gameStatus: string;
  gameId: string;
  playerDisplayName: string;
}

export function GameOverScreen({
  iWon,
  myLetters,
  oppLetters,
  opponentName,
  gameStatus,
  gameId,
  playerDisplayName,
}: GameOverScreenProps) {
  return (
    <div
      className={cn(
        "p-8 rounded-lg border-2 text-center",
        iWon ? "bg-green-500/10 border-green-500" : "bg-red-500/10 border-red-500"
      )}
    >
      {iWon ? (
        <Trophy className="w-14 h-14 text-green-400 mx-auto mb-3" />
      ) : (
        <Skull className="w-14 h-14 text-red-400 mx-auto mb-3" />
      )}
      <h2 className="text-3xl font-black mb-2 text-white">{iWon ? "VICTORY" : "GAME OVER"}</h2>
      <div className="space-y-1 text-sm">
        <p className={iWon ? "text-green-400" : "text-red-400"}>
          {iWon ? `${opponentName} has S.K.A.T.E.` : `You have S.K.A.T.E.`}
        </p>
        <p className="text-neutral-500">
          You: {myLetters || "Clean"} | {opponentName}: {oppLetters || "Clean"}
        </p>
        {gameStatus === "forfeited" && (
          <p className="text-neutral-500 mt-2">
            {iWon ? "Opponent forfeited." : "You forfeited."}
          </p>
        )}
      </div>
      <div className="mt-6 flex justify-center">
        <SocialShare
          gameId={gameId}
          playerOne={playerDisplayName}
          playerTwo={opponentName}
          result={iWon ? `${playerDisplayName} won` : `${opponentName} won`}
        />
      </div>
    </div>
  );
}
