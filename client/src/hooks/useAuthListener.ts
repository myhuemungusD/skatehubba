import { useEffect, useRef } from "react";
import { useAuthStore } from "../store/authStore";
import { withTimeout } from "../store/authStore.utils";

/**
 * One-time auth bootstrap hook.
 *
 * Serializes handleRedirectResult → initialize so the redirect result
 * (from signInWithRedirect) is consumed and the backend session is
 * created BEFORE the persistent onAuthStateChanged listener fires.
 * Running them as separate useEffects caused a race where initialize
 * could complete first, losing the redirect result and leaving the
 * user stuck on the loading screen.
 *
 * handleRedirectResult is wrapped in a timeout to prevent an infinite
 * hang if Firebase is unreachable (the SDK does not guarantee a timeout
 * on getRedirectResult).
 *
 * A ref guard prevents double-boot under React 18 Strict Mode, which
 * would register duplicate onAuthStateChanged listeners.
 */
export function useAuthListener() {
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    async function boot() {
      // 8s cap — if Firebase is unreachable, fall through to initialize
      // so the app renders instead of hanging on a blank loading screen.
      await withTimeout(
        useAuthStore.getState().handleRedirectResult(),
        8000,
        "redirect_result",
      );
      await useAuthStore.getState().initialize();
    }
    void boot();
  }, []);
}
