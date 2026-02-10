import { useState, useEffect, useCallback, useRef } from "react";

export type GeolocationStatus = "idle" | "locating" | "ready" | "browse";

export interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  status: GeolocationStatus;
  error: string | null;
  errorCode: "denied" | "timeout" | "unavailable" | "unsupported" | null;
}

const MAX_AUTO_RETRIES = 2;
const GEO_TIMEOUT_MS = 30_000;

export function useGeolocation(watch = true) {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    status: "idle",
    error: null,
    errorCode: null,
  });

  const retryCountRef = useRef(0);

  const enterBrowseMode = useCallback(() => {
    retryCountRef.current = 0;
    setState((prev) => ({
      ...prev,
      status: "browse",
      error: null,
    }));
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      // No geolocation support — silently enter browse mode instead of showing error
      setState((prev) => ({
        ...prev,
        status: "browse",
        error: null,
        errorCode: "unsupported",
      }));
      return;
    }

    setState((prev) => ({ ...prev, status: "locating", error: null, errorCode: null }));

    const onSuccess: PositionCallback = (position) => {
      retryCountRef.current = 0;
      setState({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        status: "ready",
        error: null,
        errorCode: null,
      });
    };

    const onError: PositionErrorCallback = (error) => {
      let errorCode: GeolocationState["errorCode"] = null;

      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorCode = "denied";
          break;
        case error.POSITION_UNAVAILABLE:
          errorCode = "unavailable";
          break;
        case error.TIMEOUT:
          errorCode = "timeout";
          break;
      }

      // Auto-retry on timeout or unavailable (not on permission denied).
      // After exhausting retries, fall back to browse mode.
      const isRetryable = errorCode === "timeout" || errorCode === "unavailable";
      if (isRetryable && retryCountRef.current < MAX_AUTO_RETRIES) {
        retryCountRef.current += 1;
        navigator.geolocation.getCurrentPosition(onSuccess, onError, {
          enableHighAccuracy: retryCountRef.current <= 1,
          timeout: GEO_TIMEOUT_MS,
          maximumAge: 30_000,
        });
        return;
      }

      retryCountRef.current = 0;
      setState((prev) => ({
        ...prev,
        status: "browse",
        error:
          errorCode === "timeout"
            ? "Location timed out. Tap retry or browse without location."
            : errorCode === "unavailable"
              ? "Location unavailable. Move to an open area and retry."
              : null,
        errorCode,
      }));
    };

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: GEO_TIMEOUT_MS,
      maximumAge: 0,
    };

    if (watch) {
      const watchId = navigator.geolocation.watchPosition(onSuccess, onError, options);
      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
    }
  }, [watch]);

  useEffect(() => {
    const cleanup = requestLocation();
    return cleanup;
  }, [requestLocation]);

  return {
    ...state,
    retry: requestLocation,
    browseWithoutLocation: enterBrowseMode,
    isBrowseMode: state.status === "browse",
    hasLocation: state.status === "ready" && state.latitude !== null,
  };
}
