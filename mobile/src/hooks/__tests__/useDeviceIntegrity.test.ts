import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock React's useEffect to run synchronously
vi.mock("react", async () => {
  const actual = await vi.importActual("react");
  return {
    ...actual,
    useEffect: (fn: () => void) => fn(),
  };
});

vi.mock("@/lib/deviceIntegrity", () => ({
  checkDeviceIntegrity: vi.fn(),
}));

vi.mock("react-native-flash-message", () => ({
  showMessage: vi.fn(),
}));

vi.mock("@/lib/analytics/logEvent", () => ({
  logEvent: vi.fn(),
}));

import { checkDeviceIntegrity } from "@/lib/deviceIntegrity";
import { showMessage } from "react-native-flash-message";
import { logEvent } from "@/lib/analytics/logEvent";
import { useDeviceIntegrity } from "../useDeviceIntegrity";

const mockCheckDeviceIntegrity = checkDeviceIntegrity as ReturnType<typeof vi.fn>;
const mockShowMessage = showMessage as ReturnType<typeof vi.fn>;
const mockLogEvent = logEvent as ReturnType<typeof vi.fn>;

describe("useDeviceIntegrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when device is not compromised", () => {
    mockCheckDeviceIntegrity.mockReturnValue({
      isCompromised: false,
      isJailbroken: false,
      canMockLocation: false,
      isDebugMode: false,
      hookDetected: false,
      checkedAt: Date.now(),
    });

    useDeviceIntegrity();

    expect(mockShowMessage).not.toHaveBeenCalled();
    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  it("shows warning when device is compromised", () => {
    mockCheckDeviceIntegrity.mockReturnValue({
      isCompromised: true,
      isJailbroken: true,
      canMockLocation: false,
      isDebugMode: false,
      hookDetected: false,
      checkedAt: Date.now(),
    });

    useDeviceIntegrity();

    expect(mockShowMessage).toHaveBeenCalledTimes(1);
    expect(mockShowMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Security Warning",
        type: "warning",
        duration: 6000,
      })
    );
  });

  it("logs analytics event with correct properties", () => {
    mockCheckDeviceIntegrity.mockReturnValue({
      isCompromised: true,
      isJailbroken: true,
      canMockLocation: false,
      isDebugMode: false,
      hookDetected: false,
      checkedAt: Date.now(),
    });

    useDeviceIntegrity();

    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith("device_integrity_warning", {
      isJailbroken: true,
      hookDetected: false,
    });
  });

  it("reports hook detection in analytics", () => {
    mockCheckDeviceIntegrity.mockReturnValue({
      isCompromised: true,
      isJailbroken: false,
      canMockLocation: false,
      isDebugMode: false,
      hookDetected: true,
      checkedAt: Date.now(),
    });

    useDeviceIntegrity();

    expect(mockLogEvent).toHaveBeenCalledWith("device_integrity_warning", {
      isJailbroken: false,
      hookDetected: true,
    });
  });

  it("warning message describes jailbreak/root", () => {
    mockCheckDeviceIntegrity.mockReturnValue({
      isCompromised: true,
      isJailbroken: true,
      canMockLocation: false,
      isDebugMode: false,
      hookDetected: false,
      checkedAt: Date.now(),
    });

    useDeviceIntegrity();

    expect(mockShowMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("jailbroken or rooted"),
      })
    );
  });
});
