import { Trophy, MapPin, TrendingUp } from "lucide-react";

export const landingContent = {
  hero: {
    badge: {
      text: "Open Beta — Now Live",
      variant: "success" as const,
    },
    eyebrow: "Prove It on the Street",
    title: "Own the Spot.",
    subtitle: "Play SKATE Anywhere.",
    description:
      "Film tricks. Check spots. Battle for rank. SkateHubba is built for skaters who want to compete — no judges, no entry fees, just you and your board.",
    primaryCTA: {
      text: "Sign Up / Log In",
      href: "/auth",
      testId: "cta-landing-primary",
    },
  },
  features: [
    {
      icon: Trophy,
      title: "S.K.A.T.E. Battles",
      description:
        "Film your trick, post the clip, and let skaters vote. Take letters, win battles, and rise up the global leaderboard.",
      iconColor: "text-orange-500",
    },
    {
      icon: MapPin,
      title: "Skate Spot Map",
      description:
        "Check into verified spots near you. Log your sessions and build credibility in your local scene.",
      iconColor: "text-blue-500",
    },
    {
      icon: TrendingUp,
      title: "Community Leaderboards",
      description:
        "Every battle won and spot checked moves your rank. Real-time standings, zero politics.",
      iconColor: "text-emerald-500",
    },
  ],
};
