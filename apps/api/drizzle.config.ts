import { defineConfig } from "drizzle-kit";
import { z } from "zod";

process.loadEnvFile(new URL("./.dev.vars", import.meta.url));

const envSchema = z.object({
  DATABASE_URL: z
    .string({
      error:
        "DATABASE_URL is missing. Set it in apps/api/.dev.vars or the environment before running drizzle-kit.",
    })
    .min(1),
});

const env = envSchema.parse(process.env);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
