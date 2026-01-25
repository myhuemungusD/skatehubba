import { useCallback, useState } from "react";
import { doc, increment, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ApiError, normalizeApiError } from "@/lib/api/errors";

export interface CheckInInput {
  spotId: string;
  lat: number;
  lng: number;
  userId: string;
}

export interface CheckInResult {
  spotId: string;
}

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

    try {
      if (!db) {
        throw normalizeApiError({
          status: 503,
          payload: { message: "Database unavailable" },
        });
      }

      const spotRef = doc(db, "spots", input.spotId);
      await updateDoc(spotRef, {
        "stats.checkinsAll": increment(1),
        "stats.checkins30d": increment(1),
        lastCheckInAt: serverTimestamp(),
        lastCheckInBy: input.userId,
        lastCheckInLocation: { lat: input.lat, lng: input.lng },
        updatedAt: serverTimestamp(),
      });

      return { spotId: input.spotId };
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
