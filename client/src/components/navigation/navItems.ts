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
      { label: "SETTINGS", href: "/me" },
      { label: "MERCH", href: "https://skatehubba.store/", external: true },
    ];
  }, []);
}
