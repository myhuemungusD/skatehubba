import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";

export interface DiscoverUser {
  id: string;
  displayName: string;
  handle: string;
  wins: number;
  losses: number;
  stance: string | null;
}

interface DiscoverUsersResponse {
  topSkaters: DiscoverUser[];
  recentlyActive: DiscoverUser[];
  newSkaters: DiscoverUser[];
}

export function useDiscoverUsers() {
  return useQuery({
    queryKey: ["users", "discover"],
    queryFn: () =>
      apiRequest<DiscoverUsersResponse>({
        method: "GET",
        path: "/api/users/discover",
      }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
