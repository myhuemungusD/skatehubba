import { useCallback, useEffect, useMemo, useState } from "react";
import type { PresencePrivacy, PresenceStatus } from "@shared/validation/presence";

const STORAGE_KEY = "skatehubba.presence.preferences";

interface PresencePreferences {
  enabled: boolean;
  privacy: PresencePrivacy;
  status: PresenceStatus;
}

const defaultPreferences: PresencePreferences = {
  enabled: true,
  privacy: "approximate",
  status: "skating",
};

const readPreferences = (): PresencePreferences => {
  if (typeof window === "undefined") return defaultPreferences;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultPreferences;
  try {
    const parsed = JSON.parse(raw) as Partial<PresencePreferences>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : defaultPreferences.enabled,
      privacy: parsed.privacy ?? defaultPreferences.privacy,
      status: parsed.status ?? defaultPreferences.status,
    };
  } catch {
    return defaultPreferences;
  }
};

export function usePresencePreferences() {
  const [preferences, setPreferences] = useState<PresencePreferences>(defaultPreferences);

  useEffect(() => {
    setPreferences(readPreferences());
  }, []);

  const update = useCallback((next: Partial<PresencePreferences>) => {
    setPreferences((prev) => {
      const updated = { ...prev, ...next };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
      return updated;
    });
  }, []);

  return useMemo(
    () => ({
      preferences,
      setEnabled: (enabled: boolean) => update({ enabled }),
      setPrivacy: (privacy: PresencePrivacy) => update({ privacy }),
      setStatus: (status: PresenceStatus) => update({ status }),
    }),
    [preferences, update]
  );
}

