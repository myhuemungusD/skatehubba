import { lazy, Suspense } from "react";
import { LoadingScreen } from "@/components/LoadingScreen";

const HomeContent = lazy(() => import("./home"));

export default function HubPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <div className="space-y-6">
        <section aria-label="Hub Overview">
          <HomeContent />
        </section>
      </div>
    </Suspense>
  );
}
