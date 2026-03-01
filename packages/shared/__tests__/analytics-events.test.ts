import {
  EVENT_NAMES,
  EventNameSchema,
  AnalyticsIngestSchema,
  AnalyticsBatchSchema,
  BattleCreatedProps,
  BattleVotedProps,
  BattleJoinedProps,
  BattleCompletedProps,
  ClipUploadedProps,
  SpotCheckinProps,
  CrewJoinedProps,
  GameCreatedProps,
  GameJoinedProps,
  GameTrickSubmittedProps,
  GameTrickPassedProps,
  GameCompletedProps,
  GameForfeitedProps,
  DeepLinkInvalidProps,
  validateEventProps,
} from "../analytics-events";

describe("EVENT_NAMES", () => {
  it("contains expected battle events", () => {
    expect(EVENT_NAMES).toContain("battle_created");
    expect(EVENT_NAMES).toContain("battle_joined");
    expect(EVENT_NAMES).toContain("battle_voted");
    expect(EVENT_NAMES).toContain("battle_completed");
  });

  it("contains expected game events", () => {
    expect(EVENT_NAMES).toContain("game_created");
    expect(EVENT_NAMES).toContain("game_joined");
    expect(EVENT_NAMES).toContain("game_completed");
    expect(EVENT_NAMES).toContain("game_forfeited");
  });

  it("contains supporting events", () => {
    expect(EVENT_NAMES).toContain("clip_uploaded");
    expect(EVENT_NAMES).toContain("crew_joined");
    expect(EVENT_NAMES).toContain("spot_checkin_validated");
  });

  it("contains security events", () => {
    expect(EVENT_NAMES).toContain("device_integrity_warning");
    expect(EVENT_NAMES).toContain("deep_link_invalid");
  });
});

describe("EventNameSchema", () => {
  it("accepts valid event names", () => {
    expect(EventNameSchema.safeParse("battle_created").success).toBe(true);
    expect(EventNameSchema.safeParse("game_completed").success).toBe(true);
  });

  it("rejects invalid event names", () => {
    expect(EventNameSchema.safeParse("unknown_event").success).toBe(false);
    expect(EventNameSchema.safeParse("").success).toBe(false);
  });
});

describe("AnalyticsIngestSchema", () => {
  const validPayload = {
    event_id: "abc-123-def-456",
    event_name: "battle_created",
    occurred_at: "2024-01-01T00:00:00.000Z",
    properties: {},
  };

  it("accepts valid payload", () => {
    expect(AnalyticsIngestSchema.safeParse(validPayload).success).toBe(true);
  });

  it("accepts payload with all optional fields", () => {
    const full = {
      ...validPayload,
      session_id: "session-id-12345",
      source: "web",
      app_version: "1.0.0",
    };
    expect(AnalyticsIngestSchema.safeParse(full).success).toBe(true);
  });

  it("rejects short event_id", () => {
    expect(AnalyticsIngestSchema.safeParse({ ...validPayload, event_id: "short" }).success).toBe(
      false
    );
  });

  it("rejects invalid event_name", () => {
    expect(
      AnalyticsIngestSchema.safeParse({ ...validPayload, event_name: "invalid" }).success
    ).toBe(false);
  });

  it("rejects invalid occurred_at format", () => {
    expect(
      AnalyticsIngestSchema.safeParse({ ...validPayload, occurred_at: "not-a-date" }).success
    ).toBe(false);
  });

  it("rejects invalid source", () => {
    expect(AnalyticsIngestSchema.safeParse({ ...validPayload, source: "desktop" }).success).toBe(
      false
    );
  });

  it("rejects extra fields (strict mode)", () => {
    expect(AnalyticsIngestSchema.safeParse({ ...validPayload, user_id: "u1" }).success).toBe(false);
  });

  it("defaults properties to empty object", () => {
    const { event_id, event_name, occurred_at } = validPayload;
    const parsed = AnalyticsIngestSchema.parse({ event_id, event_name, occurred_at });
    expect(parsed.properties).toEqual({});
  });
});

describe("AnalyticsBatchSchema", () => {
  const validEvent = {
    event_id: "abc-123-def-456",
    event_name: "battle_created",
    occurred_at: "2024-01-01T00:00:00.000Z",
    properties: {},
  };

  it("accepts array of valid events", () => {
    expect(AnalyticsBatchSchema.safeParse([validEvent, validEvent]).success).toBe(true);
  });

  it("accepts empty array", () => {
    expect(AnalyticsBatchSchema.safeParse([]).success).toBe(true);
  });

  it("rejects more than 100 events", () => {
    const events = Array(101).fill(validEvent);
    expect(AnalyticsBatchSchema.safeParse(events).success).toBe(false);
  });
});

