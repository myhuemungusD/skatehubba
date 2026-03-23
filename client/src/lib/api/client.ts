import { auth } from "../firebase/config";

const API_BASE = "/api";

interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      headers["Authorization"] = `Bearer ${token}`;
    } catch {
      // Token fetch failed — request proceeds without auth
    }
  }
  return headers;
}

async function doFetch(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
  signal?: AbortSignal
): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK_ERROR", "Network error. Check your connection.");
  }
}

export async function apiRequest<T>(options: RequestOptions): Promise<T> {
  const { method, path, body, signal } = options;
  const headers = await getAuthHeaders();

  let res = await doFetch(method, path, headers, body, signal);

  // On 401, try refreshing the token once and retry
  if (res.status === 401 && auth.currentUser) {
    try {
      const freshToken = await auth.currentUser.getIdToken(true);
      headers["Authorization"] = `Bearer ${freshToken}`;
      res = await doFetch(method, path, headers, body, signal);
    } catch {
      // Force-refresh failed — fall through to the error below
    }
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "UNKNOWN", message: res.statusText }));
    throw new ApiError(res.status, data.error || "UNKNOWN", data.message || "Request failed");
  }

  return res.json();
}

// Convenience methods
export const api = {
  get: <T>(path: string, signal?: AbortSignal) =>
    apiRequest<T>({ method: "GET", path, signal }),

  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>({ method: "POST", path, body }),

  put: <T>(path: string, body?: unknown) =>
    apiRequest<T>({ method: "PUT", path, body }),

  delete: <T>(path: string) =>
    apiRequest<T>({ method: "DELETE", path }),
};
