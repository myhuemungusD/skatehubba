import { describe, expect, it } from "vitest";
import { profileCreateSchema, usernameSchema } from "../validation/profile";

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
});
