import { Shield, Zap, Globe2, Trophy, MapPin, TrendingUp } from "lucide-react";

export const landingContent = {
  hero: {
    badge: {
      text: "Now Available - Join the Beta",
      variant: "success" as const,
    },
    eyebrow: "The Future of Competitive Skateboarding",
    title: "Own the Spot.",
    subtitle: "Play SKATE Anywhere.",
    description:
      "The ultimate mobile skateboarding platform where every clip, spot, and session tells a story.",
    primaryCTA: {
      text: "Sign In / Sign Up",
      href: "/auth",
      testId: "cta-landing-primary",
    },
    secondaryCTA: {
      text: "Learn More",
      href: "/specs",
      testId: "cta-landing-secondary",
    },
  },
  trustIndicators: [
    {
      icon: Shield,
      text: "Secure Sign-In",
      color: "text-emerald-400",
    },
    {
      icon: Zap,
      text: "Real-time Battles",
      color: "text-amber-400",
    },
    {
      icon: Globe2,
      text: "Growing Beta Community",
      color: "text-sky-400",
    },
  ],
  features: [
    {
      icon: Trophy,
      title: "Competitive Battles",
      description:
        "Challenge opponents worldwide with video submission battles. Sophisticated voting system ensures fair competition.",
      iconColor: "text-orange-500",
    },
    {
      icon: MapPin,
      title: "Spot Documentation",
      description:
        "Build your session history at verified locations. Track progress and establish credibility within the community.",
      iconColor: "text-blue-500",
    },
    {
      icon: TrendingUp,
      title: "Community Leaderboards",
      description:
        "Track your rank among skaters in the community. Climb the leaderboard through battles and spot check-ins.",
      iconColor: "text-emerald-500",
    },
  ],
  stats: [
    {
      value: "50+",
      label: "Verified Spots",
      icon: MapPin,
    },
    {
      value: "Active",
      label: "Live Battles",
      icon: Trophy,
    },
    {
      value: "24/7",
      label: "Platform Uptime",
      icon: Zap,
    },
  ],
};
