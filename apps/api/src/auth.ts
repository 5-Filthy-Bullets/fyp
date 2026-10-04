import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authSchema, organization, user } from "./db/schema";

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
    /**
     * Deactivation lives in two checks. The admin plugin writes `banned` and
     * drops sessions on ban; this hook re-reads the user row on every
     * sign-in so a banned account, or one whose org was suspended, never
     * gets a fresh session. `readCaller` in access.ts repeats the check per
     * RPC call for sessions that were already live at ban time.
     */
    databaseHooks: {
      session: {
        create: {
          before: async (session, context) => {
            if (!context) {
              return;
            }
            const userId = session.userId;
            const [row] = await db
              .select({
                banned: user.banned,
                organizationId: user.organizationId,
              })
              .from(user)
              .where(eq(user.id, userId))
              .limit(1);
            if (!row || row.banned) {
              throw new APIError("FORBIDDEN", {
                code: "BANNED_USER",
                message:
                  "This account has been deactivated. Ask the vendor team to reactivate it.",
              });
            }
            if (row.organizationId !== null) {
              const [org] = await db
                .select({ isActive: organization.isActive })
                .from(organization)
                .where(eq(organization.id, row.organizationId))
                .limit(1);
              if (!org || !org.isActive) {
                throw new APIError("FORBIDDEN", {
                  code: "BANNED_USER",
                  message:
                    "This organization has been suspended. Ask the vendor team to reactivate it.",
                });
              }
            }
          },
        },
      },
    },
  });
};

export type Auth = ReturnType<typeof createAuth>;
