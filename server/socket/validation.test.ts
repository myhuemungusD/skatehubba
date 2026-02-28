import {
  battleCreateSchema,
  battleVoteSchema,
  gameCreateSchema,
  gameTrickSchema,
  roomJoinSchema,
  presenceUpdateSchema,
  validateEvent,
  sanitizeString,
} from "./validation";

describe("battleCreateSchema", () => {
  it("accepts valid open matchmaking", () => {
    const result = battleCreateSchema.safeParse({
      creatorId: "user1",
      matchmaking: "open",
    });
    expect(result.success).toBe(true);
  });

  it("accepts direct matchmaking with opponentId", () => {
    const result = battleCreateSchema.safeParse({
      creatorId: "user1",
      matchmaking: "direct",
      opponentId: "user2",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty creatorId", () => {
    const result = battleCreateSchema.safeParse({
      creatorId: "",
      matchmaking: "open",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid matchmaking value", () => {
    const result = battleCreateSchema.safeParse({
      creatorId: "user1",
      matchmaking: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects creatorId over 100 chars", () => {
    const result = battleCreateSchema.safeParse({
      creatorId: "a".repeat(101),
      matchmaking: "open",
    });
    expect(result.success).toBe(false);
  });
});

describe("battleVoteSchema", () => {
  it("accepts valid vote", () => {
    const result = battleVoteSchema.safeParse({
      battleId: "b1234567",
      odv: "user1",
      vote: "clean",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all vote types", () => {
    for (const vote of ["clean", "sketch", "redo"]) {
      expect(battleVoteSchema.safeParse({ battleId: "b1234567", odv: "u1", vote }).success).toBe(
        true
      );
    }
  });

  it("rejects invalid vote type", () => {
    const result = battleVoteSchema.safeParse({
      battleId: "b1234567",
      odv: "user1",
      vote: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

describe("gameCreateSchema", () => {
  it("accepts valid game creation", () => {
    const result = gameCreateSchema.safeParse({ spotId: "spot1" });
    expect(result.success).toBe(true);
  });

  it("accepts optional maxPlayers within range", () => {
    expect(gameCreateSchema.safeParse({ spotId: "s1", maxPlayers: 2 }).success).toBe(true);
    expect(gameCreateSchema.safeParse({ spotId: "s1", maxPlayers: 8 }).success).toBe(true);
  });

  it("rejects maxPlayers out of range", () => {
    expect(gameCreateSchema.safeParse({ spotId: "s1", maxPlayers: 1 }).success).toBe(false);
    expect(gameCreateSchema.safeParse({ spotId: "s1", maxPlayers: 9 }).success).toBe(false);
  });

  it("rejects non-integer maxPlayers", () => {
    expect(gameCreateSchema.safeParse({ spotId: "s1", maxPlayers: 2.5 }).success).toBe(false);
  });
});

describe("gameTrickSchema", () => {
  it("accepts valid trick submission", () => {
    const result = gameTrickSchema.safeParse({
      gameId: "g1234567",
      odv: "u1",
      trickName: "kickflip",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional clipUrl", () => {
    const result = gameTrickSchema.safeParse({
      gameId: "g1234567",
      odv: "u1",
      trickName: "kickflip",
      clipUrl: "https://example.com/clip.mp4",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid clipUrl", () => {
    const result = gameTrickSchema.safeParse({
      gameId: "g1234567",
      odv: "u1",
      trickName: "kickflip",
      clipUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects trickName over 200 chars", () => {
    const result = gameTrickSchema.safeParse({
      gameId: "g1234567",
      odv: "u1",
      trickName: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe("roomJoinSchema", () => {
  it("accepts all valid room types", () => {
    for (const roomType of ["battle", "game", "spot", "global"]) {
      expect(roomJoinSchema.safeParse({ roomType, roomId: "r1234567" }).success).toBe(true);
    }
  });

  it("rejects invalid room type", () => {
    expect(roomJoinSchema.safeParse({ roomType: "invalid", roomId: "r1234567" }).success).toBe(
      false
    );
  });
});

describe("presenceUpdateSchema", () => {
  it("accepts valid presence update", () => {
    expect(presenceUpdateSchema.safeParse({ status: "online" }).success).toBe(true);
    expect(presenceUpdateSchema.safeParse({ status: "away" }).success).toBe(true);
  });

  it("rejects invalid status", () => {
    expect(presenceUpdateSchema.safeParse({ status: "offline" }).success).toBe(false);
  });
});

describe("validateEvent", () => {
  it("returns success with parsed data for valid input", () => {
    const result = validateEvent(presenceUpdateSchema, { status: "online" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ status: "online" });
    }
  });

  it("returns error string for invalid input", () => {
    const result = validateEvent(presenceUpdateSchema, { status: "bad" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("status");
    }
  });

  it("formats multiple errors", () => {
    const result = validateEvent(battleVoteSchema, {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("battleId");
    }
  });
});

describe("sanitizeString", () => {
  it("escapes HTML special characters", () => {
    expect(sanitizeString("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;"
    );
  });

  it("escapes double quotes", () => {
    expect(sanitizeString('hello "world"')).toBe("hello &quot;world&quot;");
  });

  it("trims whitespace", () => {
    expect(sanitizeString("  hello  ")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(sanitizeString("")).toBe("");
  });

  it("passes through safe text unchanged", () => {
    expect(sanitizeString("kickflip")).toBe("kickflip");
  });
});