describe("Property schemas", () => {
  it("BattleCreatedProps validates battle creation", () => {
    expect(BattleCreatedProps.safeParse({ battle_id: "b1" }).success).toBe(true);
    expect(BattleCreatedProps.safeParse({ battle_id: "b1", matchmaking: "open" }).success).toBe(
      true
    );
    expect(BattleCreatedProps.safeParse({ battle_id: "b1", matchmaking: "invalid" }).success).toBe(
      false
    );
    expect(BattleCreatedProps.safeParse({}).success).toBe(false);
  });

  it("BattleVotedProps validates votes", () => {
    expect(BattleVotedProps.safeParse({ battle_id: "b1", vote: "clean" }).success).toBe(true);
    expect(BattleVotedProps.safeParse({ battle_id: "b1", vote: "sketch" }).success).toBe(true);
    expect(BattleVotedProps.safeParse({ battle_id: "b1", vote: "bad" }).success).toBe(false);
  });

  it("BattleJoinedProps validates joins", () => {
    expect(BattleJoinedProps.safeParse({ battle_id: "b1" }).success).toBe(true);
    expect(BattleJoinedProps.safeParse({ battle_id: "b1", creator_id: "u1" }).success).toBe(true);
  });

  it("BattleCompletedProps validates completion", () => {
    expect(BattleCompletedProps.safeParse({ battle_id: "b1" }).success).toBe(true);
    expect(
      BattleCompletedProps.safeParse({ battle_id: "b1", winner_id: "u1", total_rounds: 3 }).success
    ).toBe(true);
  });

  it("ClipUploadedProps validates uploads", () => {
    expect(ClipUploadedProps.safeParse({ clip_id: "c1" }).success).toBe(true);
    expect(ClipUploadedProps.safeParse({}).success).toBe(false);
  });

  it("SpotCheckinProps validates check-ins", () => {
    expect(SpotCheckinProps.safeParse({ spot_id: "s1" }).success).toBe(true);
    expect(SpotCheckinProps.safeParse({ spot_id: "s1", streak_day: 5 }).success).toBe(true);
  });

  it("CrewJoinedProps validates crew joins", () => {
    expect(CrewJoinedProps.safeParse({ crew_id: "crew1" }).success).toBe(true);
  });

  it("GameCreatedProps validates game creation", () => {
    expect(GameCreatedProps.safeParse({ game_id: "g1" }).success).toBe(true);
  });

  it("GameJoinedProps validates game joins", () => {
    expect(GameJoinedProps.safeParse({ game_id: "g1" }).success).toBe(true);
  });

  it("GameTrickSubmittedProps validates trick submission", () => {
    expect(GameTrickSubmittedProps.safeParse({ game_id: "g1" }).success).toBe(true);
    expect(
      GameTrickSubmittedProps.safeParse({ game_id: "g1", trick_name: "kickflip" }).success
    ).toBe(true);
  });

  it("GameTrickPassedProps validates trick pass", () => {
    expect(GameTrickPassedProps.safeParse({ game_id: "g1" }).success).toBe(true);
    expect(GameTrickPassedProps.safeParse({ game_id: "g1", letters: "SK" }).success).toBe(true);
  });

  it("GameCompletedProps validates game completion", () => {
    expect(GameCompletedProps.safeParse({ game_id: "g1" }).success).toBe(true);
    expect(GameCompletedProps.safeParse({ game_id: "g1", winner_id: "u1" }).success).toBe(true);
  });

  it("GameForfeitedProps validates forfeits", () => {
    expect(GameForfeitedProps.safeParse({ game_id: "g1" }).success).toBe(true);
    expect(GameForfeitedProps.safeParse({ game_id: "g1", reason: "voluntary" }).success).toBe(true);
    expect(
      GameForfeitedProps.safeParse({ game_id: "g1", reason: "disconnect_timeout" }).success
    ).toBe(true);
    expect(GameForfeitedProps.safeParse({ game_id: "g1", reason: "invalid" }).success).toBe(false);
  });

  it("DeepLinkInvalidProps validates invalid deep link events", () => {
    expect(DeepLinkInvalidProps.safeParse({ raw_id: "../etc/passwd" }).success).toBe(true);
    expect(DeepLinkInvalidProps.safeParse({ raw_id: "x", route: "game" }).success).toBe(true);
    expect(DeepLinkInvalidProps.safeParse({}).success).toBe(false);
    expect(DeepLinkInvalidProps.safeParse({ raw_id: "" }).success).toBe(false);
    expect(DeepLinkInvalidProps.safeParse({ raw_id: "x".repeat(201) }).success).toBe(false);
  });

  it("DeepLinkInvalidProps rejects extra fields (strict)", () => {
    expect(DeepLinkInvalidProps.safeParse({ raw_id: "abc", extra: true }).success).toBe(false);
  });
});

