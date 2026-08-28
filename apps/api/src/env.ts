import { z } from "zod";
import { parseEnvOrThrow } from "./env-utils";

const envSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().trim().min(32),
  BETTER_AUTH_URL: z.url(),
  WEB_URL: z.url(),
});

export type AppEnv = z.infer<typeof envSchema>;

export const parseEnv = (source: object) =>
  parseEnvOrThrow(
    envSchema,
    Object.fromEntries(Object.entries(source)),
    ".env.local or Worker secrets",
  );

export const parseDatabaseUrl = (source: object) =>
  parseEnvOrThrow(
    envSchema.pick({ DATABASE_URL: true }),
    Object.fromEntries(Object.entries(source)),
    "DATABASE_URL",
  ).DATABASE_URL;
