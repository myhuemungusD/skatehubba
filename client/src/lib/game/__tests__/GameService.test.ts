/**
 * Tests for client/src/lib/game/GameService.ts
 *
 * Covers: helper functions (getLettersString, isGameOver, getOpponentData),
 * auth guards, and Firestore-transaction-based game actions (submitAction,
 * setterMissed, cancelMatchmaking, findQuickMatch, getActiveGames,
 * subscribeToGame, subscribeToQueue).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

// mockAuth must be hoisted so the vi.mock factory can reference it
const mockAuth = vi.hoisted(() => ({
  currentUser: {
    uid: "user-1",
    displayName: "TestSkater",
    photoURL: "https://example.com/photo.jpg",
  } as any,
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: any, name: string) => ({ _path: name })),
  doc: vi.fn((...args: any[]) => {
    // doc(db, collectionName, docId) => specific ref
    if (args.length >= 3 && typeof args[2] === "string") {
      return { id: args[2], _col: args[1] };
    }
    // doc(collectionRef) => auto-generated ref
    return { id: "auto-generated-id", _col: "auto" };
  }),
  runTransaction: vi.fn(),
  query: vi.fn((...args: any[]) => ({ _query: true, args })),
  where: vi.fn((...args: any[]) => ({ _where: true, args })),
  limit: vi.fn((n: number) => ({ _limit: n })),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
  increment: vi.fn((n: number) => ({ _increment: n })),
  Timestamp: { now: vi.fn(() => ({ seconds: 1000, nanoseconds: 0 })) },
}));

vi.mock("../../firebase", () => ({
  db: { _mockDb: true },
  auth: mockAuth,
}));

vi.mock("../../logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
  },
}));

// ── Imports ────────────────────────────────────────────────────────────────

import { runTransaction, getDocs, onSnapshot, doc } from "firebase/firestore";
import { GameService } from "../GameService";
import type { GameState, GameDocument, PlayerData } from "../GameService";

// ── Test helpers ───────────────────────────────────────────────────────────

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    status: "ACTIVE",
    turnPlayerId: "user-1",
    phase: "SETTER_RECORDING",
    p1Letters: 0,
    p2Letters: 0,
    currentTrick: null,
    roundNumber: 1,
    ...overrides,
  };
}

function makeGameDoc(overrides: Partial<GameDocument> = {}): GameDocument {
  return {
    id: "game-123",
    players: ["user-1", "user-2"],
    playerData: {
      "user-1": { username: "TestSkater", stance: "regular" },
      "user-2": { username: "Opponent", stance: "goofy" },
    },
    state: makeGameState(),
    createdAt: { seconds: 1000, nanoseconds: 0 } as any,
    updatedAt: { seconds: 1000, nanoseconds: 0 } as any,
    ...overrides,
  };
}

/** Set up runTransaction to call the callback with a mock transaction object */
function setupTransaction(gameDoc: GameDocument | null) {
  const mockTx = {
    get: vi.fn().mockResolvedValue({
      exists: () => gameDoc !== null,
      id: gameDoc?.id ?? "missing",
      data: () => (gameDoc ? { ...gameDoc, id: undefined } : undefined),
    }),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  vi.mocked(runTransaction).mockImplementation(async (_db: any, callback: any) => {
    return callback(mockTx);
  });

  return mockTx;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GameService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = {
      uid: "user-1",
      displayName: "TestSkater",
      photoURL: "https://example.com/photo.jpg",
    };
  });

  // ──────────────────── Helper: getLettersString ─────────────────────────

  describe("getLettersString", () => {
    it("returns empty string for 0 letters", () => {
      expect(GameService.getLettersString(0)).toBe("");
    });

    it("returns 'S' for 1 letter", () => {
      expect(GameService.getLettersString(1)).toBe("S");
    });

    it("returns 'SK' for 2 letters", () => {
      expect(GameService.getLettersString(2)).toBe("SK");
    });

    it("returns 'SKA' for 3 letters", () => {
      expect(GameService.getLettersString(3)).toBe("SKA");
    });

    it("returns 'SKAT' for 4 letters", () => {
      expect(GameService.getLettersString(4)).toBe("SKAT");
    });

    it("returns 'SKATE' for 5 letters", () => {
      expect(GameService.getLettersString(5)).toBe("SKATE");
    });

    it("caps at 'SKATE' for values > 5", () => {
      expect(GameService.getLettersString(6)).toBe("SKATE");
      expect(GameService.getLettersString(100)).toBe("SKATE");
    });

    it("with negative count, slice(0, -N) trims from end (JS semantics)", () => {
      // Math.min(-1, 5) = -1, LETTERS.slice(0, -1) = ["S","K","A","T"]
      expect(GameService.getLettersString(-1)).toBe("SKAT");
      // Math.min(-2, 5) = -2, LETTERS.slice(0, -2) = ["S","K","A"]
      expect(GameService.getLettersString(-2)).toBe("SKA");
    });
  });

  // ──────────────────── Helper: isGameOver ───────────────────────────────

  describe("isGameOver", () => {
    it("returns true when status is COMPLETED", () => {
      expect(GameService.isGameOver(makeGameState({ status: "COMPLETED" }))).toBe(true);
    });

    it("returns true when p1Letters >= 5", () => {
      expect(GameService.isGameOver(makeGameState({ p1Letters: 5 }))).toBe(true);
      expect(GameService.isGameOver(makeGameState({ p1Letters: 6 }))).toBe(true);
    });

    it("returns true when p2Letters >= 5", () => {
      expect(GameService.isGameOver(makeGameState({ p2Letters: 5 }))).toBe(true);
    });

    it("returns false when game is active with < 5 letters each", () => {
      expect(GameService.isGameOver(makeGameState({ p1Letters: 4, p2Letters: 3 }))).toBe(false);
    });

    it("returns false when game is active with 0 letters", () => {
      expect(GameService.isGameOver(makeGameState())).toBe(false);
    });

    it("returns true for COMPLETED even with 0 letters", () => {
      expect(
        GameService.isGameOver(makeGameState({ status: "COMPLETED", p1Letters: 0, p2Letters: 0 }))
      ).toBe(true);
    });
  });

  // ──────────────────── Helper: getOpponentData ─────────────────────────

  describe("getOpponentData", () => {
    it("returns opponent data for player 1", () => {
      const game = makeGameDoc();
      const opponent = GameService.getOpponentData(game, "user-1");

      expect(opponent).toEqual({ username: "Opponent", stance: "goofy" });
    });

    it("returns opponent data for player 2", () => {
      const game = makeGameDoc();
      const opponent = GameService.getOpponentData(game, "user-2");

      expect(opponent).toEqual({ username: "TestSkater", stance: "regular" });
    });

    it("returns first non-matching player's data for unknown userId (find semantics)", () => {
      // players.find(p => p !== "user-99") returns "user-1" (first element that isn't "user-99")
      const game = makeGameDoc();
      const opponent = GameService.getOpponentData(game, "user-99");

      expect(opponent).toEqual({ username: "TestSkater", stance: "regular" });
    });

    it("returns null when game has a single-player array matching userId", () => {
      const game = makeGameDoc({ players: ["user-1"] });
      const opponent = GameService.getOpponentData(game, "user-1");

      expect(opponent).toBeNull();
    });
  });

  // ──────────────────── submitAction — auth & validation ─────────────────

  describe("submitAction", () => {
    it("throws when user is not logged in", async () => {
      mockAuth.currentUser = null;

      await expect(
        GameService.submitAction("game-1", "SET", { trickName: "kickflip" })
      ).rejects.toThrow("Unauthorized");
    });

    it("throws when game is not found", async () => {
      setupTransaction(null);

      await expect(
        GameService.submitAction("missing-game", "SET", { trickName: "kickflip" })
      ).rejects.toThrow("Game not found");
    });

    it("throws when game is not active", async () => {
      setupTransaction(makeGameDoc({ state: makeGameState({ status: "COMPLETED" }) }));

      await expect(
        GameService.submitAction("game-123", "SET", { trickName: "kickflip" })
      ).rejects.toThrow("Game is not active");
    });

    it("throws when player is not in the game", async () => {
      setupTransaction(makeGameDoc({ players: ["other-1", "other-2"] }));

      await expect(
        GameService.submitAction("game-123", "SET", { trickName: "kickflip" })
      ).rejects.toThrow("You are not in this game");
    });

    // ── SET action ──────────────────────────────────────────────────────

    describe("SET action", () => {
      it("transitions from SETTER_RECORDING to DEFENDER_ATTEMPTING", async () => {
        const mockTx = setupTransaction(makeGameDoc());

        await GameService.submitAction("game-123", "SET", { trickName: "kickflip" });

        expect(mockTx.update).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            "state.phase": "DEFENDER_ATTEMPTING",
            "state.currentTrick": expect.objectContaining({
              name: "kickflip",
              setterId: "user-1",
            }),
          })
        );
      });

      it("throws when not in SETTER_RECORDING phase", async () => {
        setupTransaction(makeGameDoc({ state: makeGameState({ phase: "DEFENDER_ATTEMPTING" }) }));

        await expect(
          GameService.submitAction("game-123", "SET", { trickName: "kickflip" })
        ).rejects.toThrow("Not in setting phase");
      });

      it("throws when it is not the setter's turn", async () => {
        setupTransaction(makeGameDoc({ state: makeGameState({ turnPlayerId: "user-2" }) }));

        await expect(
          GameService.submitAction("game-123", "SET", { trickName: "kickflip" })
        ).rejects.toThrow("Not your turn to set");
      });

      it("throws when trick name is missing", async () => {
        setupTransaction(makeGameDoc());

        await expect(GameService.submitAction("game-123", "SET", {})).rejects.toThrow(
          "Trick name required"
        );
      });

      it("throws when payload is undefined", async () => {
        setupTransaction(makeGameDoc());

        await expect(GameService.submitAction("game-123", "SET")).rejects.toThrow(
          "Trick name required"
        );
      });

      it("includes optional trick description", async () => {
        const mockTx = setupTransaction(makeGameDoc());

        await GameService.submitAction("game-123", "SET", {
          trickName: "heelflip",
          trickDescription: "Clean catch",
        });

        expect(mockTx.update).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            "state.currentTrick": expect.objectContaining({
              name: "heelflip",
              description: "Clean catch",
            }),
          })
        );
      });
    });

    // ── LAND action ─────────────────────────────────────────────────────

    describe("LAND action", () => {
      it("transitions back to SETTER_RECORDING and clears trick", async () => {
        const mockTx = setupTransaction(
          makeGameDoc({
            state: makeGameState({
              phase: "DEFENDER_ATTEMPTING",
              turnPlayerId: "user-1",
              currentTrick: {
                name: "kickflip",
                setterId: "user-1",
                setAt: { seconds: 1000, nanoseconds: 0 } as any,
              },
            }),
          })
        );

        // user-2 is the defender (not the turnPlayer / setter)
        mockAuth.currentUser = { uid: "user-2", displayName: "Opponent", photoURL: null };

        await GameService.submitAction("game-123", "LAND");

        expect(mockTx.update).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            "state.phase": "SETTER_RECORDING",
            "state.currentTrick": null,
          })
        );
      });

      it("throws when not in DEFENDER_ATTEMPTING phase", async () => {
        setupTransaction(makeGameDoc());

        await expect(GameService.submitAction("game-123", "LAND")).rejects.toThrow(
          "Not in defending phase"
        );
      });

      it("throws when the setter tries to LAND (only defender can)", async () => {
        setupTransaction(
          makeGameDoc({
            state: makeGameState({
              phase: "DEFENDER_ATTEMPTING",
              turnPlayerId: "user-1", // user-1 is setter
            }),
          })
        );

        // user-1 is both current user and setter -- should fail
        await expect(GameService.submitAction("game-123", "LAND")).rejects.toThrow(
          "Defender must attempt, not setter"
        );
      });
    });

    // ── BAIL action ─────────────────────────────────────────────────────

    describe("BAIL action", () => {
      it("assigns a letter to the defender (non-game-ending)", async () => {
        const mockTx = setupTransaction(
          makeGameDoc({
            state: makeGameState({
              phase: "DEFENDER_ATTEMPTING",
              turnPlayerId: "user-1",
              p2Letters: 2, // defender (user-2) has 2 letters
            }),
          })
        );

        mockAuth.currentUser = { uid: "user-2", displayName: "Opponent", photoURL: null };

        await GameService.submitAction("game-123", "BAIL");

        expect(mockTx.update).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            "state.phase": "SETTER_RECORDING",
            "state.currentTrick": null,
          })
        );
      });

      it("ends the game when defender reaches 5 letters (SKATE)", async () => {
        const mockTx = setupTransaction(
          makeGameDoc({
            state: makeGameState({
              phase: "DEFENDER_ATTEMPTING",
              turnPlayerId: "user-1",
              p2Letters: 4, // defender (user-2) has 4 letters, bail = game over
            }),
          })
        );

        mockAuth.currentUser = { uid: "user-2", displayName: "Opponent", photoURL: null };

        await GameService.submitAction("game-123", "BAIL");

        expect(mockTx.update).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            "state.status": "COMPLETED",
            "state.phase": "VERIFICATION",
            winnerId: "user-1", // setter wins
          })
        );
      });

      it("throws when not in DEFENDER_ATTEMPTING phase", async () => {
        setupTransaction(makeGameDoc());

        await expect(GameService.submitAction("game-123", "BAIL")).rejects.toThrow(
          "Not in defending phase"
        );
      });

      it("assigns a letter to player1 when player1 is the defender (isPlayer1 branch)", async () => {
        // user-1 is player1 AND the defender (not the setter)
        // turnPlayerId=user-2 means user-2 is setter, user-1 is defender
        const mockTx = setupTransaction(
          makeGameDoc({
            state: makeGameState({
              phase: "DEFENDER_ATTEMPTING",
              turnPlayerId: "user-2", // user-2 is setter
              p1Letters: 2, // player1 (user-1) is defender with 2 letters
            }),
          })
        );

        // user-1 is current user and player1 (defender)
        mockAuth.currentUser = { uid: "user-1", displayName: "TestSkater", photoURL: null };

        await GameService.submitAction("game-123", "BAIL");

        expect(mockTx.update).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            "state.p1Letters": expect.objectContaining({ _increment: 1 }),
            "state.phase": "SETTER_RECORDING",
            "state.currentTrick": null,
          })
        );
      });

      it("ends the game when player1 (defender) reaches 5 letters", async () => {
        const mockTx = setupTransaction(
          makeGameDoc({
            state: makeGameState({
              phase: "DEFENDER_ATTEMPTING",
              turnPlayerId: "user-2", // user-2 is setter
              p1Letters: 4, // player1 (user-1) has 4 letters, bail = game over
            }),
          })
        );

        // user-1 is current user and player1 (defender)
        mockAuth.currentUser = { uid: "user-1", displayName: "TestSkater", photoURL: null };

        await GameService.submitAction("game-123", "BAIL");

        expect(mockTx.update).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            "state.status": "COMPLETED",
            "state.phase": "VERIFICATION",
            "state.p1Letters": 5,
            winnerId: "user-2", // setter wins
          })
        );
      });

      it("throws when the setter tries to BAIL", async () => {
        setupTransaction(
          makeGameDoc({
            state: makeGameState({
              phase: "DEFENDER_ATTEMPTING",
              turnPlayerId: "user-1",
            }),
          })
        );

        await expect(GameService.submitAction("game-123", "BAIL")).rejects.toThrow(
          "Defender must bail, not setter"
        );
      });
    });

    // ── FORFEIT action ──────────────────────────────────────────────────

    describe("FORFEIT action", () => {
      it("cancels the game and awards win to the opponent", async () => {
        const mockTx = setupTransaction(makeGameDoc());

        await GameService.submitAction("game-123", "FORFEIT");

        expect(mockTx.update).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            "state.status": "CANCELLED",
            "state.currentTrick": null,
            winnerId: "user-2", // opponent wins
          })
        );
      });

      it("works for player 2 forfeiting (player 1 wins)", async () => {
        const mockTx = setupTransaction(makeGameDoc());
        mockAuth.currentUser = { uid: "user-2", displayName: "Opponent", photoURL: null };

        await GameService.submitAction("game-123", "FORFEIT");

        expect(mockTx.update).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            winnerId: "user-1",
          })
        );
      });
    });
  });

  // ──────────────────── setterMissed ─────────────────────────────────────

  describe("setterMissed", () => {
    it("throws when user is not logged in", async () => {
      mockAuth.currentUser = null;

      await expect(GameService.setterMissed("game-123")).rejects.toThrow("Unauthorized");
    });

    it("throws when game is not found", async () => {
      setupTransaction(null);

      await expect(GameService.setterMissed("missing")).rejects.toThrow("Game not found");
    });

    it("throws when game is not active", async () => {
      setupTransaction(makeGameDoc({ state: makeGameState({ status: "COMPLETED" }) }));

      await expect(GameService.setterMissed("game-123")).rejects.toThrow("Game is not active");
    });

    it("throws when called by non-setter", async () => {
      setupTransaction(makeGameDoc({ state: makeGameState({ turnPlayerId: "user-2" }) }));

      await expect(GameService.setterMissed("game-123")).rejects.toThrow(
        "Only setter can declare a miss"
      );
    });

    it("throws when not in DEFENDER_ATTEMPTING phase", async () => {
      setupTransaction(
        makeGameDoc({
          state: makeGameState({
            turnPlayerId: "user-1",
            phase: "SETTER_RECORDING",
          }),
        })
      );

      await expect(GameService.setterMissed("game-123")).rejects.toThrow(
        "Can only miss during defend phase"
      );
    });

    it("swaps turn to player1 when player2 is the setter (line 442 else branch)", async () => {
      mockAuth.currentUser = { uid: "user-2", displayName: "Opponent", photoURL: null };

      const mockTx = setupTransaction(
        makeGameDoc({
          state: makeGameState({
            turnPlayerId: "user-2",
            phase: "DEFENDER_ATTEMPTING",
          }),
        })
      );

      await GameService.setterMissed("game-123");

      // players[0] is "user-1", players[0] === "user-2" is false,
      // so opponentId = players[0] = "user-1"
      expect(mockTx.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          "state.turnPlayerId": "user-1",
          "state.phase": "SETTER_RECORDING",
          "state.currentTrick": null,
        })
      );
    });

    it("swaps turn to opponent and resets to SETTER_RECORDING", async () => {
      const mockTx = setupTransaction(
        makeGameDoc({
          state: makeGameState({
            turnPlayerId: "user-1",
            phase: "DEFENDER_ATTEMPTING",
          }),
        })
      );

      await GameService.setterMissed("game-123");

      expect(mockTx.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          "state.turnPlayerId": "user-2",
          "state.phase": "SETTER_RECORDING",
          "state.currentTrick": null,
        })
      );
    });
  });

  // ──────────────────── cancelMatchmaking ────────────────────────────────

  describe("cancelMatchmaking", () => {
    it("throws when user is not logged in", async () => {
      mockAuth.currentUser = null;

      await expect(GameService.cancelMatchmaking("q-1")).rejects.toThrow("Must be logged in");
    });

    it("does nothing if queue entry does not exist", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: () => false }),
        delete: vi.fn(),
      };
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => cb(mockTx));

      await GameService.cancelMatchmaking("q-1");

      expect(mockTx.delete).not.toHaveBeenCalled();
    });

    it("throws when trying to cancel another player's queue entry", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ createdBy: "other-user", status: "WAITING" }),
        }),
        delete: vi.fn(),
      };
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => cb(mockTx));

      await expect(GameService.cancelMatchmaking("q-1")).rejects.toThrow(
        "Cannot cancel another player's queue"
      );
    });

    it("deletes the queue entry for the owning player", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ createdBy: "user-1", status: "WAITING" }),
        }),
        delete: vi.fn(),
      };
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => cb(mockTx));

      await GameService.cancelMatchmaking("q-1");

      expect(mockTx.delete).toHaveBeenCalled();
    });
  });

  // ──────────────────── findQuickMatch ────────────────────────────────────

  describe("findQuickMatch", () => {
    it("throws when user is not logged in", async () => {
      mockAuth.currentUser = null;

      await expect(GameService.findQuickMatch()).rejects.toThrow("Must be logged in to play");
    });

    it("creates a queue entry when no match is found", async () => {
      vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any);

      const mockTx = {
        set: vi.fn(),
      };
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => cb(mockTx));

      const result = await GameService.findQuickMatch("goofy");

      expect(result.isWaiting).toBe(true);
      expect(result.gameId).toBeDefined();
      expect(mockTx.set).toHaveBeenCalledTimes(1);
    });

    it("joins existing match when a valid queue entry exists", async () => {
      vi.mocked(getDocs).mockResolvedValue({
        docs: [
          {
            data: () => ({
              createdBy: "other-player",
              creatorName: "OtherSkater",
              creatorPhoto: null,
              stance: "regular",
              status: "WAITING",
            }),
            ref: { id: "queue-entry-1" },
          },
        ],
      } as any);

      const mockTx = {
        set: vi.fn(),
        delete: vi.fn(),
      };
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => cb(mockTx));

      const result = await GameService.findQuickMatch("goofy");

      expect(result.isWaiting).toBe(false);
      expect(result.gameId).toBeDefined();
      // Should create a game and delete the queue entry
      expect(mockTx.set).toHaveBeenCalledTimes(1);
      expect(mockTx.delete).toHaveBeenCalledTimes(1);
    });

    it("skips queue entries created by the current user", async () => {
      vi.mocked(getDocs).mockResolvedValue({
        docs: [
          {
            data: () => ({ createdBy: "user-1" }), // same user
            ref: { id: "queue-1" },
          },
        ],
      } as any);

      const mockTx = { set: vi.fn() };
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => cb(mockTx));

      const result = await GameService.findQuickMatch();

      // Should create a new queue entry since no valid match was found
      expect(result.isWaiting).toBe(true);
    });
  });

  // ──────────────────── getActiveGames ────────────────────────────────────

  describe("getActiveGames", () => {
    it("returns empty array when user is not logged in", async () => {
      mockAuth.currentUser = null;

      const games = await GameService.getActiveGames();

      expect(games).toEqual([]);
    });

    it("returns active games for logged-in user", async () => {
      const mockGameData = {
        players: ["user-1", "user-2"],
        state: makeGameState(),
      };

      vi.mocked(getDocs).mockResolvedValue({
        docs: [
          { id: "game-1", data: () => mockGameData },
          { id: "game-2", data: () => mockGameData },
        ],
      } as any);

      const games = await GameService.getActiveGames();

      expect(games).toHaveLength(2);
      expect(games[0].id).toBe("game-1");
      expect(games[1].id).toBe("game-2");
    });
  });

  // ──────────────────── subscribeToGame ───────────────────────────────────

  describe("subscribeToGame", () => {
    it("calls onSnapshot and returns an unsubscribe function", () => {
      const mockUnsubscribe = vi.fn();
      vi.mocked(onSnapshot).mockReturnValue(mockUnsubscribe);

      const callback = vi.fn();
      const unsub = GameService.subscribeToGame("game-123", callback);

      expect(onSnapshot).toHaveBeenCalled();
      expect(unsub).toBe(mockUnsubscribe);
    });

    it("passes game data to callback when snapshot exists", () => {
      vi.mocked(onSnapshot).mockImplementation((_ref: any, onNext: any) => {
        onNext({
          exists: () => true,
          id: "game-123",
          data: () => ({ players: ["user-1", "user-2"], state: makeGameState() }),
        });
        return vi.fn();
      });

      const callback = vi.fn();
      GameService.subscribeToGame("game-123", callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "game-123",
          players: ["user-1", "user-2"],
        })
      );
    });

    it("passes null to callback when snapshot does not exist", () => {
      vi.mocked(onSnapshot).mockImplementation((_ref: any, onNext: any) => {
        onNext({ exists: () => false });
        return vi.fn();
      });

      const callback = vi.fn();
      GameService.subscribeToGame("game-123", callback);

      expect(callback).toHaveBeenCalledWith(null);
    });

    it("passes null to callback on error", () => {
      vi.mocked(onSnapshot).mockImplementation((_ref: any, _onNext: any, onError: any) => {
        onError(new Error("Firestore error"));
        return vi.fn();
      });

      const callback = vi.fn();
      GameService.subscribeToGame("game-123", callback);

      expect(callback).toHaveBeenCalledWith(null);
    });
  });

  // ──────────────────── subscribeToQueue ──────────────────────────────────

  describe("subscribeToQueue", () => {
    it("calls onSnapshot and returns an unsubscribe function", () => {
      const mockUnsubscribe = vi.fn();
      vi.mocked(onSnapshot).mockReturnValue(mockUnsubscribe);

      const onMatch = vi.fn();
      const unsub = GameService.subscribeToQueue("q-1", onMatch);

      expect(onSnapshot).toHaveBeenCalled();
      expect(unsub).toBe(mockUnsubscribe);
    });

    it("calls onMatch with gameId when queue entry is deleted and game is found", async () => {
      // Set up onSnapshot to capture the callback and call it with a non-existing snapshot
      vi.mocked(onSnapshot).mockImplementation((_ref: any, callback: any) => {
        // Simulate queue entry being deleted (matched)
        callback({ exists: () => false });
        return vi.fn();
      });

      // Mock getDocs to return a matching game
      vi.mocked(getDocs).mockResolvedValue({
        empty: false,
        docs: [{ id: "matched-game-123" }],
      } as any);

      const onMatch = vi.fn();
      GameService.subscribeToQueue("q-1", onMatch);

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(onMatch).toHaveBeenCalledWith("matched-game-123");
    });

    it("does not call onMatch when queue entry is deleted but no game found", async () => {
      vi.mocked(onSnapshot).mockImplementation((_ref: any, callback: any) => {
        callback({ exists: () => false });
        return vi.fn();
      });

      // Mock getDocs to return empty results
      vi.mocked(getDocs).mockResolvedValue({
        empty: true,
        docs: [],
      } as any);

      const onMatch = vi.fn();
      GameService.subscribeToQueue("q-1", onMatch);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(onMatch).not.toHaveBeenCalled();
    });

    it("does not query games when queue entry is deleted and user is not authenticated", async () => {
      mockAuth.currentUser = null;

      vi.mocked(onSnapshot).mockImplementation((_ref: any, callback: any) => {
        callback({ exists: () => false });
        return vi.fn();
      });

      const onMatch = vi.fn();
      GameService.subscribeToQueue("q-1", onMatch);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // getDocs should not have been called because user is null
      expect(getDocs).not.toHaveBeenCalled();
      expect(onMatch).not.toHaveBeenCalled();
    });

    it("does nothing when queue entry still exists (not yet matched)", async () => {
      vi.mocked(onSnapshot).mockImplementation((_ref: any, callback: any) => {
        callback({ exists: () => true });
        return vi.fn();
      });

      const onMatch = vi.fn();
      GameService.subscribeToQueue("q-1", onMatch);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not query for games or call onMatch
      expect(getDocs).not.toHaveBeenCalled();
      expect(onMatch).not.toHaveBeenCalled();
    });
  });
});
