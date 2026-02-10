import { QueryClient } from "@tanstack/react-query";
import { showMessage } from "react-native-flash-message";

// Create Query Client with default configuration
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error: Error) => {
        showMessage({
          message: error?.message || "Something went wrong",
          type: "danger",
          duration: 4000,
        });
      },
    },
  },
});

// API request helper for Express backend
export async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<unknown> {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000";

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || error.message || `HTTP ${response.status}`);
  }

  return response.json();
}
