import { z } from "zod";

export const UserRole = z.enum(["skater", "filmer", "pro"]);
export type UserRole = z.infer<typeof UserRole>;

export const UserProfile = z.object({
  uid: z.string(),
  displayName: z.string(),
  email: z.string().email().optional(),
  photoURL: z.string().url().optional(),
  isPro: z.boolean().default(false),
  role: UserRole.default("skater"),
  xp: z.number().int().min(0).default(0),
  level: z.number().int().min(1).default(1),
});

export type UserProfile = z.infer<typeof UserProfile>;

export const AuthState = z.object({
  isAuthenticated: z.boolean(),
  user: z.object({
    uid: z.string(),
    email: z.string().email().nullable(),
    displayName: z.string().nullable(),
    photoURL: z.string().url().nullable(),
    emailVerified: z.boolean(),
    providerId: z.enum(["password", "google.com", "apple.com", "phone"]),
  }).nullable(),
  loading: z.boolean(),
  error: z.string().nullable(),
});

export type AuthState = z.infer<typeof AuthState>;
