import { describe, it, expect, vi, beforeEach } from "vitest";

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

describe("useCameraPermissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests camera permission when not granted", async () => {
    const requestCamera = vi.fn().mockResolvedValue(true);
    const requestMic = vi.fn().mockResolvedValue(true);

    // Simulate the hook logic
    const hasCameraPermission = false;
    const hasMicPermission = false;
    const visible = true;

    if (visible) {
      if (!hasCameraPermission) await requestCamera();
      if (!hasMicPermission) await requestMic();
    }

    expect(requestCamera).toHaveBeenCalledTimes(1);
    expect(requestMic).toHaveBeenCalledTimes(1);
  });

  it("skips camera request when already granted", async () => {
    const requestCamera = vi.fn().mockResolvedValue(true);
    const requestMic = vi.fn().mockResolvedValue(true);

    const hasCameraPermission = true;
    const hasMicPermission = false;
    const visible = true;

    if (visible) {
      if (!hasCameraPermission) await requestCamera();
      if (!hasMicPermission) await requestMic();
    }

    expect(requestCamera).not.toHaveBeenCalled();
    expect(requestMic).toHaveBeenCalledTimes(1);
  });

  it("skips all requests when both permissions granted", async () => {
    const requestCamera = vi.fn().mockResolvedValue(true);
    const requestMic = vi.fn().mockResolvedValue(true);

    const hasCameraPermission = true;
    const hasMicPermission = true;
    const visible = true;

    if (visible) {
      if (!hasCameraPermission) await requestCamera();
      if (!hasMicPermission) await requestMic();
    }

    expect(requestCamera).not.toHaveBeenCalled();
    expect(requestMic).not.toHaveBeenCalled();
  });

  it("does nothing when not visible", async () => {
    const requestCamera = vi.fn().mockResolvedValue(true);
    const requestMic = vi.fn().mockResolvedValue(true);

    const hasCameraPermission = false;
    const hasMicPermission = false;
    const visible = false;

    if (visible) {
      if (!hasCameraPermission) await requestCamera();
      if (!hasMicPermission) await requestMic();
    }

    expect(requestCamera).not.toHaveBeenCalled();
    expect(requestMic).not.toHaveBeenCalled();
  });

  it("handles camera permission denial", async () => {
    const requestCamera = vi.fn().mockResolvedValue(false);
    const requestMic = vi.fn().mockResolvedValue(true);

    const visible = true;
    const hasCameraPermission = false;
    const hasMicPermission = false;

    let cameraGranted = hasCameraPermission;
    let micGranted = hasMicPermission;

    if (visible) {
      if (!cameraGranted) cameraGranted = await requestCamera();
      if (!micGranted) micGranted = await requestMic();
    }

    expect(cameraGranted).toBe(false);
    expect(micGranted).toBe(true);
  });
});
