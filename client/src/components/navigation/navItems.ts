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
        { label: "SPOTS", href: "/spots" },
        { label: "S.K.A.T.E", href: "/game" },
      ];
    }
      return [
        { label: "HOME", href: "/home" },
        { label: "FEED", href: "/feed" },
        { label: "SPOTMAP", href: "/map" },
        { label: "SPOTS", href: "/spots" },
        { label: "S.K.A.T.E", href: "/game" },
      { label: "THE TRENCHES", href: "/leaderboard" },
      { label: "CHECKINS", href: "/checkins" },
      { label: "TUTORIAL", href: "/tutorial" },
      { label: "TRICK MINTING", href: "/trickmint" },
      { label: "SHOWCASE", href: "/showcase" },
      { label: "PROFILE", href: "/closet" },
      { label: "SETTINGS", href: "/settings" },
      { label: "HUBBA SHOP", href: "/shop" },
      { label: "CART", href: "/cart" },
      { label: "CHECKOUT", href: "/checkout" },
      { label: "ORDER CONFIRMATION", href: "/order-confirmation" },
    ];
  }, []);
}
