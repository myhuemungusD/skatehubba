import { z } from "zod";

export const stanceSchema = z.enum(["regular", "goofy"]);

export const experienceLevelSchema = z.enum(["beginner", "intermediate", "advanced", "pro"]);

export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9]+$/, "Username can only contain letters and numbers")
  .transform((value) => value.toLowerCase());

/** Strip HTML angle brackets, control chars, and collapse whitespace. */
function sanitize(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sanitized optional/nullable string with max length. */
const safeText = (max: number) => z.string().max(max).transform(sanitize).optional().nullable();

/**
 * avatarBase64 — validated data-URL for avatar upload.
 * Must be a valid data:image/…;base64,… string within the size budget.
 * Max ~1.5 MB base64 ≈ ~1.1 MB decoded image.
 */
const avatarBase64Schema = z
  .string()
  .max(1_500_000, "Avatar data is too large")
  .regex(
    /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/,
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
  favoriteTricks: z.array(z.string().min(1).max(50).transform(sanitize)).max(20).optional(),
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
