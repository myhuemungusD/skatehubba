import { useState, lazy, Suspense } from "react";
import { useLocation, useSearch } from "wouter";
import { Shirt, History, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/hooks/useAuth";

// Lazy load tab content
const ClosetContent = lazy(() => import("./closet"));
const CheckinsContent = lazy(() => import("./checkins"));
const SettingsContent = lazy(() => import("./settings"));

type ProfileTab = "closet" | "history" | "settings";

const tabs: { id: ProfileTab; label: string; icon: typeof User; mobileLabel: string }[] = [
  { id: "closet", label: "My Closet", icon: Shirt, mobileLabel: "Closet" },
  { id: "history", label: "Check-in History", icon: History, mobileLabel: "History" },
  { id: "settings", label: "Settings", icon: Settings, mobileLabel: "Settings" },
];

export default function ProfilePage() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const auth = useAuth();
  const profile = auth?.profile;

  // Get initial tab from URL query param
  const urlTab = new URLSearchParams(search).get("tab") as ProfileTab | null;
  const [activeTab, setActiveTab] = useState<ProfileTab>(
    urlTab && tabs.some((t) => t.id === urlTab) ? urlTab : "closet"
  );

  const handleTabChange = (tab: ProfileTab) => {
    setActiveTab(tab);
    setLocation(`/me?tab=${tab}`, { replace: true });
  };

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <header className="flex items-center gap-4 pb-4 border-b border-neutral-800">
        <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden">
          {profile?.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.username || "Profile"}
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-8 h-8 text-neutral-500" />
          )}
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{profile?.username || "Skater"}</h1>
          {profile?.username && <p className="text-sm text-neutral-400">@{profile.username}</p>}
        </div>
      </header>

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
          {activeTab === "closet" && (
            <section aria-label="Your Closet">
              <ClosetContent />
            </section>
          )}

          {activeTab === "history" && (
            <section aria-label="Check-in History">
              <CheckinsContent />
            </section>
          )}

          {activeTab === "settings" && (
            <section aria-label="Account Settings">
              <SettingsContent />
            </section>
          )}
        </div>
      </Suspense>
    </div>
  );
}
