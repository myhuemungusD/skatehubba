/**
 * Remote S.K.A.T.E. Page
 *
 * Firestore-based video upload S.K.A.T.E. battles.
 * Shows Create/Join when no active game, or GameRound when in a game.
 */

import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { Video, Plus, LogIn } from "lucide-react";
import { CreateGame } from "@/components/remoteSkate/CreateGame";
import { JoinGame } from "@/components/remoteSkate/JoinGame";
import { GameRound } from "@/components/remoteSkate/GameRound";
import { cn } from "@/lib/utils";

type RemoteSkateView = "menu" | "create" | "join" | "game";

export default function RemoteSkatePage() {
  const search = useSearch();
  const urlGameId = new URLSearchParams(search).get("remoteGameId");

  const [view, setView] = useState<RemoteSkateView>(urlGameId ? "game" : "menu");
  const [activeGameId, setActiveGameId] = useState<string | null>(urlGameId);

  useEffect(() => {
    if (urlGameId) {
      setActiveGameId(urlGameId);
      setView("game");
    }
  }, [urlGameId]);

  const handleGameCreated = (gameId: string) => {
    setActiveGameId(gameId);
    setView("game");
  };

  const handleGameJoined = (gameId: string) => {
    setActiveGameId(gameId);
    setView("game");
  };

  const handleBackToMenu = () => {
    setActiveGameId(null);
    setView("menu");
  };

  // In-game view
  if (view === "game" && activeGameId) {
    return <GameRound gameId={activeGameId} onBackToLobby={handleBackToMenu} />;
  }

  // Create game view
  if (view === "create") {
    return (
      <div className="max-w-md mx-auto py-4">
        <button
          type="button"
          onClick={() => setView("menu")}
          className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors mb-4"
        >
          Back
        </button>
        <CreateGame onGameCreated={handleGameCreated} />
      </div>
    );
  }

  // Join game view
  if (view === "join") {
    return (
      <div className="max-w-md mx-auto py-4">
        <button
          type="button"
          onClick={() => setView("menu")}
          className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors mb-4"
        >
          Back
        </button>
        <JoinGame onGameJoined={handleGameJoined} />
      </div>
    );
  }

  // Menu view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
          <Video className="w-6 h-6 text-purple-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Remote S.K.A.T.E.</h1>
          <p className="text-sm text-neutral-400">Video-verified trick battles</p>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setView("create")}
          className={cn(
            "flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-dashed transition-all",
            "border-purple-500/30 hover:border-purple-500/60 hover:bg-purple-500/5"
          )}
        >
          <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
            <Plus className="w-6 h-6 text-purple-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white">Create Game</p>
            <p className="text-xs text-neutral-500 mt-1">Start a new battle</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setView("join")}
          className={cn(
            "flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-dashed transition-all",
            "border-yellow-500/30 hover:border-yellow-500/60 hover:bg-yellow-500/5"
          )}
        >
          <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
            <LogIn className="w-6 h-6 text-yellow-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white">Join Game</p>
            <p className="text-xs text-neutral-500 mt-1">Enter a Game ID</p>
          </div>
        </button>
      </div>

      {/* Info */}
      <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-neutral-300 mb-2">How it works</h3>
        <ol className="text-xs text-neutral-500 space-y-1.5 list-decimal list-inside">
          <li>Create a game and share the Game ID with your opponent</li>
          <li>Offense uploads a set trick video</li>
          <li>Defense watches and uploads their reply video</li>
          <li>Offense decides: Landed or Missed</li>
          <li>If missed, defense gets a letter. If landed, roles swap.</li>
          <li>First to spell S.K.A.T.E. loses!</li>
        </ol>
      </div>
    </div>
  );
}
