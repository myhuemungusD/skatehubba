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
        { label: "S.K.A.T.E", href: "/play" },
      ];
    }
    return [
      { label: "HUB", href: "/hub" },
      { label: "S.K.A.T.E", href: "/play" },
      { label: "SPOTMAP", href: "/map" },
      { label: "HUBBA SHOP", href: "/shop" },
      { label: "MY PROFILE", href: "/me" },
    ];
  }, []);
}
