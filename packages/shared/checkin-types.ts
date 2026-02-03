import { z } from "zod";

export const CheckInResultSchema = z.object({
  id: z.string(),
  trick: z.string(),
  spotId: z.string(),
  videoUrl: z.string().optional(),
  createdAt: z.string(),
  awardedPoints: z.number(),
});

export type CheckInResult = z.infer<typeof CheckInResultSchema>;
