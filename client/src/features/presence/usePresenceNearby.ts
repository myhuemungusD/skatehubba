import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchNearbyPresence } from "./presenceService";

interface PresenceNearbyOptions {
  location?: { lat: number; lng: number } | null;
  radiusMiles?: number;
}

export function usePresenceNearby({ location, radiusMiles = 10 }: PresenceNearbyOptions) {
  const since = useMemo(() => new Date(Date.now() - 10 * 60 * 1000), []);

  const queryResult = useQuery({
    queryKey: ["presence", "nearby", location?.lat ?? 0, location?.lng ?? 0, radiusMiles],
    queryFn: () =>
      fetchNearbyPresence({
        since,
        maxResults: 100,
        radiusMiles,
        location,
      }),
    enabled: Boolean(location),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return {
    ...queryResult,
    users: queryResult.data ?? [],
  };
}

