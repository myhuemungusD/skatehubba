import { useMemo } from "react";
import { GUEST_MODE } from "../../config/flags";

export type NavItem = {
  label: string;
  href?: string;
  disabled?: boolean;
};

export function useNavItems(): NavItem[] {
  return useMemo(() => {
    if (GUEST_MODE) {
      return [
        { label: "SPOTMAP", href: "/map" },
        { label: "S.K.A.T.E", href: "/skate-game" },
      ];
    }
    return [
      { label: "PROFILE", href: "/closet" },
      { label: "S.K.A.T.E", href: "/game" },
      { label: "SPOTMAP", href: "/map" },
      { label: "HUBBA SHOP", href: "/shop" },
      { label: "THE TRENCHES", href: "/leaderboard" },
      { label: "SETTINGS", href: "/settings" },
      { label: "TRICK MINTING", disabled: true },
    ];
  }, []);
}
