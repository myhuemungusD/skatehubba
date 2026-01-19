import { z } from "zod";

export const BetaSignupInput = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email"),
    platform: z.enum(["ios", "android"]),
  })
  .strict();

export type BetaSignupInput = z.infer<typeof BetaSignupInput>;
