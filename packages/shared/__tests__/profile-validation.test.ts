import { describe, expect, it } from "vitest";
import {
  profileCreateSchema,
  usernameSchema,
  stanceSchema,
  experienceLevelSchema,
} from "../validation/profile";

describe("profile validation", () => {
  it("validates and normalizes usernames", () => {
    const value = usernameSchema.parse("Skater123");
    expect(value).toBe("skater123");
  });

  it("rejects invalid usernames", () => {
    const result = usernameSchema.safeParse("bad-name!");
    expect(result.success).toBe(false);
  });

  it("accepts valid profile input", () => {
    const result = profileCreateSchema.safeParse({
      username: "KickflipKing",
      stance: "regular",
      experienceLevel: "advanced",
      favoriteTricks: ["kickflip", "heelflip"],
      bio: "Skate every day.",
      crewName: "Night Crew",
      credibilityScore: 0,
      spotsVisited: 0,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe("kickflipking");
    }
  });

  describe("stanceSchema", () => {
    it("accepts regular", () => {
      expect(stanceSchema.parse("regular")).toBe("regular");
    });

    it("accepts goofy", () => {
      expect(stanceSchema.parse("goofy")).toBe("goofy");
    });

    it("rejects invalid stance", () => {
      expect(stanceSchema.safeParse("switch").success).toBe(false);
    });
  });

  describe("experienceLevelSchema", () => {
    it("accepts all valid levels", () => {
      expect(experienceLevelSchema.parse("beginner")).toBe("beginner");
      expect(experienceLevelSchema.parse("intermediate")).toBe("intermediate");
      expect(experienceLevelSchema.parse("advanced")).toBe("advanced");
      expect(experienceLevelSchema.parse("pro")).toBe("pro");
    });

    it("rejects invalid level", () => {
      expect(experienceLevelSchema.safeParse("expert").success).toBe(false);
    });
  });

  describe("stance preprocessing (lines 17-21)", () => {
    it("converts empty string stance to undefined (preprocessing)", () => {
      const result = profileCreateSchema.safeParse({
        stance: "",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stance).toBeUndefined();
      }
    });

    it("converts empty string experienceLevel to undefined (preprocessing)", () => {
      const result = profileCreateSchema.safeParse({
        experienceLevel: "",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.experienceLevel).toBeUndefined();
      }
    });

    it("preserves valid stance through preprocessing", () => {
      const result = profileCreateSchema.safeParse({
        stance: "regular",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stance).toBe("regular");
      }
    });

    it("preserves valid experienceLevel through preprocessing", () => {
      const result = profileCreateSchema.safeParse({
        experienceLevel: "beginner",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.experienceLevel).toBe("beginner");
      }
    });

    it("allows null stance", () => {
      const result = profileCreateSchema.safeParse({
        stance: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stance).toBeNull();
      }
    });

    it("allows null experienceLevel", () => {
      const result = profileCreateSchema.safeParse({
        experienceLevel: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.experienceLevel).toBeNull();
      }
    });

    it("allows undefined stance", () => {
      const result = profileCreateSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stance).toBeUndefined();
      }
    });
  });

  describe("profileCreateSchema additional fields", () => {
    it("accepts all optional fields", () => {
      const result = profileCreateSchema.safeParse({
        username: "TestUser",
        stance: "goofy",
        experienceLevel: "pro",
        favoriteTricks: ["kickflip"],
        bio: "Shredding since 1999",
        sponsorFlow: "Nike SB",
        sponsorTeam: "Pro Team",
        hometownShop: "Local Skate Shop",
        spotsVisited: 42,
        crewName: "Night Owls",
        credibilityScore: 100,
        skip: true,
      });
      expect(result.success).toBe(true);
    });

    it("rejects bio that is too long", () => {
      const result = profileCreateSchema.safeParse({
        bio: "x".repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it("rejects too many favorite tricks", () => {
      const result = profileCreateSchema.safeParse({
        favoriteTricks: Array(21).fill("trick"),
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative spotsVisited", () => {
      const result = profileCreateSchema.safeParse({
        spotsVisited: -1,
      });
      expect(result.success).toBe(false);
    });
  });
});
