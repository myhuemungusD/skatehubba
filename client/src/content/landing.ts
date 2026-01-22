import { Shield, Zap, Globe2, Trophy, MapPin, TrendingUp } from "lucide-react";

export const landingContent = {
  hero: {
    badge: {
      text: "Now Available • Join the Beta",
      variant: "success" as const,
    },
    eyebrow: "The Future of Competitive Skateboarding",
    title: "Master Every Session.",
    subtitle: "Compete Anywhere.",
    description:
      "The premier platform for remote S.K.A.T.E. battles, spot documentation, and competitive rankings. Built by skaters, for skaters.",
    primaryCTA: {
      text: "Get Started",
      href: "/signin",
    },
    secondaryCTA: {
      text: "Watch Demo",
      href: "/demo",
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
