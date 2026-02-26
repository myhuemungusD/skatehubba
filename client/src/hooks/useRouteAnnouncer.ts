import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * Announces route changes to screen readers and moves focus to main content.
 * Addresses WCAG 2.1 SC 2.4.3 (Focus Order) for SPA client-side navigation.
 */
export function useRouteAnnouncer() {
  const [location] = useLocation();
  const prevLocation = useRef(location);

  useEffect(() => {
    if (prevLocation.current === location) return;
    prevLocation.current = location;

    // Move focus to the main content area after navigation
    const main = document.querySelector("main") || document.getElementById("root");
    if (main instanceof HTMLElement) {
      main.focus({ preventScroll: false });
    }
  }, [location]);
}
