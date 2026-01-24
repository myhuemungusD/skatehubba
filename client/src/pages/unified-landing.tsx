/**
 * Public Landing Page (Conversion-Focused)
 *
 * Purpose: First-time visitor conversion
 * Target: Unauthenticated users
 * Goal: Get them to sign in and enter the platform
 *
 * Content: Minimal, streamlined
 * - Hero with one primary CTA
 * - Brief feature overview (3 items max)
 * - Trust indicators
 * - That's it. No walls of text.
 *
 * Behavior:
 * - Unauthenticated: Show landing page (no app shell)
 * - Authenticated with profile: Redirect to /home
 * - Authenticated without profile: Redirect to profile setup
 */

import { useEffect } from "react";
import { useLocation } from "wouter";
import BackgroundCarousel from "../components/BackgroundCarousel";
import PublicNavigation from "../components/PublicNavigation";
import { Footer } from "../components/Footer";
import { HeroSection } from "../sections/landing/HeroSection";
import { FeatureGrid } from "../sections/landing/FeatureGrid";
import { landingContent } from "../content/landing";
import { useAuth } from "../hooks/useAuth";
import AppDropdownMenu from "../components/navigation/AppDropdownMenu";

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

  // Show nothing while checking auth (prevents flash)
  if (auth.loading || (auth.isAuthenticated && auth.profileStatus === "unknown")) {
    return null;
  }

  return (
    <BackgroundCarousel className="text-white">
      <PublicNavigation />

      <div className="absolute top-0 right-0 m-4 z-50">
        <AppDropdownMenu />
      </div>

      <HeroSection
        badge={landingContent.hero.badge}
        eyebrow={landingContent.hero.eyebrow}
        title={landingContent.hero.title}
        subtitle={landingContent.hero.subtitle}
        description={landingContent.hero.description}
        primaryCTA={landingContent.hero.primaryCTA}
        secondaryCTA={landingContent.hero.secondaryCTA}
        trustIndicators={landingContent.trustIndicators}
      />

      <FeatureGrid features={landingContent.features} columns={3} />

      <Footer />
    </BackgroundCarousel>
  );
}
