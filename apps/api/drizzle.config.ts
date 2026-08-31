import { defineConfig } from "drizzle-kit";

process.loadEnvFile(new URL("./.dev.vars", import.meta.url));

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
