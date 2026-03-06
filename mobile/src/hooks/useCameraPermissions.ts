import { useEffect, useState } from "react";

interface UseCameraPermissionsParams {
  visible: boolean;
  hasCameraPermission: boolean;
  hasMicPermission: boolean;
  requestCameraPermission: () => Promise<boolean>;
  requestMicPermission: () => Promise<boolean>;
}

/**
 * Requests camera and microphone permissions when the recorder modal opens.
 * Returns `isInitializing` which is true until permission checks complete.
 */
export function useCameraPermissions({
  visible,
  hasCameraPermission,
  hasMicPermission,
  requestCameraPermission,
  requestMicPermission,
}: UseCameraPermissionsParams) {
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setIsInitializing(true);

    (async () => {
      try {
        if (!hasCameraPermission) {
          await requestCameraPermission();
        }
        if (!hasMicPermission) {
          await requestMicPermission();
        }
      } catch {
        // Permission request threw (e.g. native module error).
        // isInitializing will clear so the permission-denied UI shows.
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    visible,
    hasCameraPermission,
    hasMicPermission,
    requestCameraPermission,
    requestMicPermission,
  ]);

  return { isInitializing };
}
