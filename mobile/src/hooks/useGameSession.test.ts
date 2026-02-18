import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { Timestamp } from "firebase/firestore";

// Mock firebase modules
vi.mock("@/lib/firebase.config", () => ({
  auth: { currentUser: null },
  db: {},
  storage: {},
  functions: {},
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  Timestamp: class MockTimestamp {
    seconds: number;
    nanoseconds: number;
    constructor(seconds: number, nanoseconds: number) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
    toDate() {
      return new Date(this.seconds * 1000);
    }
    static now() {
      return new MockTimestamp(Math.floor(Date.now() / 1000), 0);
    }
  },
}));

vi.mock("firebase/storage", () => ({
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(),
}));

vi.mock("react-native-flash-message", () => ({
  showMessage: vi.fn(),
}));

vi.mock("@/store/gameStore", () => ({
  useGameStore: vi.fn(() => ({
    setUploadProgress: vi.fn(),
    setUploadStatus: vi.fn(),
    clearUpload: vi.fn(),
  })),
}));

// Re-create the Zod schemas and parseGameSession locally to test them
// since they're not exported from the module.
// This tests the validation logic in isolation.

const SkateLetterSchema = z.enum(["S", "K", "A", "T", "E"]);

const MoveResultSchema = z.enum(["landed", "bailed", "pending"]);

const JudgmentVotesSchema = z.object({
  attackerVote: z.enum(["landed", "bailed"]).nullable(),
  defenderVote: z.enum(["landed", "bailed"]).nullable(),
});

const MoveSchema = z.object({
  id: z.string(),
  roundNumber: z.number(),
  playerId: z.string(),
  type: z.enum(["set", "match"]),
  trickName: z.string().nullable(),
  clipUrl: z.string(),
  storagePath: z.string().nullable().optional().default(null),
  thumbnailUrl: z.string().nullable(),
  durationSec: z.number().default(15),
  result: MoveResultSchema.default("pending"),
  judgmentVotes: JudgmentVotesSchema.optional(),
  createdAt: z.union([
    z.date(),
    z.string().transform((s) => new Date(s)),
    z
      .custom<InstanceType<typeof Timestamp>>((v) => v instanceof Timestamp)
      .transform((t) => t.toDate()),
  ]),
});

const TurnPhaseSchema = z.enum([
  "attacker_recording",
  "defender_recording",
  "judging",
  "round_complete",
]);

const GameSessionStatusSchema = z.enum(["waiting", "active", "completed", "abandoned"]);

const timestampOrDate = z.union([
  z.date(),
  z.string().transform((s) => new Date(s)),
  z
    .custom<InstanceType<typeof Timestamp>>((v) => v instanceof Timestamp)
    .transform((t) => t.toDate()),
]);

const nullableTimestampOrDate = z
  .union([z.null(), z.undefined(), timestampOrDate])
  .transform((v) => v ?? null);

const GameSessionSchema = z.object({
  player1Id: z.string(),
  player2Id: z.string(),
  player1DisplayName: z.string().default("Player 1"),
  player2DisplayName: z.string().default("Player 2"),
  player1PhotoURL: z.string().nullable().default(null),
  player2PhotoURL: z.string().nullable().default(null),
  player1Letters: z.array(SkateLetterSchema).default([]),
  player2Letters: z.array(SkateLetterSchema).default([]),
  currentTurn: z.string(),
  currentAttacker: z.string().optional(),
  turnPhase: TurnPhaseSchema.default("attacker_recording"),
  roundNumber: z.number().default(1),
  status: GameSessionStatusSchema,
  winnerId: z.string().nullable().default(null),
  moves: z.array(MoveSchema).default([]),
  currentSetMove: MoveSchema.nullable().optional().default(null),
  createdAt: timestampOrDate,
  updatedAt: nullableTimestampOrDate.optional().default(null),
  completedAt: nullableTimestampOrDate.optional().default(null),
  voteDeadline: nullableTimestampOrDate.optional().default(null),
  voteReminderSent: z.boolean().nullable().optional().default(null),
  voteTimeoutOccurred: z.boolean().nullable().optional().default(null),
});

