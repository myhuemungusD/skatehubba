import { useMemo, useState } from "react";
import { Crown, Flag, Shield, Swords } from "lucide-react";
import MobileLayout from "../components/layout/MobileLayout";

interface OpponentProfile {
  id: string;
  name: string;
  handle: string;
  avatar: string;
}

const opponents: Record<string, OpponentProfile> = {
  bot: {
    id: "bot",
    name: "Random Bot",
    handle: "@random-bot",
    avatar: "RB",
  },
  "skater-1": {
    id: "skater-1",
    name: "Rico Blaze",
    handle: "@ricoblaze",
    avatar: "RB",
  },
  "skater-2": {
    id: "skater-2",
    name: "Maya Torque",
    handle: "@mayatorque",
    avatar: "MT",
  },
  "skater-3": {
    id: "skater-3",
    name: "Jax Orbit",
    handle: "@jaxorbit",
    avatar: "JO",
  },
  "skater-4": {
    id: "skater-4",
    name: "Nina Flux",
    handle: "@ninaflux",
    avatar: "NF",
  },
  "skater-5": {
    id: "skater-5",
    name: "Owen Drift",
    handle: "@owendrift",
    avatar: "OD",
  },
};

const fullWord = ["S", "K", "A", "T", "E"];

export default function SkateGamePage() {
  const [myLetters, setMyLetters] = useState(0);
  const [opponentLetters, setOpponentLetters] = useState(0);
  const [isOffense, setIsOffense] = useState(true);

  const opponentId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("opponent") ?? "bot";
  }, []);

  const opponent = opponents[opponentId] ?? opponents.bot;

  const togglePossession = () => {
    setIsOffense((current) => !current);
  };

  const handleBail = () => {
    setMyLetters((current) => Math.min(current + 1, fullWord.length));
    setIsOffense(false);
  };

  const handleLand = () => {
    setOpponentLetters((current) => Math.min(current + 1, fullWord.length));
    setIsOffense(true);
  };

  return (
    <MobileLayout>
      <div className="min-h-screen bg-neutral-950 px-4 pb-10 pt-6 text-white">
        <header className="mb-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4 shadow-[0_0_24px_rgba(0,0,0,0.4)] backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-yellow-500">Active Game</p>
            <h1 className="text-lg font-semibold">S.K.A.T.E. Showdown</h1>
            <p className="text-xs text-neutral-400">You vs {opponent.name}</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-200">
            <Crown className="h-3.5 w-3.5" />
            {isOffense ? "Offense" : "Defense"}
          </div>
        </header>

        <section className="mb-8 grid gap-3">
          <div className="rounded-2xl border border-white/10 bg-neutral-900/70 p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-neutral-500">
              <span>You</span>
              <span className="text-yellow-400">Scoreboard</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {fullWord.map((letter, index) => (
                <div
                  key={letter}
                  className={`h-10 w-10 rounded-xl border text-center text-sm font-semibold leading-10 ${
                    index < myLetters
                      ? "border-yellow-500/60 bg-yellow-500/15 text-yellow-300"
                      : "border-white/10 bg-white/5 text-neutral-500"
                  }`}
                >
                  {letter}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-neutral-900/70 p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-neutral-500">
              <span>{opponent.name}</span>
              <span className="text-yellow-400">{opponent.handle}</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {fullWord.map((letter, index) => (
                <div
                  key={letter}
                  className={`h-10 w-10 rounded-xl border text-center text-sm font-semibold leading-10 ${
                    index < opponentLetters
                      ? "border-red-500/60 bg-red-500/15 text-red-300"
                      : "border-white/10 bg-white/5 text-neutral-500"
                  }`}
                >
                  {letter}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-8 space-y-4 rounded-3xl border border-yellow-500/20 bg-yellow-500/10 px-5 py-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-yellow-300">
            {isOffense ? <Swords className="h-6 w-6" /> : <Shield className="h-6 w-6" />}
          </div>
          <h2 className="text-xl font-semibold">
            {isOffense ? "Set the Trick" : "Land the Trick"}
          </h2>
          <p className="text-sm text-neutral-300">
            {isOffense
              ? "Drop a trick to pressure them fast."
              : "Land it clean to flip the momentum."}
          </p>
          <button
            type="button"
            onClick={togglePossession}
            className="min-h-[56px] w-full rounded-2xl bg-yellow-500 text-base font-semibold text-neutral-950 shadow-lg shadow-yellow-500/30 transition active:scale-[0.98]"
          >
            {isOffense ? "Set Trick" : "Land Trick"}
          </button>
        </section>

        <section className="grid gap-3">
          <p className="text-center text-xs uppercase tracking-[0.2em] text-neutral-500">
            Test Controls
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleBail}
              className="min-h-[52px] rounded-2xl border border-red-500/40 bg-red-500/10 text-sm font-semibold text-red-300"
            >
              Bail (You Miss)
            </button>
            <button
              type="button"
              onClick={handleLand}
              className="min-h-[52px] rounded-2xl border border-emerald-500/40 bg-emerald-500/10 text-sm font-semibold text-emerald-200"
            >
              Land (They Miss)
            </button>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-neutral-400">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-yellow-400" />
                Opponent Avatar
              </span>
              <span className="rounded-full bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300">
                {opponent.avatar}
              </span>
            </div>
          </div>
        </section>
      </div>
    </MobileLayout>
  );
}
