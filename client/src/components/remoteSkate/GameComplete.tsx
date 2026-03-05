/**
 * GameComplete — Remote SKATE game over screen.
 *
 * Derives player state from Firestore GameDoc, then delegates to the
 * shared GameOverScreen for consistent victory/defeat UI.
 */

import { GameOverScreen } from "@/components/game/GameOverScreen";
import type { GameDoc } from "@/lib/remoteSkate";
import { auth } from "@/lib/firebase";

interface GameCompleteProps {
  game: GameDoc & { id: string };
  winnerUid: string | null;
  onNewGame: () => void;
}

export function GameComplete({ game, winnerUid, onNewGame }: GameCompleteProps) {
  const uid = auth.currentUser?.uid;
  const iWon = winnerUid === uid;

  const myLetters = uid ? game.letters?.[uid] || "" : "";
  const opponentUid = uid === game.playerAUid ? game.playerBUid : game.playerAUid;
  const opponentLetters = opponentUid ? game.letters?.[opponentUid] || "" : "";

  return (
    <GameOverScreen
      iWon={iWon}
      myLetters={myLetters}
      oppLetters={opponentLetters}
      opponentName="Opponent"
      gameStatus={game.status}
      gameId={game.id}
      playerDisplayName="You"
      onRematch={onNewGame}
    />
  );
}
