import { useState, useEffect, useCallback, useRef } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase.config";

interface CachedUrl {
  url: string;
  expiresAt: number; // Unix ms
}

const urlCache = new Map<string, CachedUrl>();
/** Refresh signed URL 5 minutes before it expires */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Clear the URL cache. Exported for test teardown. */
export function clearUrlCache(): void {
  urlCache.clear();
}

/** Visible for testing — read the current cache size. */
export function getUrlCacheSize(): number {
  return urlCache.size;
}

export interface UseVideoUrlResult {
  url: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Resolves a Firebase Storage path to a signed URL via the getVideoUrl Cloud Function.
 * Caches results in memory and auto-refreshes before expiry.
 * Falls back to clipUrl for legacy moves that don't have a storagePath.
 */
export function useVideoUrl(
  storagePath: string | null | undefined,
  gameId: string,
  fallbackClipUrl?: string
): UseVideoUrlResult {
  const [url, setUrl] = useState<string | null>(() => {
    // If no storagePath, use fallback immediately
    if (!storagePath) return fallbackClipUrl || null;
    // Check cache for instant render
    const cached = urlCache.get(storagePath);
    if (cached && cached.expiresAt - Date.now() > REFRESH_BUFFER_MS) {
      return cached.url;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track whether the component is still mounted to avoid state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchUrl = useCallback(async () => {
    if (!storagePath || !gameId) {
      if (fallbackClipUrl) setUrl(fallbackClipUrl);
      return;
    }

    // Check cache
    const cached = urlCache.get(storagePath);
    if (cached && cached.expiresAt - Date.now() > REFRESH_BUFFER_MS) {
      setUrl(cached.url);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const getVideoUrl = httpsCallable<
        { gameId: string; storagePath: string },
        { signedUrl: string; expiresAt: string }
      >(functions, "getVideoUrl");

      const result = await getVideoUrl({ gameId, storagePath });
      const { signedUrl, expiresAt } = result.data;

      urlCache.set(storagePath, {
        url: signedUrl,
        expiresAt: new Date(expiresAt).getTime(),
      });

      if (mountedRef.current) {
        setUrl(signedUrl);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : "Failed to load video";
      setError(message);
      // Fall back to clipUrl on error (e.g. legacy data)
      if (fallbackClipUrl) setUrl(fallbackClipUrl);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [storagePath, gameId, fallbackClipUrl]);

  useEffect(() => {
    fetchUrl();
  }, [fetchUrl]);

  return { url, isLoading, error, refresh: fetchUrl };
}