describe("validateEventProps", () => {
  it("validates battle_created props", () => {
    expect(() => validateEventProps("battle_created", { battle_id: "b1" })).not.toThrow();
  });

  it("validates battle_voted props", () => {
    expect(() =>
      validateEventProps("battle_voted", { battle_id: "b1", vote: "clean" })
    ).not.toThrow();
  });

  it("throws for invalid battle_voted props", () => {
    expect(() => validateEventProps("battle_voted", {})).toThrow();
  });

  it("validates game events", () => {
    expect(() => validateEventProps("game_created", { game_id: "g1" })).not.toThrow();
    expect(() => validateEventProps("game_joined", { game_id: "g1" })).not.toThrow();
    expect(() => validateEventProps("game_completed", { game_id: "g1" })).not.toThrow();
    expect(() => validateEventProps("game_forfeited", { game_id: "g1" })).not.toThrow();
  });

  it("validates battle_joined with valid props (line 182-184)", () => {
    const result = validateEventProps("battle_joined", { battle_id: "b1" });
    expect(result).toEqual({ battle_id: "b1" });
  });

  it("validates battle_joined with creator_id", () => {
    const result = validateEventProps("battle_joined", { battle_id: "b1", creator_id: "u2" });
    expect(result).toEqual({ battle_id: "b1", creator_id: "u2" });
  });

  it("throws for battle_joined with missing battle_id", () => {
    expect(() => validateEventProps("battle_joined", {})).toThrow();
  });

  it("validates game_trick_submitted with valid props (line 196-198)", () => {
    const result = validateEventProps("game_trick_submitted", { game_id: "g1" });
    expect(result).toEqual({ game_id: "g1" });
  });

  it("validates game_trick_submitted with trick_name", () => {
    const result = validateEventProps("game_trick_submitted", {
      game_id: "g1",
      trick_name: "kickflip",
    });
    expect(result).toEqual({ game_id: "g1", trick_name: "kickflip" });
  });

  it("throws for game_trick_submitted with missing game_id", () => {
    expect(() => validateEventProps("game_trick_submitted", {})).toThrow();
  });

  it("validates game_trick_passed with valid props", () => {
    const result = validateEventProps("game_trick_passed", { game_id: "g1", letters: "SK" });
    expect(result).toEqual({ game_id: "g1", letters: "SK" });
  });

  it("validates battle_completed with all optional fields", () => {
    const result = validateEventProps("battle_completed", {
      battle_id: "b1",
      winner_id: "u1",
      total_rounds: 5,
    });
    expect(result).toEqual({ battle_id: "b1", winner_id: "u1", total_rounds: 5 });
  });

  it("validates supporting events", () => {
    expect(() => validateEventProps("clip_uploaded", { clip_id: "c1" })).not.toThrow();
    expect(() => validateEventProps("spot_checkin_validated", { spot_id: "s1" })).not.toThrow();
    expect(() => validateEventProps("crew_joined", { crew_id: "cr1" })).not.toThrow();
  });

  it("validates deep_link_invalid props", () => {
    expect(() =>
      validateEventProps("deep_link_invalid", { raw_id: "../etc/passwd" })
    ).not.toThrow();
  });

  it("validates deep_link_invalid with route", () => {
    const result = validateEventProps("deep_link_invalid", {
      raw_id: "bad-id",
      route: "game",
    });
    expect(result).toEqual({ raw_id: "bad-id", route: "game" });
  });

  it("throws for deep_link_invalid with missing raw_id", () => {
    expect(() => validateEventProps("deep_link_invalid", {})).toThrow();
  });

  it("validates device_integrity_warning props (line 223)", () => {
    const result = validateEventProps("device_integrity_warning", {
      isJailbroken: true,
      hookDetected: false,
    });
    expect(result).toEqual({ isJailbroken: true, hookDetected: false });
  });

  it("throws for device_integrity_warning with invalid props", () => {
    expect(() => validateEventProps("device_integrity_warning", {})).toThrow();
  });

  it("passes through unvalidated events", () => {
    const props = { any: "data" };
    expect(validateEventProps("app_opened", props)).toBe(props);
  });
});
