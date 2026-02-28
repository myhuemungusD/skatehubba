/**
 * Tests for client/src/lib/api/game/service.ts
 * Covers all gameApi methods — 0% → 100%
 */

const mockApiRequest = vi.fn();
vi.mock("../client", () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
}));

import { gameApi } from "./service";

describe("gameApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest.mockResolvedValue({ ok: true });
  });

  it("createGame calls apiRequest with correct params", async () => {
    await gameApi.createGame("opp-1");
    expect(mockApiRequest).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/games/create",
      body: { opponentId: "opp-1" },
    });
  });

  it("respondToGame calls apiRequest with correct params", async () => {
    await gameApi.respondToGame("game-1", true);
    expect(mockApiRequest).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/games/game-1/respond",
      body: { accept: true },
    });
  });

  it("submitTurn calls apiRequest with all parameters", async () => {
    await gameApi.submitTurn("game-1", "kickflip", "https://vid.mp4", 5000, "https://thumb.jpg");
    expect(mockApiRequest).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/games/game-1/turns",
      body: {
        trickDescription: "kickflip",
        videoUrl: "https://vid.mp4",
        videoDurationMs: 5000,
        thumbnailUrl: "https://thumb.jpg",
      },
    });
  });

  it("submitTurn works without optional thumbnailUrl", async () => {
    await gameApi.submitTurn("game-1", "kickflip", "https://vid.mp4", 5000);
    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ thumbnailUrl: undefined }),
      })
    );
  });

  it("judgeTurn calls apiRequest with correct params", async () => {
    await gameApi.judgeTurn(42, "landed");
    expect(mockApiRequest).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/games/turns/42/judge",
      body: { result: "landed" },
    });
  });

  it("fileDispute calls apiRequest with correct params", async () => {
    await gameApi.fileDispute("game-1", 7);
    expect(mockApiRequest).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/games/game-1/dispute",
      body: { turnId: 7 },
    });
  });

  it("resolveDispute calls apiRequest with correct params", async () => {
    await gameApi.resolveDispute(10, "missed");
    expect(mockApiRequest).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/games/disputes/10/resolve",
      body: { finalResult: "missed" },
    });
  });

  it("forfeitGame calls apiRequest with correct params", async () => {
    await gameApi.forfeitGame("game-1");
    expect(mockApiRequest).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/games/game-1/forfeit",
    });
  });

  it("getMyGames calls apiRequest with correct params", async () => {
    await gameApi.getMyGames();
    expect(mockApiRequest).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/games/my-games",
    });
  });

  it("getGameDetails calls apiRequest with correct params", async () => {
    await gameApi.getGameDetails("game-1");
    expect(mockApiRequest).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/games/game-1",
    });
  });

  it("setterBail calls apiRequest with correct params", async () => {
    await gameApi.setterBail("game-1");
    expect(mockApiRequest).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/games/game-1/setter-bail",
    });
  });

  it("getMyStats calls apiRequest with correct params", async () => {
    await gameApi.getMyStats();
    expect(mockApiRequest).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/games/stats/me",
    });
  });
});
