/**
 * Staging Environment Banner
 *
 * Shows a loud visual indicator when running in staging environment.
 * This prevents accidental use of staging as production.
 *
 * @module components/StagingBanner
 */

import { useEffect, useState } from "react";
import { isStaging, getEnvBanner, getAppEnv, type AppEnv } from "@skatehubba/config";

interface StagingBannerProps {
  /** Force show banner even in prod (for testing) */
  forceShow?: boolean;
}

export function StagingBanner({ forceShow = false }: StagingBannerProps) {
  const [env, setEnv] = useState<AppEnv | null>(null);

  useEffect(() => {
    // Delay slightly to avoid hydration mismatches
    setEnv(getAppEnv());
  }, []);

  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  const isProdHost = hostname === "skatehubba.com" || hostname === "www.skatehubba.com";

  // Only show in staging or local dev (localhost) or if forced
  const showBanner = forceShow || isStaging() || (env === "local" && isLocalHost && !isProdHost);
  if (!showBanner) {
    return null;
  }

  const bannerText = getEnvBanner();
  const isLocal = env === "local";

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        fixed top-0 left-0 right-0 z-40
        py-1 px-4 text-center text-sm font-bold
        ${isLocal ? "bg-blue-600 text-white" : "bg-yellow-400 text-black animate-pulse"}
      `}
    >
      {bannerText}
      {!isLocal && (
        <span className="ml-2 text-xs font-normal">(Data writes go to staging namespace)</span>
      )}
    </div>
  );
}

export default StagingBanner;
