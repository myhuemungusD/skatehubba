export type ApiErrorCode =
  | "RATE_LIMIT"
  | "REPLAY_DETECTED"
  | "QUOTA_EXCEEDED"
  | "BANNED"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "UNKNOWN";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, code: ApiErrorCode, status?: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const toCode = (value: string): ApiErrorCode => {
  const normalized = value.toUpperCase();

  if (normalized.includes("RATE_LIMIT")) return "RATE_LIMIT";
  if (normalized.includes("REPLAY") || normalized.includes("NONCE")) return "REPLAY_DETECTED";
  if (normalized.includes("QUOTA")) return "QUOTA_EXCEEDED";
  if (normalized.includes("BANNED")) return "BANNED";
  if (normalized.includes("UNAUTHORIZED") || normalized.includes("AUTH")) return "UNAUTHORIZED";
  if (normalized.includes("VALIDATION") || normalized.includes("INVALID"))
    return "VALIDATION_ERROR";

  return "UNKNOWN";
};

const statusToCode = (status?: number): ApiErrorCode => {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "UNAUTHORIZED";
  if (status === 429) return "RATE_LIMIT";
  if (status === 400) return "VALIDATION_ERROR";
  return "UNKNOWN";
};

const extractMessage = (payload: unknown): string | undefined => {
  if (!payload) return undefined;
  if (typeof payload === "string") return payload;
  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message = record.message;
    if (typeof message === "string") return message;
    const errorMessage = record.error;
    if (typeof errorMessage === "string") return errorMessage;
  }
  return undefined;
};

const extractCode = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const directCode = record.code;
  if (typeof directCode === "string") return directCode;
  const error = record.error;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error) {
    const nested = error as Record<string, unknown>;
    const nestedCode = nested.code;
    if (typeof nestedCode === "string") return nestedCode;
  }
  return undefined;
};

export const isApiError = (error: unknown): error is ApiError => {
  return error instanceof ApiError;
};

export const normalizeApiError = (options: {
  status?: number;
  payload?: unknown;
  statusText?: string;
}): ApiError => {
  const extractedCode = extractCode(options.payload);
  const code = extractedCode ? toCode(extractedCode) : statusToCode(options.status);
  const message =
    extractMessage(options.payload) ??
    (options.statusText ? options.statusText : "Something went wrong. Please try again.");

  return new ApiError(message, code, options.status, options.payload);
};

export const getUserFriendlyMessage = (error: ApiError): string => {
  switch (error.code) {
    case "RATE_LIMIT":
      return "You're moving fast. Take a breather and try again in a moment.";
    case "REPLAY_DETECTED":
      return "We blocked a duplicate request. Please try again.";
    case "QUOTA_EXCEEDED":
      return "You've hit today's limit. Try again tomorrow.";
    case "BANNED":
      return "Your account is currently restricted. Contact support if you believe this is a mistake.";
    case "UNAUTHORIZED":
      return "Please sign in again to continue.";
    case "VALIDATION_ERROR":
      return "We couldn't process that request. Double-check your info and try again.";
    default:
      return "Unexpected error. Please try again.";
  }
};
