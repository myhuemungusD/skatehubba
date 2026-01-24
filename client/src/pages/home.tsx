import { useAuth } from "../context/AuthProvider";
import { MemberHubHero } from "../sections/home/MemberHubHero";
import { StatsStrip } from "../sections/home/StatsStrip";
import { FeatureGrid } from "../sections/landing/FeatureGrid";
import { homeContent } from "../content/home";

/**
 * Home Page - Authenticated Member Hub
 *
 * This is the main dashboard for authenticated users.
 * Shows:
 * - Welcome message with quick action buttons to key areas (Feed, Map, Battle, Profile)
 * - Platform statistics
 * - Feature overview
 *
 * Note: This page is intended for authenticated users. The RootRedirect component
 * ensures authenticated users are sent to /home and unauthenticated users to /landing.
 */
export default function Home() {
  const { profile } = useAuth();

  // Calculate placeholder stats based on profile data
  const stats = [
    {
      label: "Spots Visited",
      value: profile?.spotsVisited ?? 0,
    },
    {
      label: "Tricks Landed",
      value: profile?.favoriteTricks?.length ?? 0,
    },
    {
      label: "Credibility",
      value: profile?.credibilityScore ?? 0,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-900 to-black">
      {/* Hero Section with Quick Actions */}
      <MemberHubHero
        badge={homeContent.hero.badge}
        title={homeContent.hero.title}
        quickActions={homeContent.hero.quickActions}
      />

      {/* Stats Strip */}
      <StatsStrip stats={stats} />

      {/* Features Section */}
      <FeatureGrid features={homeContent.features} columns={2} />
    </div>
  );
}
