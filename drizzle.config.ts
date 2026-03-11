import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./packages/shared/schema",
  dialect: "postgresql",
  // DATABASE_URL is only needed for commands that connect to the database
  // (migrate, push, studio). The generate command only reads schema files.
  ...(process.env.DATABASE_URL ? { dbCredentials: { url: process.env.DATABASE_URL } } : {}),
});
