/**
 * Device Integrity — jailbreak / root detection via jail-monkey.
 *
 * Detects jailbroken (iOS) or rooted (Android) devices so the app can
 * warn users and optionally restrict sensitive features (video
 * verification, Stripe payments) on compromised devices.
 *
 * The app does NOT block usage — it surfaces a warning and exposes
 * `isDeviceCompromised()` for feature-level gating.
 *
 * jail-monkey requires native modules (unavailable in Expo Go). When
 * the module is missing we return safe defaults, matching the pattern
 * used by react-native-vision-camera and react-native-maps.
 *
 * @see https://github.com/GantMan/jail-monkey
 */

import { isExpoGo } from "./isExpoGo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeviceIntegrityResult {
  readonly isCompromised: boolean;
  readonly isJailbroken: boolean;
  readonly canMockLocation: boolean;
  readonly isDebugMode: boolean;
  readonly hookDetected: boolean;
  readonly checkedAt: number;
}

// ---------------------------------------------------------------------------
// Conditional native module import
// ---------------------------------------------------------------------------

// jail-monkey requires native modules; loaded only in dev-client / standalone
// builds. In Expo Go the require will throw — we catch and fall back to safe
// defaults. This mirrors the pattern in challenge/new.tsx for vision-camera.
let JailMonkey: {
  isJailBroken: () => boolean;
  canMockLocation: boolean;
  isOnExternalStorage: boolean;
  isDebuggedMode: () => boolean;
  hookDetected: () => boolean;
} | null = null;

if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("jail-monkey");
    JailMonkey = mod.default ?? mod;
  } catch {
    // Native module unavailable — Expo Go or missing native link
  }
}

// ---------------------------------------------------------------------------
// State (module-scoped, cached for the lifetime of the process)
// ---------------------------------------------------------------------------

let cachedResult: DeviceIntegrityResult | null = null;

const SAFE_DEFAULTS: DeviceIntegrityResult = Object.freeze({
  isCompromised: false,
  isJailbroken: false,
  canMockLocation: false,
  isDebugMode: false,
  hookDetected: false,
  checkedAt: 0,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run device integrity checks. Results are cached — jailbreak state does not
 * change during a single app session.
 */
export function checkDeviceIntegrity(): DeviceIntegrityResult {
  if (cachedResult) return cachedResult;

  if (!JailMonkey) {
    cachedResult = { ...SAFE_DEFAULTS, checkedAt: Date.now() };
    return cachedResult;
  }

  try {
    const isJailbroken = JailMonkey.isJailBroken();
    const canMockLocation = JailMonkey.canMockLocation;
    // isDebuggedMode() is Android-only; returns false / may throw on iOS
    let isDebugMode = false;
    try {
      isDebugMode = JailMonkey.isDebuggedMode();
    } catch {
      // Expected on iOS — isDebuggedMode is an Android-only API
    }
    const hookDetected = JailMonkey.hookDetected();

    cachedResult = Object.freeze({
      isCompromised: isJailbroken || hookDetected,
      isJailbroken,
      canMockLocation,
      isDebugMode,
      hookDetected,
      checkedAt: Date.now(),
    });
  } catch (error) {
    console.error("[DeviceIntegrity] Check failed:", error);
    cachedResult = { ...SAFE_DEFAULTS, checkedAt: Date.now() };
  }

  return cachedResult;
}

/**
 * Quick boolean check for gating sensitive features (payments, video
 * verification) on compromised devices.
 */
export function isDeviceCompromised(): boolean {
  return checkDeviceIntegrity().isCompromised;
}

/** @internal Clear cached result — test-only. */
export function _resetForTesting(): void {
  cachedResult = null;
}
