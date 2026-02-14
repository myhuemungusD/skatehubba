import { QueryClient } from "@tanstack/react-query";
import { showMessage } from "react-native-flash-message";
import { auth } from "@/lib/firebase.config";

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
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000";

  // Inject Firebase auth token for authenticated requests.
  // React Native fetch does not support cookie-based sessions the way
  // browsers do, so we must send the token via the Authorization header.
  const authHeaders: Record<string, string> = {};
  const currentUser = auth.currentUser;
  if (currentUser) {
    const token = await currentUser.getIdToken();
    authHeaders["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || error.message || `HTTP ${response.status}`);
  }

  return response.json();
}
