import { useMemo } from "react";

export type NavItem = {
  label: string;
  href?: string;
  disabled?: boolean;
  external?: boolean;
};

export function useNavItems(): NavItem[] {
  return useMemo(() => {
    return [
      { label: "HOME", href: "/hub" },
      { label: "MAP", href: "/map" },
      { label: "PLAY", href: "/play" },
      { label: "RANKS", href: "/leaderboard" },
      { label: "PROFILE", href: "/me" },
      { label: "MERCH", href: "https://skatehubba.store/", external: true },
    ];
  }, []);
}
