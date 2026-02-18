/**
 * Coverage tests for rate-limit branches in game + battle socket handlers.
 *
 * Mocks checkRateLimit to return false so every handler exercises its
 * "rate_limited" early-exit path.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Shared socket-level mocks
vi.mock("../../rooms", () => ({
  joinRoom: vi.fn().mockResolvedValue(undefined),
  leaveRoom: vi.fn().mockResolvedValue(undefined),
  broadcastToRoom: vi.fn(),
  sendToUser: vi.fn(),
  getRoomInfo: vi.fn(),
}));

vi.mock("../../../services/gameStateService", () => ({
  createGame: vi.fn(),
  joinGame: vi.fn(),
  submitTrick: vi.fn(),
  passTrick: vi.fn(),
  forfeitGame: vi.fn(),
  handleReconnect: vi.fn(),
  handleDisconnect: vi.fn(),
  generateEventId: vi.fn(() => "evt-rl"),
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

// KEY: rate-limiter always rejects
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

describe("Game handlers – rate-limit branches", () => {
  let socket: any;
  let io: any;
  let eventHandlers: Map<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ socket, io, eventHandlers } = makeMocks());
  });

  it.each([
    ["game:create", ["spot-1", 4]],
    ["game:join", ["game-1"]],
    ["game:trick", [{ gameId: "g1", odv: "u1", trickName: "Kickflip" }]],
    ["game:pass", ["game-1"]],
    ["game:forfeit", ["game-1"]],
    ["game:reconnect", ["game-1"]],
  ] as const)("emits rate_limited for %s", async (event, args) => {
    const { registerGameHandlers } = await import("../game");
    registerGameHandlers(io, socket);

    const handler = eventHandlers.get(event)!;
    await handler(...args);

    expect(socket.emit).toHaveBeenCalledWith("error", {
      code: "rate_limited",
      message: "Too many requests, slow down",
    });
  });
});

describe("Battle handlers – rate-limit branches", () => {
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
  ] as const)("emits rate_limited for %s", async (event, args) => {
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
