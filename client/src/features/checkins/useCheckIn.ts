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
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
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
