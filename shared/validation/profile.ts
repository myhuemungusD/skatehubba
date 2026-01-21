import { z } from "zod";

export const stanceSchema = z.enum(["regular", "goofy"]);

export const experienceLevelSchema = z.enum(["beginner", "intermediate", "advanced", "pro"]);

export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9]+$/, "Username can only contain letters and numbers")
  .transform((value) => value.toLowerCase());

export const profileCreateSchema = z.object({
  username: usernameSchema.optional(),
  stance: stanceSchema.optional().nullable(),
  experienceLevel: experienceLevelSchema.optional().nullable(),
  favoriteTricks: z.array(z.string().min(1).max(50)).max(20).optional(),
  bio: z.string().max(500).optional().nullable(),
  sponsorFlow: z.string().max(100).optional().nullable(),
  sponsorTeam: z.string().max(100).optional().nullable(),
  hometownShop: z.string().max(100).optional().nullable(),
  spotsVisited: z.number().int().nonnegative().optional(),
  crewName: z.string().max(80).optional().nullable(),
  credibilityScore: z.number().int().nonnegative().optional(),
  skip: z.boolean().optional(),
});

export type ProfileCreateInput = z.infer<typeof profileCreateSchema>;
