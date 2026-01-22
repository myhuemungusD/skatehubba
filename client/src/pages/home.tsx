/**
 * Authenticated Member Hub (Action-Focused)
 *
 * Purpose: Central dashboard for logged-in users
 * Target: Authenticated users
 * Goal: Quick navigation to core features
 *
 * Content: Member-focused
 * - Quick action buttons (Feed, Map, Battle, Profile)
 * - Live platform stats (member-specific data)
 * - Feature overview with member benefits
 * - Email signup (newsletter, lower priority)
 */

import BackgroundCarousel from "../components/BackgroundCarousel";
import EmailSignup from "../components/EmailSignup";
import { MemberHubHero } from "../sections/home/MemberHubHero";
import { StatsStrip } from "../sections/home/StatsStrip";
import { FeatureGrid } from "../sections/landing/FeatureGrid";
import { homeContent } from "../content/home";
import { useQuery } from "@tanstack/react-query";

// Fetch real stats from backend
function useAppStats() {
  return useQuery({
    queryKey: ["/api/stats"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 min cache
    retry: false,
  });
}

export default function Home() {
  const { data: stats } = useAppStats();

  // Use real stats if available, otherwise show conservative estimates
  const displayStats = [
    { label: "Active Skaters", value: stats?.totalUsers || "Growing" },
    { label: "Skate Spots Mapped", value: stats?.totalSpots || "50+" },
    { label: "SKATE Battles", value: stats?.totalBattles || "Active" },
  ];

  return (
    <BackgroundCarousel className="text-white">
      <MemberHubHero
        badge={homeContent.hero.badge}
        title={homeContent.hero.title}
        quickActions={homeContent.hero.quickActions}
      />

      <StatsStrip stats={displayStats} />

      <section className="py-24 bg-gradient-to-b from-zinc-900 to-black text-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4 text-white">Built for Real Skaters</h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Every feature designed by skaters, for skaters. No gimmicks—just the tools you need.
            </p>
          </div>

          <FeatureGrid features={homeContent.features} columns={4} />
        </div>
      </section>

      <EmailSignup />

      <footer className="py-8 text-center text-gray-500 bg-black border-t border-orange-400/10">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex flex-wrap justify-center gap-6 mb-4 text-sm">
            <a href="/specs" className="hover:text-orange-400 transition-colors">
              Specs
            </a>
            <a
              href="mailto:hello@skatehubba.com"
              className="hover:text-orange-400 transition-colors"
            >
              Contact
            </a>
          </div>
          <p className="text-sm">
            &copy; {new Date().getFullYear()}{" "}
            <span className="text-orange-400 font-semibold">SkateHubba</span> — Own Your Tricks.
          </p>
        </div>
      </footer>
    </BackgroundCarousel>
  );
}
