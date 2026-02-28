/**
 * useVideoUrl - Fetches a signed URL for a game video via the getVideoUrl Cloud Function.
 *
 * Caches the signed URL for its lifetime (1 hour) and refreshes when it expires.
 * Returns loading/error states for UI feedback.
 *
 * @module hooks/useVideoUrl
 */

import { useState, useEffect, useRef } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { logger } from "@/lib/logger";

interface UseVideoUrlParams {
  gameId: string | null;
  storagePath: string | null;
}

interface UseVideoUrlResult {
  url: string | null;
  isLoading: boolean;
  error: string | null;
}

interface GetVideoUrlResponse {
  signedUrl: string;
  expiresAt: string;
}

// In-memory cache keyed by storagePath
const urlCache = new Map<string, { url: string; expiresAt: number }>();

// Signed URLs are valid for 1 hour; refresh 5 minutes early
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export function useVideoUrl({ gameId, storagePath }: UseVideoUrlParams): UseVideoUrlResult {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!gameId || !storagePath) {
      setUrl(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchUrl() {
      // Check cache first
      const cached = urlCache.get(storagePath!);
      if (cached && cached.expiresAt > Date.now() + REFRESH_BUFFER_MS) {
        setUrl(cached.url);
        setIsLoading(false);
        setError(null);
        scheduleRefresh(cached.expiresAt);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const getVideoUrl = httpsCallable<
          { gameId: string; storagePath: string },
          GetVideoUrlResponse
        >(functions, "getVideoUrl");

        const result = await getVideoUrl({ gameId: gameId!, storagePath: storagePath! });
        const { signedUrl, expiresAt } = result.data;
        const expiresAtMs = new Date(expiresAt).getTime();

        if (!cancelled) {
          urlCache.set(storagePath!, { url: signedUrl, expiresAt: expiresAtMs });
          setUrl(signedUrl);
          setIsLoading(false);
          setError(null);
          scheduleRefresh(expiresAtMs);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load video";
          logger.error("[useVideoUrl] Failed to fetch signed URL", { gameId, storagePath, err });
          setError(msg);
          setIsLoading(false);
        }
      }
    }

    function scheduleRefresh(expiresAtMs: number) {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      const delay = expiresAtMs - Date.now() - REFRESH_BUFFER_MS;
      if (delay > 0) {
        refreshTimerRef.current = setTimeout(() => {
          if (!cancelled) fetchUrl();
        }, delay);
      }
    }

    fetchUrl();

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [gameId, storagePath]);

  return { url, isLoading, error };
}
