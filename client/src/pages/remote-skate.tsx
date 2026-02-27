/**
 * Remote S.K.A.T.E. Page — Optimized 2-Click Start
 *
 * Flow: Skate button → "Play Random" or "Search Player" → Game.
 * Minimal friction — get into a game as fast as possible.
 */

import { useState, useEffect, useCallback } from "react";
import { useSearch } from "wouter";
import { Shuffle, Search, Loader2, X, ArrowLeft, Video, LogIn } from "lucide-react";
import { RemoteSkateService } from "@/lib/remoteSkate";
import { GameRound } from "@/components/remoteSkate/GameRound";
import { JoinGame } from "@/components/remoteSkate/JoinGame";
import { HowToPlay } from "@/components/remoteSkate/HowToPlay";
import { ActiveGames } from "@/components/remoteSkate/ActiveGames";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type View = "pick" | "searching" | "search-input" | "join" | "game";

export default function RemoteSkatePage() {
  const search = useSearch();
  const urlGameId = new URLSearchParams(search).get("remoteGameId");
  const { toast } = useToast();

  const [view, setView] = useState<View>(urlGameId ? "game" : "pick");
  const [activeGameId, setActiveGameId] = useState<string | null>(urlGameId);
  const [searchUsername, setSearchUsername] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [notifiedOpponent, setNotifiedOpponent] = useState<string | null>(null);

  // Deep-link into game
  useEffect(() => {
    if (urlGameId) {
      setActiveGameId(urlGameId);
      setView("game");
    }
  }, [urlGameId]);

  // ── Play Random ──────────────────────────────────────────────────────────
  const handlePlayRandom = useCallback(async () => {
    setView("searching");
    try {
      const { gameId, matched, opponentName } = await RemoteSkateService.findRandomGame();
      if (matched) {
        toast({ title: "Match found!", description: "Let's go!" });
        setActiveGameId(gameId);
        setView("game");
      } else {
        // Waiting for opponent — subscribe to game status changes
        setActiveGameId(gameId);
        setNotifiedOpponent(opponentName ?? null);
        // Stay on "searching" view — subscription below handles transition
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to find match";
      toast({ title: "Error", description: msg, variant: "destructive" });
      setView("pick");
    }
  }, [toast]);

  // Subscribe to waiting game — auto-transition when opponent joins
  useEffect(() => {
    if (view !== "searching" || !activeGameId) return;

    const unsub = RemoteSkateService.subscribeToGame(activeGameId, (game) => {
      if (game && game.status === "active") {
        toast({ title: "Opponent joined!", description: "Game on!" });
        setView("game");
      }
    });

    return unsub;
  }, [view, activeGameId, toast]);

  const handleCancelSearch = useCallback(async () => {
    if (activeGameId) {
      try {
        await RemoteSkateService.cancelWaitingGame(activeGameId);
      } catch {
        // Ignore — game may already be matched
      }
    }
    setActiveGameId(null);
    setNotifiedOpponent(null);
    setView("pick");
  }, [activeGameId]);

  // ── Search by Username ───────────────────────────────────────────────────
  const handleSearchSubmit = useCallback(async () => {
    const trimmed = searchUsername.trim();
    if (!trimmed) return;

    setIsSearching(true);
    try {
      // Create a game — the opponent joins via game ID or notification
      const gameId = await RemoteSkateService.createGame();
      toast({
        title: "Game created!",
        description: `Share game ID with @${trimmed} to start playing.`,
      });
      setActiveGameId(gameId);
      setView("game");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create game";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  }, [searchUsername, toast]);

  const handleGameJoined = (gameId: string) => {
    setActiveGameId(gameId);
    setView("game");
  };

  const handleBackToMenu = () => {
    setActiveGameId(null);
    setView("pick");
  };

  // ── IN-GAME VIEW ─────────────────────────────────────────────────────────
  if (view === "game" && activeGameId) {
    return <GameRound gameId={activeGameId} onBackToLobby={handleBackToMenu} />;
  }

  // ── JOIN BY GAME ID VIEW ─────────────────────────────────────────────────
  if (view === "join") {
    return (
      <div className="max-w-md mx-auto py-4">
        <button
          type="button"
          onClick={() => setView("pick")}
          className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300 transition-colors mb-4"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </button>
        <JoinGame onGameJoined={handleGameJoined} />
      </div>
    );
  }

  // ── SEARCHING VIEW (waiting for random opponent) ─────────────────────────
  if (view === "searching") {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-purple-500/10 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-purple-500/30 animate-ping" />
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-white">Finding Opponent...</h2>
          {notifiedOpponent ? (
            <p className="text-sm text-neutral-400">
              Challenged <span className="text-purple-400 font-medium">{notifiedOpponent}</span> —
              waiting for them to accept!
            </p>
          ) : (
            <p className="text-sm text-neutral-400">Waiting for someone to join. Share the vibe!</p>
          )}
        </div>

        <button
          type="button"
          onClick={handleCancelSearch}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg border border-neutral-700 text-neutral-300 text-sm hover:bg-neutral-800 transition-colors"
        >
          <X className="h-4 w-4" />
          Cancel
        </button>
      </div>
    );
  }

  // ── SEARCH INPUT VIEW ────────────────────────────────────────────────────
  if (view === "search-input") {
    return (
      <div className="max-w-md mx-auto py-4 space-y-6">
        <button
          type="button"
          onClick={() => setView("pick")}
          className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </button>

        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-white">Challenge a Skater</h2>
          <p className="text-sm text-neutral-400">Enter their username to start a battle</p>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={searchUsername}
            onChange={(e) => setSearchUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isSearching) handleSearchSubmit();
            }}
            placeholder="@username"
            disabled={isSearching}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional UX: user just tapped "Search Player"
            autoFocus
            className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-700 text-white text-sm placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/50 disabled:opacity-50"
            autoComplete="off"
          />

          <button
            type="button"
            onClick={handleSearchSubmit}
            disabled={isSearching || !searchUsername.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-yellow-400 text-black font-bold text-sm hover:bg-yellow-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {isSearching ? "Creating..." : "Challenge"}
          </button>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setView("join")}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors underline underline-offset-2"
          >
            Have a Game ID? Join directly
          </button>
        </div>
      </div>
    );
  }

  const handleResumeGame = (gameId: string) => {
    setActiveGameId(gameId);
    setView("game");
  };

  // ── PICK VIEW ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
          <Video className="w-5 h-5 text-purple-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Remote S.K.A.T.E.</h1>
          <p className="text-xs text-neutral-500">
            Async video trick battles — challenge anyone, anywhere
          </p>
        </div>
      </div>

      {/* How to Play (collapsible) */}
      <HowToPlay />

      {/* Active Games */}
      <ActiveGames onResumeGame={handleResumeGame} />

      {/* Start a new game */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
          Start a New Game
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Play Random */}
          <button
            type="button"
            onClick={handlePlayRandom}
            className={cn(
              "group relative flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all",
              "border-purple-500/40 hover:border-purple-400 hover:bg-purple-500/10",
              "active:scale-[0.98]"
            )}
          >
            <div className="w-14 h-14 rounded-full bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
              <Shuffle className="w-7 h-7 text-purple-400" />
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-white">Play Random</p>
              <p className="text-xs text-neutral-400 mt-1">Get matched with anyone online</p>
            </div>
          </button>

          {/* Challenge a Friend */}
          <button
            type="button"
            onClick={() => setView("search-input")}
            className={cn(
              "group relative flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all",
              "border-yellow-500/40 hover:border-yellow-400 hover:bg-yellow-500/10",
              "active:scale-[0.98]"
            )}
          >
            <div className="w-14 h-14 rounded-full bg-yellow-500/20 flex items-center justify-center group-hover:bg-yellow-500/30 transition-colors">
              <Search className="w-7 h-7 text-yellow-400" />
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-white">Challenge a Friend</p>
              <p className="text-xs text-neutral-400 mt-1">Create a game and share the link</p>
            </div>
          </button>
        </div>

        {/* Join by Game ID — visible button instead of hidden text */}
        <button
          type="button"
          onClick={() => setView("join")}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg border transition-colors",
            "border-neutral-700 text-neutral-300 text-sm hover:bg-neutral-800 hover:border-neutral-600"
          )}
        >
          <LogIn className="h-4 w-4" />
          Join Game by ID
        </button>
      </div>
    </div>
  );
}
