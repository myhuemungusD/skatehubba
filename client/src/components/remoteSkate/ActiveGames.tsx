/**
 * ActiveGames - Shows user's in-progress and waiting games so they can resume
 */

import { useState, useEffect } from "react";
import { Clock, Swords, ChevronRight, Loader2 } from "lucide-react";
import { RemoteSkateService, type GameDoc } from "@/lib/remoteSkate";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/utils";

interface ActiveGamesProps {
  onResumeGame: (gameId: string) => void;
}

export function ActiveGames({ onResumeGame }: ActiveGamesProps) {
  const [games, setGames] = useState<(GameDoc & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) {
      setIsLoading(false);
      return;
    }

    const allGames: Map<string, GameDoc & { id: string }> = new Map();
    let aLoaded = false;
    let bLoaded = false;

    const checkDone = () => {
      if (aLoaded && bLoaded) setIsLoading(false);
    };

    // Subscribe to games where user is Player A
    const unsubA = RemoteSkateService.subscribeToMyGames(uid, "playerA", (gamesA) => {
      for (const g of gamesA) allGames.set(g.id, g);
      aLoaded = true;
      checkDone();
      updateGames();
    });

    // Subscribe to games where user is Player B
    const unsubB = RemoteSkateService.subscribeToMyGames(uid, "playerB", (gamesB) => {
      for (const g of gamesB) allGames.set(g.id, g);
      bLoaded = true;
      checkDone();
      updateGames();
    });

    function updateGames() {
      const activeOrWaiting = Array.from(allGames.values()).filter(
        (g) => g.status === "active" || g.status === "waiting"
      );
      // Sort by most recent activity
      activeOrWaiting.sort((a, b) => {
        const aTime =
          a.lastMoveAt && "toMillis" in (a.lastMoveAt as object)
            ? (a.lastMoveAt as { toMillis: () => number }).toMillis()
            : 0;
        const bTime =
          b.lastMoveAt && "toMillis" in (b.lastMoveAt as object)
            ? (b.lastMoveAt as { toMillis: () => number }).toMillis()
            : 0;
        return bTime - aTime;
      });
      setGames(activeOrWaiting);
    }

    return () => {
      unsubA();
      unsubB();
    };
  }, [uid]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 text-neutral-500 animate-spin" />
      </div>
    );
  }

  if (games.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
        Your Active Games
      </h3>
      <div className="space-y-2">
        {games.map((game) => (
          <GameRow key={game.id} game={game} uid={uid!} onResume={() => onResumeGame(game.id)} />
        ))}
      </div>
    </div>
  );
}

function GameRow({
  game,
  uid,
  onResume,
}: {
  game: GameDoc & { id: string };
  uid: string;
  onResume: () => void;
}) {
  const isMyTurn = game.currentTurnUid === uid;
  const isWaiting = game.status === "waiting";

  return (
    <button
      type="button"
      onClick={onResume}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left",
        isMyTurn
          ? "border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10"
          : "border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800/50"
      )}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          isWaiting ? "bg-neutral-800" : isMyTurn ? "bg-yellow-500/20" : "bg-neutral-800"
        )}
      >
        {isWaiting ? (
          <Clock className="h-4 w-4 text-neutral-400" />
        ) : (
          <Swords className="h-4 w-4 text-yellow-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">
          {isWaiting ? "Waiting for opponent" : isMyTurn ? "Your turn!" : "Opponent's turn"}
        </p>
        <p className="text-xs text-neutral-500 font-mono truncate">{game.id.slice(0, 12)}...</p>
      </div>

      {isMyTurn && !isWaiting && (
        <span className="px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 text-xs font-medium shrink-0">
          Go
        </span>
      )}

      <ChevronRight className="h-4 w-4 text-neutral-600 shrink-0" />
    </button>
  );
}