describe("useGameSession - Zod validation schemas", () => {
  describe("SkateLetterSchema", () => {
    it("accepts valid letters", () => {
      expect(SkateLetterSchema.parse("S")).toBe("S");
      expect(SkateLetterSchema.parse("K")).toBe("K");
      expect(SkateLetterSchema.parse("A")).toBe("A");
      expect(SkateLetterSchema.parse("T")).toBe("T");
      expect(SkateLetterSchema.parse("E")).toBe("E");
    });

    it("rejects invalid letters", () => {
      expect(() => SkateLetterSchema.parse("X")).toThrow();
      expect(() => SkateLetterSchema.parse("")).toThrow();
      expect(() => SkateLetterSchema.parse(1)).toThrow();
    });
  });

  describe("MoveResultSchema", () => {
    it("accepts valid results", () => {
      expect(MoveResultSchema.parse("landed")).toBe("landed");
      expect(MoveResultSchema.parse("bailed")).toBe("bailed");
      expect(MoveResultSchema.parse("pending")).toBe("pending");
    });

    it("rejects invalid results", () => {
      expect(() => MoveResultSchema.parse("invalid")).toThrow();
    });
  });

  describe("TurnPhaseSchema", () => {
    it("accepts all valid phases", () => {
      expect(TurnPhaseSchema.parse("attacker_recording")).toBe("attacker_recording");
      expect(TurnPhaseSchema.parse("defender_recording")).toBe("defender_recording");
      expect(TurnPhaseSchema.parse("judging")).toBe("judging");
      expect(TurnPhaseSchema.parse("round_complete")).toBe("round_complete");
    });
  });

  describe("MoveSchema", () => {
    const validMove = {
      id: "move-1",
      roundNumber: 1,
      playerId: "user-123",
      type: "set",
      trickName: "Kickflip",
      clipUrl: "https://storage.example.com/clip.mp4",
      thumbnailUrl: null,
      createdAt: "2025-01-15T12:00:00Z",
    };

    it("parses a valid move", () => {
      const result = MoveSchema.parse(validMove);
      expect(result.id).toBe("move-1");
      expect(result.result).toBe("pending"); // default
      expect(result.durationSec).toBe(15); // default
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it("applies default values", () => {
      const result = MoveSchema.parse(validMove);
      expect(result.durationSec).toBe(15);
      expect(result.result).toBe("pending");
    });

    it("parses Date objects", () => {
      const result = MoveSchema.parse({
        ...validMove,
        createdAt: new Date("2025-01-15T12:00:00Z"),
      });
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it("parses Timestamp objects", () => {
      const ts = new Timestamp(1705320000, 0);
      const result = MoveSchema.parse({
        ...validMove,
        createdAt: ts,
      });
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it("parses optional judgmentVotes", () => {
      const result = MoveSchema.parse({
        ...validMove,
        judgmentVotes: {
          attackerVote: "landed",
          defenderVote: null,
        },
      });
      expect(result.judgmentVotes?.attackerVote).toBe("landed");
      expect(result.judgmentVotes?.defenderVote).toBeNull();
    });

    it("rejects missing required fields", () => {
      expect(() => MoveSchema.parse({ id: "move-1" })).toThrow();
    });

    it("defaults storagePath to null for legacy moves", () => {
      const result = MoveSchema.parse(validMove);
      expect(result.storagePath).toBeNull();
    });

    it("parses move with storagePath", () => {
      const result = MoveSchema.parse({
        ...validMove,
        storagePath: "videos/user-123/game-abc/round_1/uuid.mp4",
      });
      expect(result.storagePath).toBe("videos/user-123/game-abc/round_1/uuid.mp4");
    });

    it("accepts explicit null storagePath", () => {
      const result = MoveSchema.parse({
        ...validMove,
        storagePath: null,
      });
      expect(result.storagePath).toBeNull();
    });

    it("handles move with empty-string clipUrl and valid storagePath", () => {
      const result = MoveSchema.parse({
        ...validMove,
        clipUrl: "",
        storagePath: "videos/user-123/game-abc/round_1/uuid.mp4",
      });
      expect(result.clipUrl).toBe("");
      expect(result.storagePath).toBe("videos/user-123/game-abc/round_1/uuid.mp4");
    });
  });

  describe("GameSessionSchema", () => {
    const validSession = {
      player1Id: "user-1",
      player2Id: "user-2",
      currentTurn: "user-1",
      status: "active",
      createdAt: "2025-01-15T12:00:00Z",
    };

    it("parses a minimal valid session", () => {
      const result = GameSessionSchema.parse(validSession);

      expect(result.player1Id).toBe("user-1");
      expect(result.player2Id).toBe("user-2");
      expect(result.player1DisplayName).toBe("Player 1");
      expect(result.player2DisplayName).toBe("Player 2");
      expect(result.player1Letters).toEqual([]);
      expect(result.player2Letters).toEqual([]);
      expect(result.turnPhase).toBe("attacker_recording");
      expect(result.roundNumber).toBe(1);
      expect(result.winnerId).toBeNull();
      expect(result.moves).toEqual([]);
      expect(result.currentSetMove).toBeNull();
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it("parses a full session with letters and moves", () => {
      const fullSession = {
        ...validSession,
        player1Letters: ["S", "K"],
        player2Letters: ["S"],
        turnPhase: "judging",
        roundNumber: 3,
        currentAttacker: "user-1",
        moves: [
          {
            id: "move-1",
            roundNumber: 1,
            playerId: "user-1",
            type: "set",
            trickName: "Kickflip",
            clipUrl: "https://example.com/clip.mp4",
            thumbnailUrl: null,
            createdAt: "2025-01-15T12:01:00Z",
          },
        ],
      };

      const result = GameSessionSchema.parse(fullSession);
      expect(result.player1Letters).toEqual(["S", "K"]);
      expect(result.moves).toHaveLength(1);
      expect(result.moves[0].trickName).toBe("Kickflip");
      expect(result.moves[0].storagePath).toBeNull(); // Legacy move defaults to null
    });

    it("parses session with moves containing storagePath", () => {
      const session = {
        ...validSession,
        moves: [
          {
            id: "move-new",
            roundNumber: 1,
            playerId: "user-1",
            type: "set",
            trickName: "Heelflip",
            clipUrl: "",
            storagePath: "videos/user-1/game-abc/round_1/uuid.mp4",
            thumbnailUrl: null,
            createdAt: "2025-01-15T12:01:00Z",
          },
        ],
        currentSetMove: {
          id: "move-new",
          roundNumber: 1,
          playerId: "user-1",
          type: "set",
          trickName: "Heelflip",
          clipUrl: "",
          storagePath: "videos/user-1/game-abc/round_1/uuid.mp4",
          thumbnailUrl: null,
          createdAt: "2025-01-15T12:01:00Z",
        },
      };

      const result = GameSessionSchema.parse(session);
      expect(result.moves[0].storagePath).toBe("videos/user-1/game-abc/round_1/uuid.mp4");
      expect(result.moves[0].clipUrl).toBe("");
      expect(result.currentSetMove?.storagePath).toBe("videos/user-1/game-abc/round_1/uuid.mp4");
    });

    it("parses all game statuses", () => {
      for (const status of ["waiting", "active", "completed", "abandoned"]) {
        const result = GameSessionSchema.parse({ ...validSession, status });
        expect(result.status).toBe(status);
      }
    });

    it("handles nullable timestamp fields", () => {
      const result = GameSessionSchema.parse({
        ...validSession,
        updatedAt: null,
        completedAt: null,
        voteDeadline: null,
      });

      expect(result.updatedAt).toBeNull();
      expect(result.completedAt).toBeNull();
      expect(result.voteDeadline).toBeNull();
    });

    it("handles undefined timestamp fields with defaults", () => {
      const result = GameSessionSchema.parse(validSession);

      expect(result.updatedAt).toBeNull();
      expect(result.completedAt).toBeNull();
    });

    it("rejects invalid status", () => {
      expect(() => GameSessionSchema.parse({ ...validSession, status: "invalid" })).toThrow();
    });

    it("rejects invalid letters", () => {
      expect(() =>
        GameSessionSchema.parse({
          ...validSession,
          player1Letters: ["X"],
        })
      ).toThrow();
    });

    it("rejects missing required fields", () => {
      expect(() => GameSessionSchema.parse({})).toThrow();
      expect(() => GameSessionSchema.parse({ player1Id: "user-1" })).toThrow();
    });

    it("parses completed game with winnerId", () => {
      const result = GameSessionSchema.parse({
        ...validSession,
        status: "completed",
        winnerId: "user-1",
        completedAt: "2025-01-15T13:00:00Z",
      });

      expect(result.winnerId).toBe("user-1");
      expect(result.completedAt).toBeInstanceOf(Date);
    });

    it("parses vote timeout fields", () => {
      const result = GameSessionSchema.parse({
        ...validSession,
        voteDeadline: "2025-01-15T12:01:00Z",
        voteReminderSent: true,
        voteTimeoutOccurred: false,
      });

      expect(result.voteDeadline).toBeInstanceOf(Date);
      expect(result.voteReminderSent).toBe(true);
      expect(result.voteTimeoutOccurred).toBe(false);
    });
  });
});
