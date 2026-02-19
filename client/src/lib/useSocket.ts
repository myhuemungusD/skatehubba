/**
 * Socket.io Client Hook
 *
 * Enterprise-grade React hook for WebSocket connections.
 * Features:
 * - Automatic authentication with Firebase token
 * - Reconnection handling
 * - Connection state management
 * - Type-safe event handlers
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { auth } from "./firebase";
import { logger } from "./logger";
import type { User } from "firebase/auth";
import type { ClientToServerEvents, ServerToClientEvents } from "./socket-types";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

interface UseSocketOptions {
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Reconnection attempts (default: 5) */
  reconnectionAttempts?: number;
  /** Reconnection delay in ms (default: 1000) */
  reconnectionDelay?: number;
}

interface UseSocketReturn {
  /** Socket instance */
  socket: TypedSocket | null;
  /** Current connection state */
  connectionState: ConnectionState;
  /** Error message if connection failed */
  error: string | null;
  /** Manually connect */
  connect: () => Promise<void>;
  /** Manually disconnect */
  disconnect: () => void;
  /** Check if connected */
  isConnected: boolean;
}

/**
 * Hook for managing WebSocket connection
 *
 * @example
 * ```tsx
 * function BattlePage() {
 *   const { socket, isConnected, connectionState } = useSocket();
 *
 *   useEffect(() => {
 *     if (!socket) return;
 *
 *     socket.on('battle:update', (data) => {
 *       console.log('Battle updated:', data);
 *     });
 *
 *     return () => {
 *       socket.off('battle:update');
 *     };
 *   }, [socket]);
 *
 *   if (!isConnected) return <div>Connecting...</div>;
 *
 *   return <BattleUI />;
 * }
 * ```
 */
export function useSocket(options: UseSocketOptions = {}): UseSocketReturn {
  const { autoConnect = true, reconnectionAttempts = 5, reconnectionDelay = 1000 } = options;

  const socketRef = useRef<TypedSocket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    // Don't reconnect if already connected
    if (socketRef.current?.connected) {
      return;
    }

    // Clean up any existing disconnected socket before creating a new one
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Get current Firebase user
    const user = auth.currentUser;
    if (!user) {
      setError("Not authenticated");
      setConnectionState("error");
      return;
    }

    setConnectionState("connecting");
    setError(null);

    try {
      // Shared promise that the auth callback awaits after a force-refresh
      // is triggered by a connect_error. This ensures the next reconnect
      // attempt uses the freshly-refreshed token, not the stale cached one.
      let pendingRefresh: Promise<string> | null = null;

      // Create socket connection.
      // Pass auth as a function so socket.io calls it on every reconnect
      // attempt, ensuring a fresh Firebase ID token is used instead of the
      // stale one from the original handshake.
      const socket: TypedSocket = io({
        auth: async (cb) => {
          try {
            const currentUser = auth.currentUser;
            if (!currentUser) {
              // No user — send empty auth so server rejects cleanly.
              // Don't fall back to a stale token.
              cb({});
              return;
            }
            // If connect_error triggered a force-refresh, await it so
            // getIdToken() below returns the new token, not the stale one.
            if (pendingRefresh) {
              await pendingRefresh.catch((error: unknown) => {
                logger.warn("[Socket] Token force-refresh failed", error);
              });
              pendingRefresh = null;
            }
            const freshToken = await currentUser.getIdToken();
            cb({ token: freshToken });
          } catch (error) {
            logger.warn("[Socket] Failed to retrieve auth token", error);
            cb({});
          }
        },
        transports: ["websocket", "polling"],
        reconnectionAttempts,
        reconnectionDelay,
        timeout: 10000,
      });

      // Connection events
      socket.on("connect", () => {
        setConnectionState("connected");
        setError(null);
      });

      socket.on("disconnect", (reason) => {
        if (reason === "io server disconnect") {
          // Server initiated disconnect, don't auto-reconnect
          setConnectionState("disconnected");
        } else {
          // Client-side disconnect or network issue
          setConnectionState("connecting");
        }
      });

      socket.on("connect_error", (err) => {
        const isAuthError =
          err.message === "invalid_token" ||
          err.message === "authentication_required" ||
          err.message === "authentication_failed";

        if (isAuthError && !pendingRefresh) {
          // Token likely expired — kick off a force-refresh.
          // The auth callback above will await this before fetching the
          // next token, ensuring the reconnect uses a fresh one.
          const currentUser = auth.currentUser;
          if (currentUser) {
            logger.log("[Socket] Auth error, forcing token refresh before reconnect");
            pendingRefresh = currentUser.getIdToken(true);
          }
          // Auth errors are real errors — surface them so UI can prompt re-login
          setError(err.message);
          setConnectionState("error");
        } else {
          // Transient network/server errors — log silently and let socket.io
          // handle reconnection automatically. Do not surface as UI error state
          // so core auth/map experience is unaffected during demo.
          logger.warn("[Socket] Connection error (will retry)", err.message);
        }
      });

      socket.on("error", (data) => {
        // Feature-level errors (battle, game) emitted by the server are
        // logged only — not surfaced as UI error state. Non-MVP features
        // failing silently keeps the core auth/map experience stable.
        logger.warn("[Socket] Feature error (suppressed from UI)", data.code, data.message);
      });

      socket.on("connected", (data) => {
        logger.log("[Socket] Connected to server", data);
      });

      socketRef.current = socket;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setConnectionState("error");
    }
  }, [reconnectionAttempts, reconnectionDelay]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnectionState("disconnected");
    }
  }, []);

  // Auto-connect on mount if user is authenticated
  useEffect(() => {
    if (!autoConnect) return;

    // Listen for auth state changes
    const unsubscribe = auth.onAuthStateChanged((user: User | null) => {
      if (user) {
        connect();
      } else {
        disconnect();
      }
    });

    return () => {
      unsubscribe();
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    socket: socketRef.current,
    connectionState,
    error,
    connect,
    disconnect,
    isConnected: connectionState === "connected",
  };
}

/**
 * Hook for subscribing to socket events
 *
 * @example
 * ```tsx
 * useSocketEvent('battle:update', (data) => {
 *   setBattle(data);
 * });
 * ```
 */
export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
  socket: TypedSocket | null
): void {
  useEffect(() => {
    if (!socket) return;

    socket.on(event, handler as never);

    return () => {
      socket.off(event, handler as never);
    };
  }, [socket, event, handler]);
}
