/**
 * Public Landing Page (Conversion-Focused)
 *
 * Purpose: First-time visitor conversion
 * Target: Unauthenticated users
 * Goal: Get them to sign in and enter the platform
 *
 * Content:
 * - Full-bleed hero with video placeholder, grain overlay, A/B "Own Your Tricks" stamp
 * - Brief feature overview (3 items max)
 * - Footer with @skatehubba_app + GitHub
 *
 * Behavior:
 * - Unauthenticated: Show landing page (no app shell)
 * - Authenticated with profile: Redirect to /home
 * - Authenticated without profile: Redirect to profile setup
 */

import { useEffect } from "react";
import { useLocation } from "wouter";
import PublicNavigation from "../components/PublicNavigation";
import { Footer } from "../components/Footer";
import { HeroMedia } from "../sections/landing/HeroMedia";
import { FeatureGrid } from "../sections/landing/FeatureGrid";
import { HubbaShopBanner } from "../sections/landing/HubbaShopBanner";
import { landingContent } from "../content/landing";
import { useAuth } from "../hooks/useAuth";

export default function UnifiedLanding() {
  const auth = useAuth();
  const [, setLocation] = useLocation();

  // Redirect authenticated users based on profile status
  useEffect(() => {
    if (auth.loading) return;

    if (auth.isAuthenticated && auth.profileStatus === "missing") {
      setLocation("/profile/setup?next=/home", { replace: true });
      return;
    }

    if (auth.isAuthenticated && auth.profileStatus === "exists") {
      setLocation("/home", { replace: true });
    }
  }, [auth.isAuthenticated, auth.profileStatus, auth.loading, setLocation]);

  // Loading skeleton while checking auth (blank screens are release blockers)
  if (auth.loading || (auth.isAuthenticated && auth.profileStatus === "unknown")) {
    return (
      <div className="min-h-dvh bg-black flex items-center justify-center">
        <span
          className="text-3xl font-bold text-brand animate-pulse"
          style={{ fontFamily: "'Permanent Marker', cursive" }}
        >
          SkateHubba
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav floats over the full-bleed hero */}
      <div className="absolute top-0 left-0 right-0">
        <PublicNavigation />
      </div>

      {/* Full-bleed hero with grain + A/B stamp overlay */}
      <HeroMedia
        badge={landingContent.hero.badge}
        eyebrow={landingContent.hero.eyebrow}
        title={landingContent.hero.title}
        subtitle={landingContent.hero.subtitle}
        description={landingContent.hero.description}
        primaryCTA={landingContent.hero.primaryCTA}
      />

      <FeatureGrid features={landingContent.features} columns={3} />

      <HubbaShopBanner />

      <Footer />
    </div>
  );
}
