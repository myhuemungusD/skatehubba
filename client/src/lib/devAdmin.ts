/**
 * Dev Admin Mode
 *
 * Allows testing protected flows (Add Spot, Check-In, etc.) without
 * authenticating through Firebase. Only active on localhost in DEV builds.
 *
 * M12: Gated behind import.meta.env.DEV with 1-hour expiry.
 *
 * Enable:  __enableDevAdmin()  — enables with 1-hour expiry and reloads
 * Disable: __disableDevAdmin() — disables and reloads
 */

const DEV_ADMIN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export function isDevAdmin(): boolean {
  if (typeof window === "undefined") return false;
  // M12: Only available in dev builds on localhost
  if (!import.meta.env.DEV) return false;
  if (window.location.hostname !== "localhost") return false;

  const enabled = window.sessionStorage.getItem("devAdmin") === "true";
  if (!enabled) return false;

  // M12: Check expiry
  const expiry = parseInt(window.sessionStorage.getItem("devAdminExpiry") || "0", 10);
  if (expiry > 0 && Date.now() > expiry) {
    window.sessionStorage.removeItem("devAdmin");
    window.sessionStorage.removeItem("devAdminExpiry");
    return false;
  }

  return true;
}

// M12: Only expose global helpers in development builds
if (
  typeof window !== "undefined" &&
  import.meta.env.DEV &&
  window.location.hostname === "localhost"
) {
  window.__enableDevAdmin = () => {
    window.sessionStorage.setItem("devAdmin", "true");
    window.sessionStorage.setItem("devAdminExpiry", String(Date.now() + DEV_ADMIN_EXPIRY_MS));
    window.location.reload();
  };
  window.__disableDevAdmin = () => {
    window.sessionStorage.removeItem("devAdmin");
    window.sessionStorage.removeItem("devAdminExpiry");
    window.location.reload();
  };
}
