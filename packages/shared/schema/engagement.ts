import { z } from "zod";
import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const NewSubscriberInput = z.object({
  firstName: z
    .string()
    .optional()
    .transform((v) => v?.trim() || null),
  email: z
    .string()
    .email()
    .transform((v) => v.trim().toLowerCase()),
  isActive: z.boolean().optional(), // default true in service/repo
});
export type NewSubscriberInput = z.infer<typeof NewSubscriberInput>;

export const SubscriberSchema = NewSubscriberInput.extend({
  id: z.string(),
  isActive: z.boolean(),
  createdAt: z.date(),
});
export type SubscriberData = z.infer<typeof SubscriberSchema>;

export const subscribers = pgTable("subscribers", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  firstName: text("first_name"),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
  isActive: boolean("is_active").default(true),
});

export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  userEmail: varchar("user_email", { length: 255 }),
  type: varchar("type", { length: 50 }).notNull(), // 'bug', 'feature', 'improvement', 'general'
  message: text("message").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("new"), // 'new', 'reviewed', 'resolved'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Beta signups — replaces Firestore mail_list collection
export const betaSignups = pgTable("beta_signups", {
  id: varchar("id", { length: 64 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  platform: varchar("platform", { length: 50 }),
  ipHash: varchar("ip_hash", { length: 64 }),
  source: varchar("source", { length: 100 }).default("skatehubba.com"),
  submitCount: integer("submit_count").notNull().default(1),
  lastSubmittedAt: timestamp("last_submitted_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSubscriberSchema = createInsertSchema(subscribers).omit({
  id: true,
  createdAt: true,
});

export const insertFeedbackSchema = createInsertSchema(feedback).omit({
  id: true,
  createdAt: true,
  status: true,
});

export type Subscriber = typeof subscribers.$inferSelect;
export type InsertSubscriber = z.infer<typeof insertSubscriberSchema>;
export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type BetaSignup = typeof betaSignups.$inferSelect;
