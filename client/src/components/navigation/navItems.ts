import { useMemo } from "react";
import { GUEST_MODE } from "../../config/flags";

export type NavItem = {
  label: string;
  href?: string;
  disabled?: boolean;
  external?: boolean;
};

export function useNavItems(): NavItem[] {
  return useMemo(() => {
    if (GUEST_MODE) {
      return [
        { label: "SPOTMAP", href: "/map" },
        { label: "S.K.A.T.E", href: "/play" },
        { label: "MERCH", href: "https://skatehubba.store/", external: true },
      ];
    }
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
