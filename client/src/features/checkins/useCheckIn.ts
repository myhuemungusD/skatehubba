import { useCallback, useState } from "react";
import { apiRequest } from "@/lib/api/client";
import { ApiError, normalizeApiError } from "@/lib/api/errors";

export interface CheckInInput {
  spotId: number;
  lat: number;
  lng: number;
  userId: string;
}

export interface CheckInResult {
  checkInId: number;
}

interface CheckInApiResponse {
  success: boolean;
  checkInId?: number;
  message?: string;
}

const createNonce = (): string => {
  // Use crypto.randomUUID if available, otherwise fall back to crypto.getRandomValues
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Set version (4) and variant bits for UUID v4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hexArray = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hexArray.slice(0, 4).join(""),
    hexArray.slice(4, 6).join(""),
    hexArray.slice(6, 8).join(""),
    hexArray.slice(8, 10).join(""),
    hexArray.slice(10, 16).join(""),
  ].join("-");
};

export const useCheckIn = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const reset = useCallback(() => {
    setError(null);
    setIsSubmitting(false);
  }, []);

  const checkIn = useCallback(async (input: CheckInInput): Promise<CheckInResult> => {
    setIsSubmitting(true);
    setError(null);

    const nonce = createNonce();

    try {
      const response = await apiRequest<CheckInApiResponse>({
        method: "POST",
        path: "/api/spots/check-in",
        nonce,
        body: {
          spotId: input.spotId,
          lat: input.lat,
          lng: input.lng,
          nonce,
        },
      });

      if (!response.success || typeof response.checkInId !== "number") {
        throw normalizeApiError({
          status: 400,
          payload: { message: response.message || "Check-in failed" },
        });
      }

      return { checkInId: response.checkInId };
    } catch (err) {
      const normalized = err instanceof ApiError ? err : normalizeApiError({ payload: err });
      setError(normalized);
      throw normalized;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return {
    checkIn,
    isSubmitting,
    error,
    reset,
  };
};
