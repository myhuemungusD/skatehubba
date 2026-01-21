import { Users, MapPin, Gamepad2, Award, Video, Shield, CheckCircle, Zap } from "lucide-react";

export const homeContent = {
  hero: {
    badge: {
      text: "Platform Active",
      variant: "success" as const,
    },
    title: "Welcome Back",
    quickActions: [
      {
        icon: Users,
        label: "Feed",
        href: "/feed",
        description: "See what's happening",
        color: "bg-orange-500",
      },
      {
        icon: MapPin,
        label: "Map",
        href: "/map",
        description: "Find spots near you",
        color: "bg-blue-500",
      },
      {
        icon: Gamepad2,
        label: "Battle",
        href: "/game",
        description: "Challenge someone",
        color: "bg-purple-500",
      },
      {
        icon: Award,
        label: "Profile",
        href: "/profile",
        description: "View your progress",
        color: "bg-green-500",
      },
    ],
  },
  trustIndicators: [
    {
      icon: Shield,
      text: "Secure Auth",
      color: "text-green-500",
    },
    {
      icon: CheckCircle,
      text: "Free to Play",
      color: "text-blue-500",
    },
    {
      icon: Zap,
      text: "Real-time",
      color: "text-yellow-500",
    },
  ],
  features: [
    {
      icon: Gamepad2,
      title: "S.K.A.T.E. Battles",
      description: "Remote trick battles with video proof. Challenge anyone, anywhere.",
      iconColor: "text-purple-500",
    },
    {
      icon: MapPin,
      title: "Spot Discovery",
      description: "Find legendary spots. Check in. Build your trick history.",
      iconColor: "text-blue-500",
    },
    {
      icon: Video,
      title: "Trick Verification",
      description: "Upload clips. Get verified. Build credibility in the community.",
      iconColor: "text-orange-500",
    },
    {
      icon: Award,
      title: "Leaderboards",
      description: "Track your rank. Compete for the top spot. Earn respect.",
      iconColor: "text-yellow-500",
    },
  ],
};
