import { useEffect } from "react";
import { useAuthStore } from "../store/authStore";

/**
 * One-time auth bootstrap hook.
 *
 * Serializes handleRedirectResult → initialize so the redirect result
 * (from signInWithRedirect) is consumed and the backend session is
 * created BEFORE the persistent onAuthStateChanged listener fires.
 * Running them as separate useEffects caused a race where initialize
 * could complete first, losing the redirect result and leaving the
 * user stuck on the loading screen.
 */
export function useAuthListener() {
  useEffect(() => {
    async function boot() {
      await useAuthStore.getState().handleRedirectResult();
      await useAuthStore.getState().initialize();
    }
    void boot();
  }, []);
}
