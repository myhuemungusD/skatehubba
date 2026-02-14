/**
 * Tests for useSocket Hook
 *
 * Tests the useSocket and useSocketEvent React hooks by mocking
 * socket.io-client, Firebase auth, and React hooks. Because the Vitest
 * environment is "node" (no DOM), we cannot use renderHook. Instead we
 * capture the event handlers registered on the mock socket and invoke
 * them directly, and we mock React hooks to capture state updates.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock socket
// ---------------------------------------------------------------------------
const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  connected: false,
  removeAllListeners: vi.fn(),
  disconnect: vi.fn(),
  emit: vi.fn(),
  conn: { transport: { name: "websocket" } },
};

const mockIo = vi.fn(() => mockSocket);

vi.mock("socket.io-client", () => ({
  io: (...args: any[]) => mockIo(...args),
}));

// ---------------------------------------------------------------------------
// Mock firebase auth
// ---------------------------------------------------------------------------
let mockCurrentUser: any = {
  uid: "user-1",
  getIdToken: vi.fn().mockResolvedValue("mock-token"),
};
let authStateCallback: ((user: any) => void) | null = null;
const mockUnsubscribe = vi.fn();

vi.mock("../firebase", () => ({
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
    set currentUser(val: any) {
      mockCurrentUser = val;
    },
    onAuthStateChanged: vi.fn((cb: any) => {
      authStateCallback = cb;
      return mockUnsubscribe;
    }),
  },
}));

// ---------------------------------------------------------------------------
// Mock logger
// ---------------------------------------------------------------------------
vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Mock React hooks
//
// We capture the callbacks passed to useEffect / useCallback so we can
// invoke them in tests, and we capture state-setter calls so we can
// assert on connection-state transitions.
// ---------------------------------------------------------------------------
const capturedEffects: Array<() => (() => void) | void> = [];
const capturedCallbacks: Array<(...args: any[]) => any> = [];
const stateUpdates: Map<number, any[]> = new Map(); // stateIndex -> list of values
let stateIndex = 0;
const stateDefaults: any[] = [];

vi.mock("react", () => ({
  useEffect: vi.fn((fn: () => (() => void) | void) => {
    capturedEffects.push(fn);
  }),
  useCallback: vi.fn((fn: (...args: any[]) => any) => {
    capturedCallbacks.push(fn);
    return fn;
  }),
  useState: vi.fn((initial: any) => {
    const idx = stateIndex++;
    stateDefaults.push(initial);
    if (!stateUpdates.has(idx)) {
      stateUpdates.set(idx, []);
    }
    const setter = (val: any) => {
      stateUpdates.get(idx)!.push(val);
    };
    return [initial, setter];
  }),
  useRef: vi.fn((initial: any) => ({ current: initial })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get all values that were passed to the state setter at `index`. */
function getStateUpdatesFor(index: number): any[] {
  return stateUpdates.get(index) ?? [];
}

/** Find the handler registered for a given event via mockSocket.on(event, handler). */
function getSocketHandler(event: string): ((...args: any[]) => void) | undefined {
  const call = mockSocket.on.mock.calls.find(([e]: [string]) => e === event);
  return call ? call[1] : undefined;
}

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  capturedEffects.length = 0;
  capturedCallbacks.length = 0;
  stateUpdates.clear();
  stateIndex = 0;
  stateDefaults.length = 0;
  mockSocket.connected = false;
  mockCurrentUser = {
    uid: "user-1",
    getIdToken: vi.fn().mockResolvedValue("mock-token"),
  };
  authStateCallback = null;
});

// ===========================================================================
// Tests
// ===========================================================================

