import { z } from "zod";
import { TimestampSchema } from "./firestore";
import { SpotLocationSchema } from "./spots";

export const PresenceStatusSchema = z.enum(["skating", "filming", "cruising", "idle"]);

export const PresencePrivacySchema = z.enum(["public", "approximate", "hidden"]);

export type PresenceStatus = z.infer<typeof PresenceStatusSchema>;
export type PresencePrivacy = z.infer<typeof PresencePrivacySchema>;

export const PresenceDocumentSchema = z
  .object({
    uid: z.string(),
    lastSeenAt: TimestampSchema,
    location: SpotLocationSchema.optional(),
    spotId: z.string().optional(),
    status: PresenceStatusSchema,
    privacy: PresencePrivacySchema,
    displayName: z.string().min(1).max(60),
    avatarUrl: z.string().url().optional(),
    updatedAt: TimestampSchema,
  })
  .strict();

export type PresenceDocument = z.infer<typeof PresenceDocumentSchema>;
