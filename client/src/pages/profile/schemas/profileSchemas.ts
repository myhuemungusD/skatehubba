import { z } from "zod";
import { usernameSchema } from "@shared/validation/profile";

export const stanceSchema = z.enum(["regular", "goofy"]);
export const experienceLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);

export const formSchema = z.object({
  username: usernameSchema.optional().or(z.literal("")),
  stance: stanceSchema.optional().or(z.literal("")),
  experienceLevel: experienceLevelSchema.optional().or(z.literal("")),
  sponsorFlow: z.string().max(100).optional(),
  sponsorTeam: z.string().max(100).optional(),
  hometownShop: z.string().max(100).optional(),
});

export type FormValues = z.infer<typeof formSchema>;

export type ProfileCreatePayload = {
  username?: string;
  stance?: "regular" | "goofy";
  experienceLevel?: "beginner" | "intermediate" | "advanced";
  sponsorFlow?: string;
  sponsorTeam?: string;
  hometownShop?: string;
  skip?: boolean;
};

export const UsernameCheckResponseSchema = z.object({
  available: z.boolean(),
});

export type ProfileCreateResponse = {
  profile: {
    uid: string;
    username: string;
    stance: "regular" | "goofy" | null;
    experienceLevel: "beginner" | "intermediate" | "advanced" | "pro" | null;
    favoriteTricks: string[];
    bio: string | null;
    spotsVisited: number;
    crewName: string | null;
    credibilityScore: number;
    avatarUrl: string | null;
    sponsorFlow?: string | null;
    sponsorTeam?: string | null;
    hometownShop?: string | null;
    createdAt: string;
    updatedAt: string;
  };
};

export type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "unverified";

export { usernameSchema };
