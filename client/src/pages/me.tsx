import { lazy, Suspense } from "react";
import { Settings } from "lucide-react";
import { LoadingScreen } from "@/components/LoadingScreen";

const SettingsContent = lazy(() => import("./settings"));

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3 pb-4 border-b border-neutral-800">
        <Settings className="h-6 w-6 text-neutral-400" />
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </header>
      <Suspense fallback={<LoadingScreen />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}