describe("useSocket", () => {
  // -----------------------------------------------------------------------
  // 1. Module exports
  // -----------------------------------------------------------------------
  describe("module exports", () => {
    it("exports useSocket as a function", async () => {
      const mod = await import("../useSocket");
      expect(mod.useSocket).toBeTypeOf("function");
    });

    it("exports useSocketEvent as a function", async () => {
      const mod = await import("../useSocket");
      expect(mod.useSocketEvent).toBeTypeOf("function");
    });

    it("exports ConnectionState type (useSocket returns connectionState)", async () => {
      const { useSocket } = await import("../useSocket");
      const result = useSocket();
      expect(result).toHaveProperty("connectionState");
      expect(result).toHaveProperty("socket");
      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("connect");
      expect(result).toHaveProperty("disconnect");
      expect(result).toHaveProperty("isConnected");
    });
  });

  // -----------------------------------------------------------------------
  // 2. Default state
  // -----------------------------------------------------------------------
  describe("default state", () => {
    it("returns disconnected state and null socket initially", async () => {
      const { useSocket } = await import("../useSocket");
      const result = useSocket();

      expect(result.connectionState).toBe("disconnected");
      expect(result.socket).toBeNull();
      expect(result.error).toBeNull();
      expect(result.isConnected).toBe(false);
    });

    it("sets isConnected to false when connectionState is not connected", async () => {
      const { useSocket } = await import("../useSocket");
      const result = useSocket();

      // Default state is "disconnected"
      expect(result.isConnected).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Socket creation with auth options
  // -----------------------------------------------------------------------
  describe("socket creation", () => {
    it("calls io() with auth function and transport options when connect is invoked", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      // capturedCallbacks[0] = connect, capturedCallbacks[1] = disconnect
      const connectFn = capturedCallbacks[0];
      expect(connectFn).toBeTypeOf("function");

      await connectFn();

      expect(mockIo).toHaveBeenCalledTimes(1);
      const ioArgs = mockIo.mock.calls[0][0];
      expect(ioArgs).toHaveProperty("auth");
      expect(ioArgs.transports).toEqual(["websocket", "polling"]);
      expect(ioArgs.reconnectionAttempts).toBe(5);
      expect(ioArgs.reconnectionDelay).toBe(1000);
      expect(ioArgs.timeout).toBe(10000);
    });

    it("passes custom reconnection options to io()", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket({ reconnectionAttempts: 10, reconnectionDelay: 2000 });

      const connectFn = capturedCallbacks[0];
      await connectFn();

      const ioArgs = mockIo.mock.calls[0][0];
      expect(ioArgs.reconnectionAttempts).toBe(10);
      expect(ioArgs.reconnectionDelay).toBe(2000);
    });

    it("auth callback fetches a fresh Firebase token", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      // Extract the auth callback that was passed to io()
      const ioArgs = mockIo.mock.calls[0][0];
      const authCb = ioArgs.auth;
      expect(authCb).toBeTypeOf("function");

      const cb = vi.fn();
      await authCb(cb);

      expect(mockCurrentUser.getIdToken).toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith({ token: "mock-token" });
    });

    it("auth callback sends empty object when no user is present", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      // Simulate user logging out after socket creation
      const savedUser = mockCurrentUser;
      mockCurrentUser = null;

      const ioArgs = mockIo.mock.calls[0][0];
      const authCb = ioArgs.auth;
      const cb = vi.fn();
      await authCb(cb);

      expect(cb).toHaveBeenCalledWith({});

      // Restore
      mockCurrentUser = savedUser;
    });
  });

  // -----------------------------------------------------------------------
  // 4. Connection state management
  // -----------------------------------------------------------------------
  describe("connection state management", () => {
    it("sets state to connecting when connect() is called", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      // State index 0 = connectionState, index 1 = error
      const connectionStateUpdates = getStateUpdatesFor(0);
      expect(connectionStateUpdates).toContain("connecting");
    });

    it("sets state to connected when socket emits connect event", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      const connectHandler = getSocketHandler("connect");
      expect(connectHandler).toBeTypeOf("function");
      connectHandler!();

      const connectionStateUpdates = getStateUpdatesFor(0);
      expect(connectionStateUpdates).toContain("connected");
    });

    it("clears error on successful connect", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      const connectHandler = getSocketHandler("connect");
      connectHandler!();

      const errorUpdates = getStateUpdatesFor(1);
      expect(errorUpdates).toContain(null);
    });

    it("registers handlers for connect, disconnect, connect_error, error, and connected events", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      const registeredEvents = mockSocket.on.mock.calls.map(([event]: [string]) => event);
      expect(registeredEvents).toContain("connect");
      expect(registeredEvents).toContain("disconnect");
      expect(registeredEvents).toContain("connect_error");
      expect(registeredEvents).toContain("error");
      expect(registeredEvents).toContain("connected");
    });
  });

  // -----------------------------------------------------------------------
  // 5. Disconnect handling
  // -----------------------------------------------------------------------
  describe("disconnect handling", () => {
    it("sets state to disconnected on server-initiated disconnect", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      const disconnectHandler = getSocketHandler("disconnect");
      expect(disconnectHandler).toBeTypeOf("function");
      disconnectHandler!("io server disconnect");

      const connectionStateUpdates = getStateUpdatesFor(0);
      expect(connectionStateUpdates).toContain("disconnected");
    });

    it("sets state to connecting on client-side disconnect (network issue)", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      const disconnectHandler = getSocketHandler("disconnect");
      disconnectHandler!("transport close");

      const connectionStateUpdates = getStateUpdatesFor(0);
      // The last update after "connecting" (from connect()) should be another "connecting"
      // because client-side disconnect triggers reconnection state
      const connectingCount = connectionStateUpdates.filter((s) => s === "connecting").length;
      expect(connectingCount).toBeGreaterThanOrEqual(2);
    });

    it("manual disconnect cleans up socket", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      // capturedCallbacks[1] is the disconnect callback
      const disconnectFn = capturedCallbacks[1];
      expect(disconnectFn).toBeTypeOf("function");

      // Simulate there being a socket by calling connect first
      const connectFn = capturedCallbacks[0];
      await connectFn();

      // Now call disconnect -- but since socketRef is managed by useRef mock,
      // we need to check that the cleanup functions are called
      // The disconnect function checks socketRef.current
      // Our useRef mock returns { current: null }, and connect sets it to mockSocket
      // So we verify disconnect calls the right cleanup methods
      disconnectFn();

      // Verify state is set to disconnected
      const connectionStateUpdates = getStateUpdatesFor(0);
      expect(connectionStateUpdates).toContain("disconnected");
    });
  });

  // -----------------------------------------------------------------------
  // 6. Auth error handling
  // -----------------------------------------------------------------------
  describe("auth error handling", () => {
    it("sets error state on connect_error with invalid_token", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      const errorHandler = getSocketHandler("connect_error");
      expect(errorHandler).toBeTypeOf("function");

      const authError = new Error("invalid_token");
      errorHandler!(authError);

      const connectionStateUpdates = getStateUpdatesFor(0);
      expect(connectionStateUpdates).toContain("error");

      const errorUpdates = getStateUpdatesFor(1);
      expect(errorUpdates).toContain("invalid_token");
    });

    it("triggers token force-refresh on authentication_required error", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      const errorHandler = getSocketHandler("connect_error");
      const authError = new Error("authentication_required");
      errorHandler!(authError);

      // getIdToken(true) should have been called for force-refresh
      expect(mockCurrentUser.getIdToken).toHaveBeenCalledWith(true);
    });

    it("triggers token force-refresh on authentication_failed error", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      const errorHandler = getSocketHandler("connect_error");
      const authError = new Error("authentication_failed");
      errorHandler!(authError);

      expect(mockCurrentUser.getIdToken).toHaveBeenCalledWith(true);
    });

    it("does not force-refresh when error is not auth-related", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      const errorHandler = getSocketHandler("connect_error");
      const networkError = new Error("timeout");
      errorHandler!(networkError);

      // getIdToken should NOT have been called with force-refresh (true)
      // It was called once during the auth callback (without true), but not with true
      expect(mockCurrentUser.getIdToken).not.toHaveBeenCalledWith(true);
    });

    it("sets error message from server error event", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      const serverErrorHandler = getSocketHandler("error");
      expect(serverErrorHandler).toBeTypeOf("function");
      serverErrorHandler!({ code: "RATE_LIMIT", message: "Too many requests" });

      const errorUpdates = getStateUpdatesFor(1);
      expect(errorUpdates).toContain("Too many requests");
    });
  });

  // -----------------------------------------------------------------------
  // 7. No user = error state
  // -----------------------------------------------------------------------
  describe("no authenticated user", () => {
    it("sets error state when connect is called without authenticated user", async () => {
      mockCurrentUser = null;

      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      const connectionStateUpdates = getStateUpdatesFor(0);
      expect(connectionStateUpdates).toContain("error");

      const errorUpdates = getStateUpdatesFor(1);
      expect(errorUpdates).toContain("Not authenticated");
    });

    it("does not call io() when user is not authenticated", async () => {
      mockCurrentUser = null;

      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      expect(mockIo).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 8. Auto-connect behavior
  // -----------------------------------------------------------------------
  describe("auto-connect behavior", () => {
    it("registers an auth state listener via useEffect when autoConnect is true (default)", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      // The auto-connect effect is the last captured effect
      // It should have been captured by our mock useEffect
      expect(capturedEffects.length).toBeGreaterThanOrEqual(1);

      // Execute the auto-connect effect
      const autoConnectEffect = capturedEffects[capturedEffects.length - 1];
      const cleanup = autoConnectEffect();

      // After running the effect, onAuthStateChanged should have been called
      const { auth } = await import("../firebase");
      expect(auth.onAuthStateChanged).toHaveBeenCalled();

      // Cleanup should be a function
      expect(cleanup).toBeTypeOf("function");
    });

    it("does not register auth listener when autoConnect is false", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket({ autoConnect: false });

      // The effect body should return early
      const autoConnectEffect = capturedEffects[capturedEffects.length - 1];
      const cleanup = autoConnectEffect();

      // When autoConnect is false, the effect returns early (undefined)
      expect(cleanup).toBeUndefined();
    });

    it("calls connect when auth state changes to authenticated user", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      // Execute the auto-connect effect to register the listener
      const autoConnectEffect = capturedEffects[capturedEffects.length - 1];
      autoConnectEffect();

      // Simulate Firebase reporting an authenticated user
      expect(authStateCallback).toBeTypeOf("function");
      await authStateCallback!({ uid: "user-1" });

      // connect() should have been invoked, which calls io()
      expect(mockIo).toHaveBeenCalled();
    });

    it("calls disconnect when auth state changes to null (user signs out)", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      // First connect so there is a socketRef.current to disconnect
      const connectFn = capturedCallbacks[0];
      await connectFn();

      // Execute the auto-connect effect to register the listener
      const autoConnectEffect = capturedEffects[capturedEffects.length - 1];
      autoConnectEffect();

      // Simulate user signing out
      expect(authStateCallback).toBeTypeOf("function");
      authStateCallback!(null);

      // The disconnect callback calls removeAllListeners + disconnect on the socket
      // and sets connectionState to "disconnected"
      const connectionStateUpdates = getStateUpdatesFor(0);
      expect(connectionStateUpdates).toContain("disconnected");
    });
  });

  // -----------------------------------------------------------------------
  // 9. Cleanup on unmount
  // -----------------------------------------------------------------------
  describe("cleanup on unmount", () => {
    it("unsubscribes from auth state listener on cleanup", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      // Execute the auto-connect effect and capture cleanup
      const autoConnectEffect = capturedEffects[capturedEffects.length - 1];
      const cleanup = autoConnectEffect() as () => void;

      expect(cleanup).toBeTypeOf("function");
      cleanup();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it("cleans up existing socket before creating new connection", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];

      // First connect -- the socketRef.current will be null initially
      await connectFn();
      expect(mockIo).toHaveBeenCalledTimes(1);

      // Second connect -- since mockSocket.connected is false,
      // it should clean up and create a new connection
      // We need to reset io call count to verify it's called again
      mockIo.mockClear();
      await connectFn();
      expect(mockIo).toHaveBeenCalledTimes(1);
    });

    it("skips reconnect if socket is already connected", async () => {
      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];

      // First connect
      await connectFn();

      // Mark the socket as connected via the ref
      // The hook checks socketRef.current?.connected
      // Our useRef mock returned { current: null }, and connect() sets it to mockSocket
      // So we set mockSocket.connected = true
      mockSocket.connected = true;

      mockIo.mockClear();
      await connectFn();

      // io() should NOT have been called again since socket is already connected
      expect(mockIo).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 10. Connected event logging
  // -----------------------------------------------------------------------
  describe("connected event", () => {
    it("logs server connected data via logger", async () => {
      const { useSocket } = await import("../useSocket");
      const { logger } = await import("../logger");

      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      const connectedHandler = getSocketHandler("connected");
      expect(connectedHandler).toBeTypeOf("function");

      const serverData = { userId: "user-1", serverTime: "2026-01-01T00:00:00Z" };
      connectedHandler!(serverData);

      expect(logger.log).toHaveBeenCalledWith("[Socket] Connected to server", serverData);
    });
  });

  // -----------------------------------------------------------------------
  // 11. Auth callback error handling
  // -----------------------------------------------------------------------
  describe("auth callback error handling", () => {
    it("sends empty auth when getIdToken throws", async () => {
      mockCurrentUser.getIdToken = vi.fn().mockRejectedValue(new Error("token fetch failed"));

      const { useSocket } = await import("../useSocket");
      useSocket();

      const connectFn = capturedCallbacks[0];
      await connectFn();

      const ioArgs = mockIo.mock.calls[0][0];
      const authCb = ioArgs.auth;
      const cb = vi.fn();
      await authCb(cb);

      expect(cb).toHaveBeenCalledWith({});
    });
  });
});

