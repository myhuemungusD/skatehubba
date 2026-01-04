import { z } from "zod";

export const CheckInInput = z.object({
  uid: z.string().min(1, "User ID is required"),
  spotId: z.string().min(1, "Spot ID is required"),
  trick: z.string().min(1, "Trick name is required"),
  videoUrl: z.string().url("Valid video URL is required"),
});

export type CheckInInput = z.infer<typeof CheckInInput>;

export const CheckInOutput = z.object({
  status: z.enum(["ok", "fail"]),
  awardedPoints: z.number().int().min(0),
  checkInId: z.string().optional(),
  message: z.string().optional(),
  createdAt: z.string().optional(),
});

export type CheckInOutput = z.infer<typeof CheckInOutput>;

export const CheckInRecord = z.object({
  id: z.string(),
  uid: z.string(),
  spotId: z.string(),
  trick: z.string(),
  videoUrl: z.string().url(),
  awardedPoints: z.number().int(),
  createdAt: z.string().datetime(),
});

export type CheckInRecord = z.infer<typeof CheckInRecord>;
