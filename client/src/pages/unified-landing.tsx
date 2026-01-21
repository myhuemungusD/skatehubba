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
 */

import BackgroundCarousel from "../components/BackgroundCarousel";
import Navigation from "../components/Navigation";
import { Footer } from "../components/Footer";
import { HeroSection } from "../sections/landing/HeroSection";
import { FeatureGrid } from "../sections/landing/FeatureGrid";
import { landingContent } from "../content/landing";

export default function UnifiedLanding() {
  return (
    <BackgroundCarousel className="text-white">
      <Navigation />

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
