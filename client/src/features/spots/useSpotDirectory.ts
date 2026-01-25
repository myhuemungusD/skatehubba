import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchSpotsPage } from "./spotService";

export type SpotSort = "closest" | "trending" | "newest";

interface SpotDirectoryParams {
  sort: SpotSort;
}

export function useSpotDirectory({ sort }: SpotDirectoryParams) {
  const queryResult = useInfiniteQuery({
    queryKey: ["spots", "directory", sort],
    queryFn: ({ pageParam }) =>
      fetchSpotsPage({
        pageSize: 24,
        cursor: pageParam ?? null,
        sort,
      }),
    initialPageParam: null as null,
    getNextPageParam: (lastPage) => lastPage.cursor,
  });

  const spots = queryResult.data?.pages.flatMap((page) => page.spots) ?? [];

  return {
    ...queryResult,
    spots,
  };
}
