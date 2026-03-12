import { z } from "zod";
import { sanitizeText, safeText } from "./sanitize";

export const stanceSchema = z.enum(["regular", "goofy"]);

export const experienceLevelSchema = z.enum(["beginner", "intermediate", "advanced", "pro"]);

export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9]+$/, "Username can only contain letters and numbers")
  .transform((value) => value.toLowerCase());

/**
 * avatarBase64 — validated data-URL for avatar upload.
 * Must be a valid data:image/…;base64,… string within the size budget.
 *
 * Size budget: server allows 5 MB decoded (MAX_AVATAR_BYTES).
 * 5 MB decoded ≈ 6.67 MB base64, plus the ~30-char data-URL header ≈ 7 MB.
 * We cap at 7_000_000 chars to match the server constant.
 *
 * Uses `.refine()` instead of `.regex()` to avoid Zod re-compiling the
 * pattern on every call and to keep the error message clean.
 */
const avatarBase64Schema = z
  .string()
  .max(7_000_000, "Avatar data is too large")
  .refine(
    (val) => /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/\n]+=*$/.test(val),
    "Avatar must be a valid base64-encoded image (png, jpeg, webp, or gif)"
  )
  .optional();

export const profileCreateSchema = z.object({
  username: usernameSchema.optional(),
  stance: z.preprocess((val) => (val === "" ? undefined : val), stanceSchema.optional().nullable()),
  experienceLevel: z.preprocess(
    (val) => (val === "" ? undefined : val),
    experienceLevelSchema.optional().nullable()
  ),
  favoriteTricks: z.array(z.string().min(1).max(50).transform(sanitizeText)).max(20).optional(),
  bio: safeText(500),
  sponsorFlow: safeText(100),
  sponsorTeam: safeText(100),
  hometownShop: safeText(100),
  spotsVisited: z.number().int().nonnegative().optional(),
  crewName: safeText(80),
  credibilityScore: z.number().int().nonnegative().optional(),
  skip: z.boolean().optional(),
  avatarBase64: avatarBase64Schema,
});

export type ProfileCreateInput = z.infer<typeof profileCreateSchema>;
