import { useQuery } from "@tanstack/react-query";
import { UserProfile } from "@shared/schema";

export interface UserLookupResult {
  userId: string | null;
  isLoading: boolean;
  error: "notFound" | "unknown" | null;
  profile: UserProfile | null;
}

/**
 * Hook to resolve a public username/handle to a canonical internal userId.
 * Uses the existing Phase 3 /api/profiles/:handle endpoint for read-only lookup.
 */
export function useUserLookup(handle: string | undefined): UserLookupResult {
  const { data: profile, isLoading, error, isError } = useQuery<UserProfile>({
    queryKey: ["/api/profiles", handle],
    enabled: !!handle,
    retry: false, // Don't retry on 404
  });

  // Handle "Not Found" case based on API response
  // Assuming the API returns 404 which React Query catches as an error
  const isNotFound = isError && (error as any)?.status === 404;

  return {
    userId: profile?.id || null,
    profile: profile || null,
    isLoading,
    error: isNotFound ? "notFound" : (isError ? "unknown" : null),
  };
}
