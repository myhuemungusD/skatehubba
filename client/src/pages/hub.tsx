import { lazy, Suspense } from "react";
import { LoadingScreen } from "@/components/LoadingScreen";

const ChallengeLobbyContent = lazy(() => import("./ChallengeLobby"));

export default function HubPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ChallengeLobbyContent />
    </Suspense>
  );
}
