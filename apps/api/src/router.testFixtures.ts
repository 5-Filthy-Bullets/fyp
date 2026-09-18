import type { SessionReader } from "./router";

/**
 * The router only reads `auth.api.getSession`. Fixtures return the narrow
 * `SessionReader` so a drift in better-auth's session shape fails typecheck
 * instead of passing tests and failing at runtime.
 */
export const authWithSession = (userName: string): SessionReader => ({
  api: {
    getSession: async () => ({
      session: {
        id: "test-session-id",
        userId: "test-user-id",
        expiresAt: new Date("2030-01-01T00:00:00Z"),
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        token: "test-token",
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
});

export const authWithoutSession = (): SessionReader => ({
  api: {
    getSession: async () => null,
  },
});
