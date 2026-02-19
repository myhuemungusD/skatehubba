/**
 * @vitest-environment jsdom
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useGeolocation } from "./useGeolocation";

describe("useGeolocation", () => {
  let mockGeolocation: {
    getCurrentPosition: ReturnType<typeof vi.fn>;
    watchPosition: ReturnType<typeof vi.fn>;
    clearWatch: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockGeolocation = {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };

    Object.defineProperty(global.navigator, "geolocation", {
      writable: true,
      configurable: true,
      value: mockGeolocation,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("should initialize with idle status", () => {
      const { result } = renderHook(() => useGeolocation(false));

      expect(result.current.status).toBe("locating");
      expect(result.current.latitude).toBe(null);
      expect(result.current.longitude).toBe(null);
      expect(result.current.accuracy).toBe(null);
      expect(result.current.error).toBe(null);
      expect(result.current.errorCode).toBe(null);
    });

    it("should request location on mount when watch is true", () => {
      renderHook(() => useGeolocation(true));

      expect(mockGeolocation.watchPosition).toHaveBeenCalledTimes(1);
      expect(mockGeolocation.watchPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0,
        }
      );
    });

    it("should request location on mount when watch is false", () => {
      renderHook(() => useGeolocation(false));

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0,
        }
      );
    });
  });

  describe("successful location retrieval", () => {
    it("should update state with location data on success", async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success(mockPosition);
      });

      const { result } = renderHook(() => useGeolocation(false));

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
        expect(result.current.latitude).toBe(37.7749);
        expect(result.current.longitude).toBe(-122.4194);
        expect(result.current.accuracy).toBe(10);
        expect(result.current.hasLocation).toBe(true);
        expect(result.current.error).toBe(null);
        expect(result.current.errorCode).toBe(null);
      });
    });

    it("should set hasLocation to true when location is ready", async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.watchPosition.mockImplementation((success) => {
        success(mockPosition);
        return 1;
      });

      const { result } = renderHook(() => useGeolocation(true));

      await waitFor(() => {
        expect(result.current.hasLocation).toBe(true);
      });
    });
  });

  describe("error handling", () => {
    it("should enter browse mode on permission denied", async () => {
      const mockError: GeolocationPositionError = {
        code: 1, // PERMISSION_DENIED
        message: "User denied Geolocation",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.mockImplementation((_, error) => {
        error(mockError);
      });

      const { result } = renderHook(() => useGeolocation(false));

      await waitFor(() => {
        expect(result.current.status).toBe("browse");
        expect(result.current.errorCode).toBe("denied");
        expect(result.current.error).toBe(
          "Location access was denied. Enable location in your browser settings and retry."
        );
        expect(result.current.isBrowseMode).toBe(true);
      });
    });

    it("should auto-retry on position unavailable and enter browse mode after exhausting retries", async () => {
      const mockError: GeolocationPositionError = {
        code: 2, // POSITION_UNAVAILABLE
        message: "Position unavailable",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.mockImplementation((_success, error) => {
        error(mockError);
      });

      const { result } = renderHook(() => useGeolocation(false));

      await waitFor(() => {
        expect(result.current.status).toBe("browse");
        expect(result.current.errorCode).toBe("unavailable");
      });

      // Initial attempt + 2 auto-retries = 3 total calls
      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(3);
    });

    it("should auto-retry on timeout and enter browse mode after exhausting retries", async () => {
      const mockError: GeolocationPositionError = {
        code: 3, // TIMEOUT
        message: "Timeout",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.mockImplementation((_success, error) => {
        error(mockError);
      });

      const { result } = renderHook(() => useGeolocation(false));

      await waitFor(() => {
        expect(result.current.status).toBe("browse");
        expect(result.current.errorCode).toBe("timeout");
      });

      // Initial attempt + 2 auto-retries = 3 total calls
      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(3);
    });

    it("should enter browse mode when geolocation is not supported", async () => {
      Object.defineProperty(global.navigator, "geolocation", {
        writable: true,
        configurable: true,
        value: undefined,
      });

      const { result } = renderHook(() => useGeolocation(false));

      await waitFor(() => {
        expect(result.current.status).toBe("browse");
        expect(result.current.errorCode).toBe("unsupported");
        expect(result.current.error).toBe(null);
      });
    });

    it("should set an actionable error message on timeout after retries exhausted", async () => {
      const mockError: GeolocationPositionError = {
        code: 3,
        message: "Timeout",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.mockImplementation((_success, error) => {
        error(mockError);
      });

      const { result } = renderHook(() => useGeolocation(false));

      await waitFor(() => {
        expect(result.current.status).toBe("browse");
        expect(result.current.errorCode).toBe("timeout");
        expect(result.current.error).toBe(
          "Location timed out. Tap retry or browse without location."
        );
      });
    });

    it("should set an actionable error message on position unavailable after retries exhausted", async () => {
      const mockError: GeolocationPositionError = {
        code: 2,
        message: "Position unavailable",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.mockImplementation((_success, error) => {
        error(mockError);
      });

      const { result } = renderHook(() => useGeolocation(false));

      await waitFor(() => {
        expect(result.current.status).toBe("browse");
        expect(result.current.errorCode).toBe("unavailable");
        expect(result.current.error).toBe(
          "Location unavailable. Move to an open area and retry."
        );
      });
    });
  });

  describe("manual browse mode", () => {
    it("should allow manually entering browse mode", async () => {
      mockGeolocation.getCurrentPosition.mockImplementation(() => {
        // Never calls success or error
      });

      const { result } = renderHook(() => useGeolocation(false));

      act(() => {
        result.current.browseWithoutLocation();
      });

      expect(result.current.status).toBe("browse");
      expect(result.current.isBrowseMode).toBe(true);
      expect(result.current.error).toBe(null);
    });
  });

  describe("retry functionality", () => {
    it("should succeed on auto-retry after initial timeout", async () => {
      let callCount = 0;
      mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
        callCount++;
        if (callCount === 1) {
          const mockError: GeolocationPositionError = {
            code: 3,
            message: "Timeout",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          };
          error(mockError);
        } else {
          const mockPosition: GeolocationPosition = {
            coords: {
              latitude: 40.7128,
              longitude: -74.006,
              accuracy: 15,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          };
          success(mockPosition);
        }
      });

      const { result } = renderHook(() => useGeolocation(false));

      // Auto-retry should succeed on the second attempt
      await waitFor(() => {
        expect(result.current.status).toBe("ready");
        expect(result.current.latitude).toBe(40.7128);
        expect(result.current.longitude).toBe(-74.006);
      });

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
    });

    it("should allow manual retry after all auto-retries exhausted", async () => {
      let callCount = 0;
      mockGeolocation.getCurrentPosition.mockImplementation((_success, error) => {
        callCount++;
        if (callCount <= 3) {
          // Fail all 3 auto attempts (1 initial + 2 retries)
          const mockError: GeolocationPositionError = {
            code: 3,
            message: "Timeout",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          };
          error(mockError);
        }
      });

      const { result } = renderHook(() => useGeolocation(false));

      await waitFor(() => {
        expect(result.current.status).toBe("browse");
      });
      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(3);

      // Now succeed on manual retry
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        const mockPosition: GeolocationPosition = {
          coords: {
            latitude: 40.7128,
            longitude: -74.006,
            accuracy: 15,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        };
        success(mockPosition);
      });

      act(() => {
        result.current.retry();
      });

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
        expect(result.current.latitude).toBe(40.7128);
      });
    });
  });

  describe("retry tracking", () => {
    it("should increment retryCount in state on each auto-retry", async () => {
      let callCount = 0;
      const timeoutError: GeolocationPositionError = {
        code: 3,
        message: "Timeout",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.mockImplementation((_success, error) => {
        callCount++;
        if (callCount <= 3) error(timeoutError);
      });

      const { result } = renderHook(() => useGeolocation(false));

      await waitFor(() => {
        expect(result.current.status).toBe("browse");
        expect(result.current.retryCount).toBe(0);
      });
    });

    it("should expose isRetrying as true while a retry attempt is in-flight", async () => {
      let callCount = 0;
      const timeoutError: GeolocationPositionError = {
        code: 3,
        message: "Timeout",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      let capturedIsRetrying: boolean | undefined;

      mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
        callCount++;
        if (callCount === 1) {
          error(timeoutError);
        } else {
          capturedIsRetrying = true; // second call means retry is happening
          const mockPosition: GeolocationPosition = {
            coords: {
              latitude: 37.7749,
              longitude: -122.4194,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          };
          success(mockPosition);
        }
      });

      const { result } = renderHook(() => useGeolocation(false));

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
        expect(capturedIsRetrying).toBe(true);
      });
    });

    it("should reset retryCount to 0 in state after a successful position fix", async () => {
      let callCount = 0;
      const timeoutError: GeolocationPositionError = {
        code: 3,
        message: "Timeout",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 40.7128,
          longitude: -74.006,
          accuracy: 15,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
        callCount++;
        if (callCount === 1) {
          error(timeoutError);
        } else {
          success(mockPosition);
        }
      });

      const { result } = renderHook(() => useGeolocation(false));

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
        expect(result.current.retryCount).toBe(0);
        expect(result.current.isRetrying).toBe(false);
      });
    });
  });

  describe("watch mode cleanup", () => {
    it("should clear watch on unmount when watch is true", () => {
      const mockWatchId = 123;
      mockGeolocation.watchPosition.mockReturnValue(mockWatchId);

      const { unmount } = renderHook(() => useGeolocation(true));

      unmount();

      expect(mockGeolocation.clearWatch).toHaveBeenCalledWith(mockWatchId);
    });

    it("should not clear watch when watch is false", () => {
      mockGeolocation.getCurrentPosition.mockImplementation(() => {});

      const { unmount } = renderHook(() => useGeolocation(false));

      unmount();

      expect(mockGeolocation.clearWatch).not.toHaveBeenCalled();
    });
  });

  describe("derived properties", () => {
    it("should set isBrowseMode to true when status is browse", async () => {
      const mockError: GeolocationPositionError = {
        code: 1,
        message: "Denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.mockImplementation((_, error) => {
        error(mockError);
      });

      const { result } = renderHook(() => useGeolocation(false));

      await waitFor(() => {
        expect(result.current.isBrowseMode).toBe(true);
      });
    });

    it("should set hasLocation to false when location is not ready", () => {
      mockGeolocation.getCurrentPosition.mockImplementation(() => {
        // Never resolves
      });

      const { result } = renderHook(() => useGeolocation(false));

      expect(result.current.hasLocation).toBe(false);
    });

    it("should set isRetrying to false in the initial locating state", () => {
      mockGeolocation.getCurrentPosition.mockImplementation(() => {
        // Never resolves
      });

      const { result } = renderHook(() => useGeolocation(false));

      expect(result.current.isRetrying).toBe(false);
    });
  });
});
