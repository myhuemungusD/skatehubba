import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiRequestRaw } from "./api/client";
import { ApiError } from "./api/errors";

/**
 * Simple API request helper.
 * Always passes a valid HeadersInit for TypeScript.
 */
export async function apiRequest(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  data?: unknown
): Promise<Response> {
  return apiRequestRaw({
    method,
    path: url,
    body: data,
  });
}

type UnauthorizedBehavior = "returnNull" | "throw";

/**
 * Default query function for React Query.
 */
export const getQueryFn =
  <T>({ on401 }: { on401: UnauthorizedBehavior }): QueryFunction<T> =>
  async ({ queryKey }) => {
    try {
      const res = await apiRequestRaw({
        method: "GET",
        path: queryKey.join("/"),
      });
      return (await res.json()) as T;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && on401 === "returnNull") {
        return null as T;
      }
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
