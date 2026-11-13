import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authSchema, organization, user } from "./db/schema";
import { createEmailSender } from "./email/sendgrid";
import { passwordResetTemplate, verificationTemplate } from "./email/templates";

export interface AuthEnv {
  readonly DATABASE_URL: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL: string;
  readonly WEB_URL: string;
  readonly BETTER_AUTH_LOG_LVL?: "debug" | "info" | "warn" | "error";
  /** UploadThing token for the conversation attachment route. */
  readonly UPLOADTHING_TOKEN: string;
  /** Set to "development" locally so UploadThing hits its dev ingest. */
  readonly ENVIRONMENT?: string;
  /** SendGrid API key. Missing means mail sends are skipped silently. */
  readonly SENDGRID_API_KEY?: string;
  /** Verified sender, e.g. the Gmail address from Single Sender Verification. */
  readonly EMAIL_FROM?: string;
}

export interface AuthOptions {
  /**
   * Defers the auth mail sends to the runtime's background hook. Workers'
   * `ctx.waitUntil` keeps the send alive after the response without making the
   * caller wait, which also avoids leaking account existence through timing.
   */
  readonly waitUntil?: (promise: Promise<unknown>) => void;
}

export const createAuth = (env: AuthEnv, options?: AuthOptions) => {
  const sql = neon(env.DATABASE_URL);
  const db = drizzle(sql, { schema: authSchema });
  const email = createEmailSender(env);

  /**
   * Session cookies must travel cross-site in prod (API on workers.dev,
   * web on pages.dev), so they need SameSite=None with Secure and
   * Partitioned. Local dev runs over http, where Secure cookies never
   * stick, so it keeps the Lax default.
   */
  const cookieAttributes = env.BETTER_AUTH_URL.startsWith("https://")
    ? ({ sameSite: "none", secure: true, partitioned: true } as const)
    : ({ sameSite: "lax", secure: false } as const);

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
      ...(options?.waitUntil === undefined
        ? {}
        : { backgroundTasks: { handler: options.waitUntil } }),
    },
    logger: {
      level: env.BETTER_AUTH_LOG_LVL ?? "error",
    },
    emailAndPassword: {
      enabled: true,
      /**
       * The reset link lands on the web app's /reset-password page, which posts
       * the token back with the new password. Reset also drops every other
       * session, so a stolen session cannot outlive the password change.
       */
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const body = passwordResetTemplate({ name: user.name, email: user.email, url });
        await email.send({ to: [user.email], ...body });
      },
    },
    emailVerification: {
      /**
       * Admin-created accounts carry a password handed over outside the app,
       * so sign-in stays open without a verified address. The address is still
       * verified on first sign-up, and the link redirects back to the web app.
       */
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        const body = verificationTemplate({ name: user.name, email: user.email, url });
        await email.send({ to: [user.email], ...body });
      },
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
                message: "This account has been deactivated. Ask the vendor team to reactivate it.",
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
