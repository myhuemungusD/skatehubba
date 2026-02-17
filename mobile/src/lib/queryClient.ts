import { QueryClient } from "@tanstack/react-query";
import { showMessage } from "react-native-flash-message";
import { auth } from "@/lib/firebase.config";
import { validateRequestDomain, reportPossiblePinningFailure } from "@/lib/certificatePinning";
import { getAppCheckToken } from "@/lib/appCheck";

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
  const url = `${baseUrl}${endpoint}`;

  // Domain allowlist enforcement — reject requests to untrusted domains
  // before they reach the network stack.
  const domainCheck = validateRequestDomain(url);
  if (!domainCheck.allowed) {
    throw new Error(`Request blocked: ${domainCheck.reason}`);
  }

  // Inject Firebase auth token for authenticated requests.
  // React Native fetch does not support cookie-based sessions the way
  // browsers do, so we must send the token via the Authorization header.
  const authHeaders: Record<string, string> = {};
  const currentUser = auth.currentUser;
  if (currentUser) {
    const token = await currentUser.getIdToken();
    authHeaders["Authorization"] = `Bearer ${token}`;
  }

  // Attach App Check token for server-side request attestation.
  // The token proves this request originates from a genuine app installation.
  const appCheckToken = await getAppCheckToken();
  if (appCheckToken) {
    authHeaders["X-Firebase-AppCheck"] = appCheckToken;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...options.headers,
      },
    });
  } catch (error) {
    // Network-level errors may indicate a certificate pinning rejection.
    // Report for monitoring so the team can distinguish pin failures
    // from genuine connectivity issues.
    reportPossiblePinningFailure(url, error);
    throw error;
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || error.message || `HTTP ${response.status}`);
  }

  return response.json();
}
