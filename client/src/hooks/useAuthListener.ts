import { useEffect } from "react";
import { useAuthStore } from "../store/authStore";

/**
 * One-time auth bootstrap hook.
 *
 * Uses getState() instead of selectors so the component never subscribes
 * to store changes — these are fire-and-forget imperative calls that
 * should run exactly once on mount.
 */
export function useAuthListener() {
  useEffect(() => {
    void useAuthStore.getState().handleRedirectResult();
  }, []);

  useEffect(() => {
    void useAuthStore.getState().initialize();
  }, []);
}
