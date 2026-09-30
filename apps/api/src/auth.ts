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

  /**
   * Session cookies must travel cross-site in prod (API on workers.dev,
   * web on pages.dev), so they need SameSite=None with Secure and
   * Partitioned. Local dev runs over http, where Secure cookies never
   * stick, so it keeps the Lax default.
   */
  const cookieAttributes = env.BETTER_AUTH_URL.startsWith("https://")
    ? { sameSite: "none", secure: true, partitioned: true } as const
    : { sameSite: "lax", secure: false } as const;

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: authSchema,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.WEB_URL],
    /**
     * The drizzle schema owns these columns, but Better Auth only knows about
     * the core user table unless they are declared here. `input: false` keeps
     * them server-owned: public sign-up can never hand itself a technician
     * role or an org it does not belong to. Keys must match the drizzle
     * property names, since the adapter ignores `fieldName`.
     */
    user: {
      additionalFields: {
        role: {
          /**
           * Declared as a plain string, not the enum literal union: the value
           * arrives from Postgres, so the router re-parses it with zod against
           * `userRole.enumValues` before acting on it.
           */
          type: "string",
          required: true,
          input: false,
          defaultValue: "client",
        },
        organizationId: {
          type: "string",
          required: false,
          input: false,
        },
      },
    },
    advanced: {
      defaultCookieAttributes: cookieAttributes,
    },
    logger: {
      level: env.BETTER_AUTH_LOG_LVL ?? "error",
    },
    emailAndPassword: {
      enabled: true,
    },
  });
};

export type Auth = ReturnType<typeof createAuth>;
