import { Shield, Zap, Globe2, Trophy, MapPin, TrendingUp } from "lucide-react";

export const landingContent = {
  hero: {
    badge: {
      text: "Now Available - Join the Beta",
      variant: "success" as const,
    },
    eyebrow: "The Future of Competitive Skateboarding",
    title: "Own Your Tricks.",
    subtitle: "Play SKATE Anywhere.",
    description:
      "The ultimate mobile skateboarding platform where every clip, spot, and session tells a story.",
    primaryCTA: {
      text: "Sign In / Sign Up",
      href: "/auth",
    },
  },
  trustIndicators: [
    {
      icon: Shield,
      text: "Enterprise-grade Security",
      color: "text-emerald-400",
    },
    {
      icon: Zap,
      text: "Real-time Infrastructure",
      color: "text-amber-400",
    },
    {
      icon: Globe2,
      text: "Global Community",
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
      title: "Performance Analytics",
      description:
        "Advanced statistics track your progression. Compare rankings and identify areas for improvement.",
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
