/**
 * Behavior tests for socket handler rate limiting
 *
 * Verifies that battle socket handlers reject requests
 * with a rate_limited error when the client sends too quickly.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../rooms", () => ({
  joinRoom: vi.fn().mockResolvedValue(undefined),
  leaveRoom: vi.fn().mockResolvedValue(undefined),
  broadcastToRoom: vi.fn(),
  sendToUser: vi.fn(),
  getRoomInfo: vi.fn(),
}));

vi.mock("../../../services/battleService", () => ({
  createBattle: vi.fn(),
  joinBattle: vi.fn(),
  getBattle: vi.fn(),
}));

vi.mock("../../../services/battleStateService", () => ({
  initializeVoting: vi.fn(),
  castVote: vi.fn(),
  generateEventId: vi.fn(() => "evt-rl"),
}));

vi.mock("../../../logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// All rate-limit checks return false (= rejected)
vi.mock("../../socketRateLimit", () => ({
  registerRateLimitRules: vi.fn(),
  checkRateLimit: vi.fn(() => false),
}));

function makeMocks() {
  const eventHandlers = new Map<string, Function>();
  const socket: any = {
    id: "sock-rl",
    data: { odv: "user-rl" },
    on: vi.fn((event: string, handler: Function) => eventHandlers.set(event, handler)),
    emit: vi.fn(),
  };
  const io: any = { to: vi.fn().mockReturnThis(), emit: vi.fn() };
  return { socket, io, eventHandlers };
}

describe("Battle socket handlers — rate limiting", () => {
  let socket: any;
  let io: any;
  let eventHandlers: Map<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ socket, io, eventHandlers } = makeMocks());
  });

  it.each([
    ["battle:create", [{ matchmaking: "open" as const }]],
    ["battle:join", ["battle-1"]],
    ["battle:startVoting", ["battle-1"]],
    ["battle:vote", [{ battleId: "b1", odv: "u1", vote: "clean" as const }]],
    ["battle:ready", ["battle-1"]],
  ] as const)("rejects %s with rate_limited error when throttled", async (event, args) => {
    const { registerBattleHandlers } = await import("../battle");
    registerBattleHandlers(io, socket);

    const handler = eventHandlers.get(event)!;
    await handler(...args);

    expect(socket.emit).toHaveBeenCalledWith("error", {
      code: "rate_limited",
      message: "Too many requests, slow down",
    });
  });
});
