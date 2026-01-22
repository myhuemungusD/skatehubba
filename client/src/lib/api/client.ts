import { auth } from "../firebase/config";
import { ApiError, normalizeApiError } from "./errors";

export interface ApiRequestOptions<TBody = unknown> {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: TBody;
  headers?: HeadersInit;
  nonce?: string;
  signal?: AbortSignal;
}

const getCsrfToken = (): string | undefined => {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrfToken="))
    ?.split("=")[1];
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

  const response = await fetch(options.path, {
    method: options.method,
    headers,
    body,
    credentials: "include",
    signal: options.signal,
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
