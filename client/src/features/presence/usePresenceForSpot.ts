import { useQuery } from "@tanstack/react-query";
import { fetchPresenceForSpot } from "./presenceService";

export function usePresenceForSpot(spotId?: string) {
  const since = new Date(Date.now() - 10 * 60 * 1000);

  const queryResult = useQuery({
    queryKey: ["presence", "spot", spotId],
    queryFn: () =>
      spotId
        ? fetchPresenceForSpot({
            spotId,
            since,
            maxResults: 50,
          })
        : Promise.resolve([]),
    enabled: Boolean(spotId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return {
    ...queryResult,
    users: queryResult.data ?? [],
  };
}
