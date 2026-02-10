/**
 * JoinGame - Join an existing Remote S.K.A.T.E. game via game ID
 */

import { useState, useCallback } from "react";
import { LogIn, Loader2 } from "lucide-react";
import { RemoteSkateService } from "@/lib/remoteSkate";
import { useToast } from "@/hooks/use-toast";

interface JoinGameProps {
  onGameJoined: (gameId: string) => void;
}

export function JoinGame({ onGameJoined }: JoinGameProps) {
  const { toast } = useToast();
  const [gameId, setGameId] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = useCallback(async () => {
    const trimmed = gameId.trim();
    if (!trimmed) {
      toast({
        title: "Missing Game ID",
        description: "Please enter a Game ID to join.",
        variant: "destructive",
      });
      return;
    }

    setIsJoining(true);
    try {
      await RemoteSkateService.joinGame(trimmed);
      toast({ title: "Joined!", description: "You've joined the game. Let's go!" });
      onGameJoined(trimmed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to join game";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsJoining(false);
    }
  }, [gameId, toast, onGameJoined]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !isJoining) {
        handleJoin();
      }
    },
    [handleJoin, isJoining]
  );

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold text-white">Join a Game</h3>
        <p className="text-sm text-neutral-400">
          Enter the Game ID shared by your opponent to join their game.
        </p>
      </div>

      <div className="space-y-3">
        <input
          type="text"
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste Game ID here..."
          disabled={isJoining}
          className="w-full px-4 py-2.5 rounded-lg bg-neutral-900 border border-neutral-700 text-white text-sm font-mono placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/50 disabled:opacity-50"
          autoComplete="off"
          autoFocus
        />

        <button
          type="button"
          onClick={handleJoin}
          disabled={isJoining || !gameId.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-yellow-400 text-black font-medium text-sm hover:bg-yellow-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isJoining ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {isJoining ? "Joining..." : "Join Game"}
        </button>
      </div>
    </div>
  );
}
