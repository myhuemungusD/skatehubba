import { z } from "zod";

export const SpotCheckInSchema = z
  .object({
    spotId: z.number().int(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    clientTimestamp: z.string().datetime(),
    nonce: z.string().min(16).max(128),
  })
  .strict();

export type SpotCheckInRequest = z.infer<typeof SpotCheckInSchema>;
