import { useState, useEffect, useCallback } from 'react';

export type GeolocationStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'timeout' | 'error' | 'browse';

export interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  status: GeolocationStatus;
  error: string | null;
  errorCode: 'denied' | 'timeout' | 'unavailable' | 'unsupported' | null;
}

export function useGeolocation(watch = true) {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    status: 'idle',
    error: null,
    errorCode: null,
  });

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: 'Geolocation is not supported by your browser',
        errorCode: 'unsupported',
      }));
      return;
    }

    setState(prev => ({ ...prev, status: 'locating', error: null, errorCode: null }));

    const onSuccess: PositionCallback = (position) => {
      setState({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        status: 'ready',
        error: null,
        errorCode: null,
      });
    };

    const onError: PositionErrorCallback = (error) => {
      let errorMessage = 'Failed to get your location';
      let status: GeolocationStatus = 'error';
      let errorCode: GeolocationState['errorCode'] = null;

      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = 'Location access was denied. Check your browser settings to enable location.';
          status = 'denied';
          errorCode = 'denied';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = 'Your location could not be determined. GPS signal may be weak.';
          errorCode = 'unavailable';
          break;
        case error.TIMEOUT:
          errorMessage = 'Location request timed out. Your device may need more time to get a GPS fix.';
          status = 'timeout';
          errorCode = 'timeout';
          break;
      }

      setState(prev => ({
        ...prev,
        status,
        error: errorMessage,
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

  const enterBrowseMode = useCallback(() => {
    setState(prev => ({
      ...prev,
      status: 'browse',
      error: null,
    }));
  }, []);

  useEffect(() => {
    const cleanup = requestLocation();
    return cleanup;
  }, [requestLocation]);

  return {
    ...state,
    retry: requestLocation,
    browseWithoutLocation: enterBrowseMode,
    isBrowseMode: state.status === 'browse',
    hasLocation: state.status === 'ready' && state.latitude !== null,
  };
}
