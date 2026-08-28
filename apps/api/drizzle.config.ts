import { defineConfig } from "drizzle-kit";
import { loadDatabaseUrlFromDotEnv } from "./src/env";

const databaseUrl = loadDatabaseUrlFromDotEnv("../../.env.local");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
});
