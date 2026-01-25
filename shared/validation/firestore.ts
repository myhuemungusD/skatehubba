import { z } from "zod";

export const TimestampSchema = z
  .object({
    seconds: z.number(),
    nanoseconds: z.number(),
  })
  .strict();

export type TimestampLike = z.infer<typeof TimestampSchema>;

