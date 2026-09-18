import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authSchema } from "./db/schema";

export interface AuthEnv {
  readonly DATABASE_URL: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL: string;
  readonly WEB_URL: string;
  readonly BETTER_AUTH_LOG_LVL?: "debug" | "info" | "warn" | "error";
}

export const createAuth = (env: AuthEnv) => {
  const sql = neon(env.DATABASE_URL);
  const db = drizzle(sql, { schema: authSchema });

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: authSchema,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.WEB_URL],
    logger: {
      level: env.BETTER_AUTH_LOG_LVL ?? "error",
    },
    emailAndPassword: {
      enabled: true,
    },
  });
};

export type Auth = ReturnType<typeof createAuth>;
