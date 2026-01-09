import { useMemo, useState } from "react";
import { Circle, Search, User, Zap } from "lucide-react";
import { useLocation } from "wouter";
import MobileLayout from "../components/layout/MobileLayout";

type SkaterStatus = "online" | "offline";

interface SkaterProfile {
  id: string;
  name: string;
  handle: string;
  status: SkaterStatus;
  style: string;
  winRate: string;
}

const skaters: SkaterProfile[] = [
  {
    id: "skater-1",
    name: "Rico Blaze",
    handle: "@ricoblaze",
    status: "online",
    style: "Switch flip demon",
    winRate: "68%",
  },
  {
    id: "skater-2",
    name: "Maya Torque",
    handle: "@mayatorque",
    status: "online",
    style: "Rail assassin",
    winRate: "72%",
  },
  {
    id: "skater-3",
    name: "Jax Orbit",
    handle: "@jaxorbit",
    status: "offline",
    style: "Big spin wizard",
    winRate: "64%",
  },
  {
    id: "skater-4",
    name: "Nina Flux",
    handle: "@ninaflux",
    status: "online",
    style: "Tech lines only",
    winRate: "71%",
  },
  {
    id: "skater-5",
    name: "Owen Drift",
    handle: "@owendrift",
    status: "offline",
    style: "Street general",
    winRate: "59%",
  },
];

const statusStyles: Record<SkaterStatus, string> = {
  online: "text-emerald-400",
  offline: "text-neutral-500",
};

export default function ChallengeLobby() {
  const [query, setQuery] = useState("");
  const [lastMatch, setLastMatch] = useState<SkaterProfile | null>(null);
  const [, setLocation] = useLocation();

  const filteredSkaters = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return skaters;
    }

    return skaters.filter((skater) => {
      return (
        skater.name.toLowerCase().includes(normalizedQuery) ||
        skater.handle.toLowerCase().includes(normalizedQuery) ||
        skater.style.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [query]);

  const handleQuickMatch = () => {
    const onlineSkaters = skaters.filter((skater) => skater.status === "online");
    const selectedOpponent =
      onlineSkaters[Math.floor(Math.random() * Math.max(onlineSkaters.length, 1))] ||
      skaters[0] ||
      null;

    if (!selectedOpponent) {
      setLocation("/game/active?opponent=bot");
      return;
    }

    setLastMatch(selectedOpponent);
    setLocation(`/game/active?opponent=${selectedOpponent.id}`);
  };

  return (
    <MobileLayout>
      <div className="min-h-screen bg-neutral-950 px-4 pb-8 pt-6 text-white">
        <header className="mb-6 space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-yellow-500">
            Challenge Lobby
          </p>
          <h1 className="text-2xl font-semibold">Find your next S.K.A.T.E. battle</h1>
          <p className="text-sm text-neutral-400">
            Tap quick match or pick a skater already online. No delays.
          </p>
        </header>

        <button
          type="button"
          onClick={handleQuickMatch}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-yellow-500 px-6 py-4 text-base font-semibold text-neutral-950 shadow-lg shadow-yellow-500/30 transition active:scale-[0.98]"
        >
          <Zap className="h-5 w-5" />
          Quick Match
        </button>

        {lastMatch ? (
          <div className="mt-4 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
            Match locked: {lastMatch.name} {lastMatch.handle}
          </div>
        ) : null}

        <div className="mt-6">
          <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-neutral-500">
            Search
          </label>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-[0_0_24px_rgba(0,0,0,0.35)] backdrop-blur">
            <Search className="h-5 w-5 text-neutral-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search skaters"
              className="w-full bg-transparent text-sm text-white placeholder:text-neutral-500 focus:outline-none"
            />
          </div>
        </div>

        <section className="mt-6 space-y-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-neutral-500">
            <span>Online Skaters</span>
            <span>{filteredSkaters.length} active</span>
          </div>

          <div className="space-y-3">
            {filteredSkaters.map((skater) => (
              <div
                key={skater.id}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900">
                    <User className="h-5 w-5 text-neutral-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {skater.name}
                      <Circle className={`h-2 w-2 fill-current ${statusStyles[skater.status]}`} />
                      <span className={`text-xs ${statusStyles[skater.status]}`}>
                        {skater.status}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400">
                      {skater.handle} · {skater.style}
                    </div>
                    <div className="text-xs text-neutral-500">Win rate {skater.winRate}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLocation(`/game/active?opponent=${skater.id}`)}
                  className="min-h-[44px] rounded-full border border-yellow-500/40 px-4 text-sm font-semibold text-yellow-300 transition hover:border-yellow-500 hover:text-yellow-200"
                >
                  Challenge
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </MobileLayout>
  );
}
