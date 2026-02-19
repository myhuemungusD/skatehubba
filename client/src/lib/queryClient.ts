import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiRequestRaw } from "./api/client";
import { ApiError } from "./api/errors";

/**
 * Determines if an error should be retried based on error type.
 * Retries network errors and server errors (5xx), but not client errors (4xx).
 */
const shouldRetry = (failureCount: number, error: unknown): boolean => {
  // Max 3 retries
  if (failureCount >= 3) return false;

  if (error instanceof ApiError) {
    // Never retry these error types
    const nonRetryableCodes = [
      "UNAUTHORIZED",
      "VALIDATION_ERROR",
      "BANNED",
      "REPLAY_DETECTED",
      "QUOTA_EXCEEDED",
    ];

    if (nonRetryableCodes.includes(error.code)) {
      return false;
    }

    // Transient failures — retry with backoff
    if (error.code === "RATE_LIMIT" || error.code === "TIMEOUT" || error.code === "NETWORK_ERROR") {
      return true;
    }

    // Retry 5xx server errors
    if (error.status && error.status >= 500) {
      return true;
    }

    // Don't retry 4xx client errors
    if (error.status && error.status >= 400 && error.status < 500) {
      return false;
    }
  }

  // Default: retry unknown errors
  return true;
};

/**
 * Calculates exponential backoff delay for retries.
 * For rate limits, uses longer delays.
 */
const retryDelay = (attemptIndex: number, error: unknown): number => {
  if (error instanceof ApiError) {
    // Rate limits need longer back-off to avoid hammering the server
    if (error.code === "RATE_LIMIT") {
      return Math.min(1000 * 2 ** attemptIndex, 30000); // Max 30s
    }
    // Transient network/timeout failures — give the network a moment
    if (error.code === "NETWORK_ERROR" || error.code === "TIMEOUT") {
      return Math.min(1000 * 2 ** attemptIndex, 15000); // Max 15s
    }
  }

  // Standard exponential backoff: 1s, 2s, 4s
  return Math.min(1000 * 2 ** attemptIndex, 10000); // Max 10s
};

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
      retry: shouldRetry,
      retryDelay,
    },
    mutations: {
      retry: shouldRetry,
      retryDelay,
    },
  },
});