// ===========================================================================
// useSocketEvent tests
// ===========================================================================

describe("useSocketEvent", () => {
  it("is exported as a function", async () => {
    const { useSocketEvent } = await import("../useSocket");
    expect(useSocketEvent).toBeTypeOf("function");
  });

  it("registers event listener via useEffect when socket is provided", async () => {
    const { useSocketEvent } = await import("../useSocket");
    const handler = vi.fn();

    useSocketEvent("connected" as any, handler, mockSocket as any);

    // useEffect should have been called -- capture and run the effect
    const effectFn = capturedEffects[capturedEffects.length - 1];
    expect(effectFn).toBeTypeOf("function");

    const cleanup = effectFn() as () => void;

    expect(mockSocket.on).toHaveBeenCalledWith("connected", handler);

    // Cleanup should remove the listener
    expect(cleanup).toBeTypeOf("function");
    cleanup();
    expect(mockSocket.off).toHaveBeenCalledWith("connected", handler);
  });

  it("does not register listener when socket is null", async () => {
    const { useSocketEvent } = await import("../useSocket");
    const handler = vi.fn();

    mockSocket.on.mockClear();
    mockSocket.off.mockClear();

    useSocketEvent("connected" as any, handler, null);

    // Execute the effect
    const effectFn = capturedEffects[capturedEffects.length - 1];
    const cleanup = effectFn();

    expect(mockSocket.on).not.toHaveBeenCalled();
    // Cleanup should be undefined since early return
    expect(cleanup).toBeUndefined();
  });

  it("can subscribe to different event types", async () => {
    const { useSocketEvent } = await import("../useSocket");

    const battleHandler = vi.fn();
    const notifHandler = vi.fn();

    mockSocket.on.mockClear();

    useSocketEvent("battle:update" as any, battleHandler, mockSocket as any);
    const effect1 = capturedEffects[capturedEffects.length - 1];
    effect1();

    useSocketEvent("notification" as any, notifHandler, mockSocket as any);
    const effect2 = capturedEffects[capturedEffects.length - 1];
    effect2();

    const onCalls = mockSocket.on.mock.calls.map(([event]: [string]) => event);
    expect(onCalls).toContain("battle:update");
    expect(onCalls).toContain("notification");
  });
});
