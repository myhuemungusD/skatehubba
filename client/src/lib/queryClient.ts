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

  // Network errors should be retried
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }

  // Timeout errors should be retried
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

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

    // Retry rate limits with exponential backoff (handled by retryDelay)
    if (error.code === "RATE_LIMIT") {
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
  // Rate limit errors get longer delays
  if (error instanceof ApiError && error.code === "RATE_LIMIT") {
    return Math.min(1000 * 2 ** attemptIndex, 30000); // Max 30s
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
      // Mutations are not retried by default to prevent duplicate non-idempotent writes.
      // Individual mutations can opt-in to retries if they are idempotent.
      retry: false,
    },
  },
});
