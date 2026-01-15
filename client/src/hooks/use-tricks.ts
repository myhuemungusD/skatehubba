import { useMutation, useQueryClient } from "@tanstack/react-query";
import { tricks } from "@shared/schema";
import { apiRequest } from "../lib/queryClient";

type Trick = typeof tricks.$inferSelect;
export type TrickUI = Trick & { isLiked?: boolean };

type InfiniteTrickData = {
  pages: TrickUI[][];
  pageParams: unknown[];
};

type LikePayload = {
  trickId: Trick["id"];
  isLiked: boolean;
};

type LikeResponse = {
  success: boolean;
};

const isTrickArray = (data: unknown): data is TrickUI[] => Array.isArray(data);

const isInfiniteTrickData = (data: unknown): data is InfiniteTrickData => {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  if (!("pages" in data)) {
    return false;
  }

  const pages = (data as { pages?: unknown }).pages;
  return Array.isArray(pages);
};

const applyLikeToList = (items: TrickUI[], trickId: Trick["id"], isLiked: boolean) => {
  return items.map((item) => (item.id === trickId ? { ...item, isLiked } : item));
};

export function useLikeTrick() {
  const queryClient = useQueryClient();

  return useMutation<LikeResponse, Error, LikePayload, { previous: unknown }>({
    mutationFn: async ({ trickId, isLiked }) => {
      const response = await apiRequest("POST", `/api/tricks/${trickId}/like`, { isLiked });
      return (await response.json()) as LikeResponse;
    },
    onMutate: async ({ trickId, isLiked }) => {
      await queryClient.cancelQueries({ queryKey: ["tricks"] });
      const previous = queryClient.getQueryData<unknown>(["tricks"]);

      if (isTrickArray(previous)) {
        queryClient.setQueryData<TrickUI[]>(["tricks"], applyLikeToList(previous, trickId, isLiked));
      } else if (isInfiniteTrickData(previous)) {
        queryClient.setQueryData<InfiniteTrickData>(["tricks"], {
          ...previous,
          pages: previous.pages.map((page) => applyLikeToList(page, trickId, isLiked)),
        });
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["tricks"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tricks"] });
    },
  });
}
