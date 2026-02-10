/**
 * Dev Admin Mode
 *
 * Allows testing protected flows (Add Spot, Check-In, etc.) without
 * authenticating through Firebase. Only active on localhost in development.
 *
 * Enable:  sessionStorage.setItem("devAdmin", "true")
 * Disable: sessionStorage.removeItem("devAdmin")
 *
 * Or from the browser console:
 *   __enableDevAdmin()   — enables and reloads
 *   __disableDevAdmin()  — disables and reloads
 */

export function isDevAdmin(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.hostname !== "localhost") return false;
  return window.sessionStorage.getItem("devAdmin") === "true";
}

// Expose global helpers for quick toggling from the browser console
if (typeof window !== "undefined" && window.location.hostname === "localhost") {
  window.__enableDevAdmin = () => {
    window.sessionStorage.setItem("devAdmin", "true");
    window.location.reload();
  };
  window.__disableDevAdmin = () => {
    window.sessionStorage.removeItem("devAdmin");
    window.location.reload();
  };
}
