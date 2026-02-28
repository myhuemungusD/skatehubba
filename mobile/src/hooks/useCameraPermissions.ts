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
    if (visible) {
      setIsInitializing(true);
      (async () => {
        if (!hasCameraPermission) {
          await requestCameraPermission();
        }
        if (!hasMicPermission) {
          await requestMicPermission();
        }
        setIsInitializing(false);
      })();
    }
  }, [
    visible,
    hasCameraPermission,
    hasMicPermission,
    requestCameraPermission,
    requestMicPermission,
  ]);

  return { isInitializing };
}
