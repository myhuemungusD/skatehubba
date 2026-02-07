import { useState, useEffect, useCallback } from "react";

export type GeolocationStatus = "idle" | "locating" | "ready" | "browse";

export interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  status: GeolocationStatus;
  error: string | null;
  errorCode: "denied" | "timeout" | "unavailable" | "unsupported" | null;
}

export function useGeolocation(watch = true) {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    status: "idle",
    error: null,
    errorCode: null,
  });

  const enterBrowseMode = useCallback(() => {
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
      // On any geolocation failure, auto-enter browse mode so the user sees a
      // working map instead of a red error banner. The map is fully usable
      // without user location — check-ins are the only thing that requires it.
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

      setState((prev) => ({
        ...prev,
        status: "browse",
        error: null,
        errorCode,
      }));
    };

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
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
