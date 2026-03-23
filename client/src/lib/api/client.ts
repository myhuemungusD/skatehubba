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

export async function apiRequest<T>(options: RequestOptions): Promise<T> {
  const { method, path, body, signal } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Attach Firebase ID token if available
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

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
