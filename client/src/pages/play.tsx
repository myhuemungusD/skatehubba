import { Suspense, lazy } from "react";
import { useSearch } from "wouter";
import { LoadingScreen } from "@/components/LoadingScreen";

const ChallengeLobbyContent = lazy(() => import("./ChallengeLobby"));
const SkateGameContent = lazy(() => import("./skate-game"));

export default function PlayPage() {
  const search = useSearch();
  const gameId = new URLSearchParams(search).get("gameId");

  return (
    <Suspense fallback={<LoadingScreen />}>
      <div className="min-h-[60vh]">
        {gameId ? (
          <section aria-label="Active SKATE Game">
            <SkateGameContent />
          </section>
        ) : (
          <section aria-label="Challenge Lobby">
            <ChallengeLobbyContent />
          </section>
        )}
      </div>
    </Suspense>
  );
}
