import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { upsertPresence } from "./presenceService";
import { usePresencePreferences } from "./usePresencePreferences";
import type { PresencePrivacy, PresenceStatus } from "@shared/validation/presence";

interface PresenceHeartbeatOptions {
  location?: { lat: number; lng: number } | null;
  spotId?: string;
}

export function usePresenceHeartbeat({ location, spotId }: PresenceHeartbeatOptions) {
  const { user, profile } = useAuth();
  const { preferences, setEnabled, setPrivacy, setStatus } = usePresencePreferences();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const isAnonymous = user?.isAnonymous ?? false;
  const canWritePresence = Boolean(user && !isAnonymous && preferences.enabled);

  const displayName = useMemo(() => {
    if (profile?.username) return profile.username;
    return user?.displayName || user?.email || "Skater";
  }, [profile?.username, user?.displayName, user?.email]);

  const sendHeartbeat = useCallback(async () => {
    if (!user || isAnonymous || !preferences.enabled) return;
    await upsertPresence({
      uid: user.uid,
      displayName,
      avatarUrl: profile?.avatarUrl ?? undefined,
      status: preferences.status as PresenceStatus,
      privacy: preferences.privacy as PresencePrivacy,
      location: location ? { lat: location.lat, lng: location.lng } : undefined,
      spotId,
    });
  }, [
    user,
    isAnonymous,
    preferences.enabled,
    preferences.status,
    preferences.privacy,
    displayName,
    profile?.avatarUrl,
    location,
    spotId,
  ]);

  useEffect(() => {
    if (!canWritePresence) return;

    const start = async () => {
      await sendHeartbeat();
      intervalRef.current = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        void sendHeartbeat();
      }, 60_000);
    };

    void start();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [canWritePresence, sendHeartbeat]);

  return {
    preferences,
    setEnabled,
    setPrivacy,
    setStatus,
  };
}

