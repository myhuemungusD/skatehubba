/**
 * useVideoUrl - Fetches a signed URL for a game video via the getVideoUrl Cloud Function.
 *
 * Caches the signed URL for its lifetime (1 hour) and refreshes when it expires.
 * Returns loading/error states for UI feedback.
 * Includes automatic retry on transient failures.
 *
 * @module hooks/useVideoUrl
 */

import { useState, useEffect, useRef, useCallback } from "react";
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
  retry: () => void;
}

interface GetVideoUrlResponse {
  signedUrl: string;
  expiresAt: string;
}

// In-memory LRU cache keyed by storagePath.
// Evicts oldest entry when the cache exceeds MAX_CACHE_SIZE.
const MAX_CACHE_SIZE = 50;
const urlCache = new Map<string, { url: string; expiresAt: number }>();

function setCacheEntry(key: string, value: { url: string; expiresAt: number }) {
  // Delete first so re-insertion moves the key to the end (most recent)
  urlCache.delete(key);
  urlCache.set(key, value);

  // Evict oldest entries (first in iteration order) when over capacity
  if (urlCache.size > MAX_CACHE_SIZE) {
    const oldest = urlCache.keys().next().value;
    if (oldest !== undefined) urlCache.delete(oldest);
  }
}

// Signed URLs are valid for 1 hour; refresh 5 minutes early
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export function useVideoUrl({ gameId, storagePath }: UseVideoUrlParams): UseVideoUrlResult {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCounterRef = useRef(0);
  // Ref to the latest fetchUrl so scheduleRefresh always calls the current version
  const fetchUrlRef = useRef<(gId: string, sp: string, c: { value: boolean }) => Promise<void>>();

  const fetchUrl = useCallback(
    async (currentGameId: string, currentPath: string, cancelled: { value: boolean }) => {
      function scheduleRefresh(expiresAtMs: number) {
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
        }
        const delay = expiresAtMs - Date.now() - REFRESH_BUFFER_MS;
        if (delay > 0) {
          refreshTimerRef.current = setTimeout(() => {
            if (!cancelled.value && fetchUrlRef.current) {
              fetchUrlRef.current(currentGameId, currentPath, cancelled);
            }
          }, delay);
        }
      }

      // Check cache first
      const cached = urlCache.get(currentPath);
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

        const result = await getVideoUrl({ gameId: currentGameId, storagePath: currentPath });
        const { signedUrl, expiresAt } = result.data;
        const expiresAtMs = new Date(expiresAt).getTime();

        if (!cancelled.value) {
          setCacheEntry(currentPath, { url: signedUrl, expiresAt: expiresAtMs });
          setUrl(signedUrl);
          setIsLoading(false);
          setError(null);
          retryCounterRef.current = 0;
          scheduleRefresh(expiresAtMs);
        }
      } catch (err) {
        if (!cancelled.value) {
          const msg = err instanceof Error ? err.message : "Failed to load video";
          logger.error("[useVideoUrl] Failed to fetch signed URL", {
            gameId: currentGameId,
            storagePath: currentPath,
            err,
          });
          setError(msg);
          setIsLoading(false);
        }
      }
    },
    []
  );

  // Keep ref in sync so scheduled refreshes always call the latest fetchUrl
  fetchUrlRef.current = fetchUrl;

  useEffect(() => {
    if (!gameId || !storagePath) {
      setUrl(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const cancelled = { value: false };
    retryCounterRef.current = 0;

    fetchUrl(gameId, storagePath, cancelled);

    return () => {
      cancelled.value = true;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [gameId, storagePath, fetchUrl]);

  const retry = useCallback(() => {
    if (!gameId || !storagePath) return;
    setError(null);
    retryCounterRef.current += 1;
    fetchUrl(gameId, storagePath, { value: false });
  }, [gameId, storagePath, fetchUrl]);

  return { url, isLoading, error, retry };
}
