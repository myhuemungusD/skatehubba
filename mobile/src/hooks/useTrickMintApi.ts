import { useQuery, useMutation } from "@tanstack/react-query";
import { showMessage } from "react-native-flash-message";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ClipListResponse } from "@/components/ClipGrid";

type Tab = "upload" | "my-clips" | "feed";

/**
 * Queries and mutations for the TrickMint screen.
 */
export function useTrickMintApi(activeTab: Tab, isAuthenticated: boolean) {
  const myClipsQuery = useQuery({
    queryKey: ["trickmint", "my-clips"],
    queryFn: () => apiRequest<ClipListResponse>("/api/trickmint/my-clips?limit=50&offset=0"),
    enabled: activeTab === "my-clips" && isAuthenticated,
  });

  const feedQuery = useQuery({
    queryKey: ["trickmint", "feed"],
    queryFn: () => apiRequest<ClipListResponse>("/api/trickmint/feed?limit=50&offset=0"),
    enabled: activeTab === "feed" && isAuthenticated,
  });

  const deleteMutation = useMutation({
    mutationFn: async (clipId: number) => {
      return apiRequest(`/api/trickmint/${clipId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trickmint"] });
      showMessage({
        message: "Clip deleted",
        type: "success",
        duration: 2000,
      });
    },
    onError: () => {
      showMessage({
        message: "Failed to delete clip",
        type: "danger",
        duration: 2000,
      });
    },
  });

  return { myClipsQuery, feedQuery, deleteMutation };
}
