import { getApiBaseUrl } from "@skatehubba/config";
import { auth } from "../firebase/config";
import { ApiError, normalizeApiError } from "./errors";
import { isDevAdmin } from "../devAdmin";

export interface ApiRequestOptions<TBody = unknown> {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: TBody;
  headers?: HeadersInit;
  nonce?: string;
  signal?: AbortSignal;
  /**
   * Request timeout in milliseconds. Defaults to 30000 (30 seconds).
   * Set to 0 to disable timeout.
   */
  timeout?: number;
}

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

export const buildApiUrl = (path: string): string => {
  if (isAbsoluteUrl(path)) return path;
  const base = getApiBaseUrl().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
};

/** H7: RFC 6265 compliant CSRF token extraction using regex (handles '=' in values) */
export const getCsrfToken = (): string | undefined => {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/(?:^|;\s*)csrfToken=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
};

const getAuthToken = async (): Promise<string | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
};

const parseJsonSafely = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }

  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const buildHeaders = async (options: ApiRequestOptions<unknown>): Promise<HeadersInit> => {
  const headers = new Headers({ Accept: "application/json" });

  if (options.headers) {
    const incoming = new Headers(options.headers);
    incoming.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (options.nonce) {
    headers.set("X-Nonce", options.nonce);
  }

  const csrfToken = getCsrfToken();
  if (csrfToken && options.method !== "GET") {
    headers.set("X-CSRF-Token", csrfToken);
  }

  // Dev admin bypass — sends header that backend recognizes in non-production
  if (isDevAdmin()) {
    headers.set("X-Dev-Admin", "true");
  }

  const token = await getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
};

export const apiRequestRaw = async <TBody = unknown>(
  options: ApiRequestOptions<TBody>
): Promise<Response> => {
  const headers = await buildHeaders(options);
  const body = options.body !== undefined ? JSON.stringify(options.body) : undefined;

  // Setup timeout handling
  const timeout = options.timeout ?? 30000; // Default 30s
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  // Use provided signal or create one with timeout
  const signal = options.signal ?? controller.signal;

  if (timeout > 0 && !options.signal) {
    timeoutId = setTimeout(() => controller.abort(), timeout);
  }

  try {
    const response = await fetch(buildApiUrl(options.path), {
      method: options.method,
      headers,
      body,
      credentials: "include",
      signal,
    });

    if (!response.ok) {
      const payload = await parseJsonSafely(response);
      throw normalizeApiError({
        status: response.status,
        statusText: response.statusText,
        payload,
      });
    }

    return response;
  } catch (error) {
    // Timeout: our own AbortController fired (only when no external signal was provided)
    if (error instanceof DOMException && error.name === "AbortError" && !options.signal) {
      throw new ApiError(
        "The request took too long. Check your connection and try again.",
        "TIMEOUT",
        undefined,
        { timeout, originalError: error }
      );
    }

    // Network failure (e.g. "Failed to fetch" when offline or CORS blocked)
    if (error instanceof TypeError && error.message.toLowerCase().includes("fetch")) {
      throw new ApiError(
        "Network error. Check your connection and try again.",
        "NETWORK_ERROR",
        undefined,
        { originalError: error }
      );
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const apiRequest = async <TResponse, TBody = unknown>(
  options: ApiRequestOptions<TBody>
): Promise<TResponse> => {
  const response = await apiRequestRaw(options);
  const payload = await parseJsonSafely(response);

  if (payload === undefined) {
    throw new ApiError("Expected JSON response", "UNKNOWN", response.status);
  }

  return payload as TResponse;
};
