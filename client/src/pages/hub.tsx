import { useState, lazy, Suspense } from "react";
import { useLocation, useSearch } from "wouter";
import { Home, Activity, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingScreen } from "@/components/LoadingScreen";

// Lazy load tab content for better performance
const HomeContent = lazy(() => import("./home"));
const FeedContent = lazy(() => import("./feed"));
const ClosetContent = lazy(() => import("./closet"));
const BoltsShowcaseContent = lazy(() => import("@/features/social/bolts-showcase/BoltsShowcase"));

type HubTab = "overview" | "activity" | "profile" | "community";

const tabs: { id: HubTab; label: string; icon: typeof Home }[] = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "profile", label: "Profile", icon: User },
  { id: "community", label: "Community", icon: Users },
];

export default function HubPage() {
  const search = useSearch();
  const [, setLocation] = useLocation();

  // Get initial tab from URL query param
  const urlTab = new URLSearchParams(search).get("tab") as HubTab | null;
  const [activeTab, setActiveTab] = useState<HubTab>(
    urlTab && tabs.some((t) => t.id === urlTab) ? urlTab : "overview"
  );

  const handleTabChange = (tab: HubTab) => {
    setActiveTab(tab);
    // Update URL without full navigation for deep-linking support
    setLocation(`/hub?tab=${tab}`, { replace: true });
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
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Tab Content */}
      <Suspense fallback={<LoadingScreen />}>
        <div className="min-h-[60vh]">
          {activeTab === "overview" && (
            <section aria-label="Hub Overview">
              <HomeContent />
            </section>
          )}

          {activeTab === "activity" && (
            <section aria-label="Live Activity Feed">
              <FeedContent />
            </section>
          )}

          {activeTab === "profile" && (
            <section aria-label="Your Profile">
              <ClosetContent />
            </section>
          )}

          {activeTab === "community" && (
            <section aria-label="Community Showcase">
              <BoltsShowcaseContent />
            </section>
          )}
        </div>
      </Suspense>
    </div>
  );
}
