/**
 * CreateGame - Create a new Remote S.K.A.T.E. game
 *
 * Creates a game doc in Firestore and shows a shareable game ID.
 */

import { useState, useCallback } from "react";
import { Copy, Check, Loader2, Plus } from "lucide-react";
import { RemoteSkateService } from "@/lib/remoteSkate";
import { useToast } from "@/hooks/use-toast";

interface CreateGameProps {
  onGameCreated: (gameId: string) => void;
}

export function CreateGame({ onGameCreated }: CreateGameProps) {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    try {
      const id = await RemoteSkateService.createGame();
      setGameId(id);
      toast({ title: "Game created", description: "Share the Game ID with your opponent." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create game";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  }, [toast]);

  const handleCopy = useCallback(async () => {
    if (!gameId) return;
    try {
      await navigator.clipboard.writeText(gameId);
      setCopied(true);
      toast({ title: "Copied!", description: "Game ID copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Please copy the ID manually.",
        variant: "destructive",
      });
    }
  }, [gameId, toast]);

  if (gameId) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-white">Game Created</h3>
          <p className="text-sm text-neutral-400">
            Share this Game ID with your opponent so they can join.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-700 rounded-lg p-3">
          <code className="flex-1 text-sm text-yellow-400 font-mono break-all select-all">
            {gameId}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 p-2 rounded-md hover:bg-neutral-800 transition-colors"
            aria-label="Copy game ID"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : (
              <Copy className="h-4 w-4 text-neutral-400" />
            )}
          </button>
        </div>

        <p className="text-xs text-neutral-500 text-center">Waiting for opponent to join...</p>

        <button
          type="button"
          onClick={() => onGameCreated(gameId)}
          className="w-full py-2.5 px-4 rounded-lg bg-yellow-400 text-black font-medium text-sm hover:bg-yellow-300 transition-colors"
        >
          Go to Game
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold text-white">Create a Game</h3>
        <p className="text-sm text-neutral-400">
          Start a new Remote S.K.A.T.E. battle. You'll get a Game ID to share with your opponent.
        </p>
      </div>

      <button
        type="button"
        onClick={handleCreate}
        disabled={isCreating}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-yellow-400 text-black font-medium text-sm hover:bg-yellow-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {isCreating ? "Creating..." : "Create New Game"}
      </button>
    </div>
  );
}
