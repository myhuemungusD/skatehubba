import { useMemo } from "react";
import { Crown, Shield, Swords, Loader2, AlertCircle, Trophy, Skull } from "lucide-react";
import MobileLayout from "../components/layout/MobileLayout";
import { useSkateGame } from "../hooks/useSkateGame";
import { useAuth } from "../context/AuthProvider";
import { Button } from "../components/ui/button";

const fullWord = ["S", "K", "A", "T", "E"];

export default function SkateGamePage() {
  const { user } = useAuth();
  
  // Extract gameId from URL query params
  const gameId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("gameId");
  }, []);

  const { 
    game, 
    isLoading, 
    error, 
    submitMove, 
    isMovePending,
    getGameState 
  } = useSkateGame(gameId);

  const { 
    isMyTurn, 
    isOffense, 
    myLetters, 
    oppLetters, 
    opponentName,
    isGameOver,
    iWon
  } = getGameState(user?.uid);

  // --- Loading State ---
  if (isLoading) {
    return (
      <MobileLayout>
        <div className="flex h-screen flex-col items-center justify-center bg-neutral-950 text-white">
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-yellow-500" />
          <p className="text-neutral-400">Loading Arena...</p>
        </div>
      </MobileLayout>
    );
  }

  // --- Error State ---
  if (error || !game) {
    return (
      <MobileLayout>
        <div className="flex h-screen flex-col items-center justify-center bg-neutral-950 px-6 text-center text-white">
          <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
          <h2 className="mb-2 text-xl font-bold">Game Not Found</h2>
          <p className="mb-6 text-neutral-400">This game might have ended or doesn't exist.</p>
          <Button onClick={() => window.location.href = '/game'} variant="outline">
            Return to Lobby
          </Button>
        </div>
      </MobileLayout>
    );
  }

  // --- Game Over State ---
  if (isGameOver) {
    return (
      <MobileLayout>
        <div className="flex h-screen flex-col items-center justify-center bg-neutral-950 px-6 text-center text-white">
          {iWon ? (
            <div className="animate-in zoom-in duration-500">
              <Trophy className="mx-auto mb-6 h-24 w-24 text-yellow-500" />
              <h1 className="mb-2 text-4xl font-black uppercase tracking-tighter text-yellow-500">Victory!</h1>
              <p className="text-lg text-neutral-300">You crushed {opponentName}.</p>
            </div>
          ) : (
            <div className="animate-in zoom-in duration-500">
              <Skull className="mx-auto mb-6 h-24 w-24 text-neutral-600" />
              <h1 className="mb-2 text-4xl font-black uppercase tracking-tighter text-neutral-500">Defeat</h1>
              <p className="text-lg text-neutral-400">{opponentName} took the W.</p>
            </div>
          )}
          <div className="mt-12 flex gap-4">
            <Button onClick={() => window.location.href = '/game'} className="bg-white text-black hover:bg-neutral-200">
              Back to Lobby
            </Button>
          </div>
        </div>
      </MobileLayout>
    );
  }

  // --- Handlers ---
  const handleSetTrick = () => {
    // In a real app, this would open a modal to select/name the trick
    const trickName = prompt("Name your trick:");
    if (trickName) {
      submitMove({ type: 'set', trickName });
    }
  };

  const handleBail = () => {
    submitMove({ type: 'bail' });
  };

  const handleLand = () => {
    submitMove({ type: 'land' });
  };

  return (
    <MobileLayout>
      <div className="min-h-screen bg-neutral-950 px-4 pb-10 pt-6 text-white">
        
        {/* Header */}
        <header className="mb-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4 shadow-[0_0_24px_rgba(0,0,0,0.4)] backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-yellow-500">Active Game</p>
            <h1 className="text-lg font-semibold tracking-tight">S.K.A.T.E.</h1>
            <p className="text-xs text-neutral-400">vs {opponentName || "Opponent"}</p>
          </div>
          <div className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
            isMyTurn 
              ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200 animate-pulse" 
              : "border-neutral-700 bg-neutral-800 text-neutral-400"
          }`}>
            {isMyTurn ? <Crown className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
            {isMyTurn ? "Your Turn" : "Their Turn"}
          </div>
        </header>

        {/* Scoreboard */}
        <section className="mb-8 grid gap-3">
          {/* Player (You) */}
          <div className="rounded-2xl border border-white/10 bg-neutral-900/70 p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-neutral-500">
              <span>You</span>
              {isMyTurn && <span className="text-yellow-500 text-[10px]">ACTIVE</span>}
            </div>
            <div className="mt-3 flex items-center gap-2">
              {fullWord.map((letter, index) => (
                <div
                  key={letter}
                  className={`h-10 w-10 rounded-xl border text-center text-sm font-bold leading-10 transition-all duration-300 ${
                    index < myLetters
                      ? "border-red-500/60 bg-red-500/15 text-red-500 scale-110 shadow-[0_0_10px_rgba(239,68,68,0.3)]"
                      : "border-white/10 bg-white/5 text-neutral-500"
                  }`}
                >
                  {letter}
                </div>
              ))}
            </div>
          </div>

          {/* Opponent */}
          <div className="rounded-2xl border border-white/10 bg-neutral-900/70 p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-neutral-500">
              <span>{opponentName}</span>
              {!isMyTurn && <span className="text-neutral-400 text-[10px]">THINKING...</span>}
            </div>
            <div className="mt-3 flex items-center gap-2">
              {fullWord.map((letter, index) => (
                <div
                  key={letter}
                  className={`h-10 w-10 rounded-xl border text-center text-sm font-bold leading-10 transition-all duration-300 ${
                    index < oppLetters
                      ? "border-red-500/60 bg-red-500/15 text-red-500"
                      : "border-white/10 bg-white/5 text-neutral-500"
                  }`}
                >
                  {letter}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Action Area */}
        {isMyTurn ? (
          <section className="mb-8 space-y-4 rounded-3xl border border-yellow-500/20 bg-yellow-500/10 px-5 py-6 text-center animate-in slide-in-from-bottom-4 duration-500">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-yellow-300 shadow-lg">
              {isOffense ? <Swords className="h-6 w-6" /> : <Shield className="h-6 w-6" />}
            </div>
            
            <h2 className="text-xl font-bold text-white">
              {isOffense ? "Set the Trick" : `Match: ${game.lastTrickDescription || "Unknown Trick"}`}
            </h2>
            
            <p className="text-sm text-neutral-300 max-w-[280px] mx-auto">
              {isOffense
                ? "You have control. Set a trick to put pressure on them."
                : "They set the bar. Land it clean to stay in the game."}
            </p>

            {isOffense ? (
              <Button
                onClick={handleSetTrick}
                disabled={isMovePending}
                className="h-14 w-full rounded-xl bg-yellow-500 text-base font-bold text-black hover:bg-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.2)]"
              >
                {isMovePending ? <Loader2 className="animate-spin" /> : "Set Trick"}
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button
                  onClick={handleBail}
                  disabled={isMovePending}
                  variant="outline"
                  className="h-14 rounded-xl border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                >
                  {isMovePending ? <Loader2 className="animate-spin" /> : "Bail (Miss)"}
                </Button>
                <Button
                  onClick={handleLand}
                  disabled={isMovePending}
                  className="h-14 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                >
                  {isMovePending ? <Loader2 className="animate-spin" /> : "Land It"}
                </Button>
              </div>
            )}
          </section>
        ) : (
          <section className="mb-8 rounded-3xl border border-white/5 bg-neutral-900/50 px-5 py-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
            </div>
            <h3 className="text-lg font-medium text-neutral-300">Waiting for {opponentName}</h3>
            <p className="text-sm text-neutral-500 mt-1">
              {game.lastTrickDescription 
                ? `They are trying to land: ${game.lastTrickDescription}`
                : "They are setting a trick..."}
            </p>
          </section>
        )}
      </div>
    </MobileLayout>
  );
}
