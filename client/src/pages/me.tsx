import { lazy, Suspense } from "react";
import { Link } from "wouter";
import { Settings, History } from "lucide-react";
import { LoadingScreen } from "@/components/LoadingScreen";

const SettingsContent = lazy(() => import("./settings"));

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between pb-4 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-neutral-400" />
          <h1 className="text-xl font-bold text-white">Settings</h1>
        </div>
        <Link
          href="/checkins"
          className="flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          <History className="h-4 w-4" />
          <span>Trick History</span>
        </Link>
      </header>
      <Suspense fallback={<LoadingScreen />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}
