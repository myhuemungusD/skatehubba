import { useState, lazy, Suspense } from "react";
import { useLocation, useSearch } from "wouter";
import { Zap, Trophy, Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingScreen } from "@/components/LoadingScreen";

// Lazy load tab content for better performance
const ChallengeLobbyContent = lazy(() => import("./ChallengeLobby"));
const LeaderboardContent = lazy(() => import("./leaderboard"));
const SkateGameContent = lazy(() => import("./skate-game"));

type PlayTab = "lobby" | "rankings" | "active";

const tabs: { id: PlayTab; label: string; icon: typeof Zap; mobileLabel: string }[] = [
  { id: "lobby", label: "Challenge Lobby", icon: Zap, mobileLabel: "Lobby" },
  { id: "rankings", label: "Leaderboard", icon: Trophy, mobileLabel: "Rankings" },
  { id: "active", label: "Active Game", icon: Gamepad2, mobileLabel: "Play" },
];

export default function PlayPage() {
  const search = useSearch();
  const [, setLocation] = useLocation();

  // Get initial tab from URL query param
  const urlTab = new URLSearchParams(search).get("tab") as PlayTab | null;
  const [activeTab, setActiveTab] = useState<PlayTab>(
    urlTab && tabs.some((t) => t.id === urlTab) ? urlTab : "lobby"
  );

  const handleTabChange = (tab: PlayTab) => {
    setActiveTab(tab);
    setLocation(`/play?tab=${tab}`, { replace: true });
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <nav className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-neutral-950/95 backdrop-blur-sm border-b border-neutral-800">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                  isActive
                    ? "bg-yellow-400/10 text-yellow-400"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Tab Content */}
      <Suspense fallback={<LoadingScreen />}>
        <div className="min-h-[60vh]">
          {activeTab === "lobby" && (
            <section aria-label="Challenge Lobby">
              <ChallengeLobbyContent />
            </section>
          )}

          {activeTab === "rankings" && (
            <section aria-label="Leaderboard Rankings">
              <LeaderboardContent />
            </section>
          )}

          {activeTab === "active" && (
            <section aria-label="Active SKATE Game">
              <SkateGameContent />
            </section>
          )}
        </div>
      </Suspense>
    </div>
  );
}
