import { z } from "zod";
import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  json,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const donations = pgTable("donations", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  firstName: varchar("first_name", { length: 50 }).notNull(),
  amount: integer("amount").notNull(), // amount in cents
  paymentIntentId: varchar("payment_intent_id", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Shop products table
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  productId: varchar("product_id", { length: 100 }).notNull().unique(), // e.g., 'skatehubba-tee'
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull(), // price in cents
  imageUrl: varchar("image_url", { length: 500 }),
  icon: varchar("icon", { length: 50 }), // icon name from lucide-react
  category: varchar("category", { length: 100 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Shop orders table
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  userEmail: varchar("user_email", { length: 255 }),
  items: json("items")
    .$type<
      Array<{
        id: string;
        name: string;
        price: number;
        quantity: number;
      }>
    >()
    .notNull(),
  total: integer("total").notNull(), // total in cents
  status: varchar("status", { length: 50 }).notNull().default("pending"), // 'pending', 'completed', 'failed'
  paymentIntentId: varchar("payment_intent_id", { length: 255 }).unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Consumed payment intents for premium upgrades — prevents reuse of a single payment
export const consumedPaymentIntents = pgTable(
  "consumed_payment_intents",
  {
    id: serial("id").primaryKey(),
    paymentIntentId: varchar("payment_intent_id", { length: 255 }).notNull().unique(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("IDX_consumed_payment_intents_user").on(table.userId),
  })
);

export const insertDonationSchema = createInsertSchema(donations);

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
});

export type Donation = typeof donations.$inferSelect;
export type InsertDonation = z.infer<typeof insertDonationSchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
