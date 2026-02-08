import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../store/authStore";
import type { AccountTier } from "@shared/schema";
import { isDevAdmin } from "../lib/devAdmin";

interface TierInfo {
  tier: AccountTier;
  proAwardedBy: string | null;
  premiumPurchasedAt: string | null;
}

export function useAccountTier() {
  const user = useAuthStore((s) => s.user);

  const { data, isLoading } = useQuery<TierInfo>({
    queryKey: ["/api/tier"],
    enabled: !!user,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  // Dev admin bypass — treat as pro so all features are accessible
  if (isDevAdmin()) {
    return {
      tier: "pro" as AccountTier,
      isPaidOrPro: true,
      isLoading: false,
      proAwardedBy: null,
      premiumPurchasedAt: null,
    };
  }

  const tier = data?.tier ?? "free";
  const isPaidOrPro = tier === "pro" || tier === "premium";

  return {
    tier,
    isPaidOrPro,
    isLoading,
    proAwardedBy: data?.proAwardedBy ?? null,
    premiumPurchasedAt: data?.premiumPurchasedAt ?? null,
  };
}
