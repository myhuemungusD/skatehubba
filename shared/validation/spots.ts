import { z } from "zod";
import { TimestampSchema } from "./firestore";

export const SpotTypeSchema = z.enum([
  "street",
  "park",
  "shop",
  "school",
  "plaza",
  "ledge",
  "rail",
  "stairs",
  "gap",
  "other",
]);

export const SpotDifficultySchema = z.enum(["easy", "medium", "hard"]);

export const SpotStatusSchema = z.enum(["active", "pending", "flagged", "removed"]);

export const SpotVisibilitySchema = z.enum(["public", "unlisted"]);

export const SpotPhotoSchema = z
  .object({
    url: z.string().url(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .strict();

export const SpotLocationSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .strict();

export const SpotStatsSchema = z
  .object({
    checkins30d: z.number().int().min(0),
    checkinsAll: z.number().int().min(0),
  })
  .strict();

export const SpotDocumentSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(1000).optional(),
    location: SpotLocationSchema,
    geohash: z.string().optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(120).optional(),
    country: z.string().max(120).optional(),
    spotType: SpotTypeSchema,
    difficulty: SpotDifficultySchema.optional(),
    features: z.array(z.string().max(48)).default([]),
    photos: z.array(SpotPhotoSchema).optional(),
    createdByUid: z.string().nullable().optional(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    status: SpotStatusSchema,
    visibility: SpotVisibilitySchema,
    stats: SpotStatsSchema,
    lastCheckInAt: TimestampSchema.optional(),
    lastCheckInBy: z.string().optional(),
    lastCheckInLocation: SpotLocationSchema.optional(),
  })
  .strict();

export type SpotDocument = z.infer<typeof SpotDocumentSchema>;

export const SpotCreateInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(1000).optional(),
    location: SpotLocationSchema,
    city: z.string().max(120).optional(),
    state: z.string().max(120).optional(),
    country: z.string().max(120).optional(),
    spotType: SpotTypeSchema,
    difficulty: SpotDifficultySchema.optional(),
    features: z.array(z.string().max(48)).default([]),
    photos: z.array(SpotPhotoSchema).optional(),
  })
  .strict();

export type SpotCreateInput = z.infer<typeof SpotCreateInputSchema>;
