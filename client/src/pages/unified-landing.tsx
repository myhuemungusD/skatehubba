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
 * - Authenticated: Redirect to /home
 */

import { useEffect } from "react";
import { useLocation } from "wouter";
import BackgroundCarousel from "../components/BackgroundCarousel";
import PublicNavigation from "../components/PublicNavigation";
import { Footer } from "../components/Footer";
import { HeroSection } from "../sections/landing/HeroSection";
import { FeatureGrid } from "../sections/landing/FeatureGrid";
import { landingContent } from "../content/landing";
import { useAuth } from "../context/AuthProvider";

export default function UnifiedLanding() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect authenticated users to /home
  useEffect(() => {
    if (!loading && user) {
      setLocation("/home", { replace: true });
    }
  }, [user, loading, setLocation]);

  // Show nothing while checking auth (prevents flash)
  if (loading) {
    return null;
  }

  // If authenticated, don't render (redirect will happen)
  if (user) {
    return null;
  }

  return (
    <BackgroundCarousel className="text-white">
      <PublicNavigation />

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
