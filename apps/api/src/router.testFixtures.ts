import type { Auth } from "./auth";

/**
 * The router only reads `auth.api.getSession`, but `Auth` is better-auth's
 * full API surface. Faking all of it would bury two small behaviors under
 * noise, so these fixtures cover the touched surface and cast once here
 * instead of at each call site.
 */
export const authWithSession = (userName: string): Auth => {
  const stub = {
    api: {
      getSession: async () => ({
        session: {
          id: "test-session-id",
          userId: "test-user-id",
          expiresAt: new Date("2030-01-01T00:00:00Z"),
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
        user: {
          id: "test-user-id",
          name: userName,
          email: "test@example.com",
          emailVerified: true,
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      }),
    },
  };
  return stub as unknown as Auth;
};

export const authWithoutSession = (): Auth => {
  const stub = {
    api: {
      getSession: async () => null,
    },
  };
  return stub as unknown as Auth;
};
