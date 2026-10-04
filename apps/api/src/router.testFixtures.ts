import { drizzle } from "drizzle-orm/neon-http";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { appSchema } from "./db/schema";
import type { Database } from "./db/client";
import type { RouterSession, SessionReader } from "./router";

export interface SessionUser {
  readonly name: string;
  readonly role: string;
  readonly organizationId: string | null;
}

/**
 * The router only reads `auth.api.getSession`. Fixtures return the narrow
 * `SessionReader` so a drift in better-auth's session shape fails typecheck
 * instead of passing tests and failing at runtime.
 */
export const authWithSession = (user: SessionUser): SessionReader => ({
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
        name: user.name,
        email: "test@example.com",
        emailVerified: true,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        role: user.role,
        organizationId: user.organizationId,
      },
    }),
  },
});

export const authWithoutSession = (): SessionReader => ({
  api: {
    getSession: async () => null,
  },
});

/** One statement the router sent to Postgres, with its bound parameters. */
export interface RecordedQuery {
  readonly sql: string;
  readonly params: readonly unknown[];
}

export interface FakeDatabase {
  readonly db: Database;
  readonly queries: readonly RecordedQuery[];
  /**
   * Rows a statement resolves to, positional to match the columns the router
   * selected. Queued in call order and consumed one entry per statement.
   */
  readonly queueRows: (rows: readonly (readonly unknown[])[]) => void;
}

/**
 * Stands in for the Neon HTTP client. Drizzle still compiles real SQL against
 * the real schema, so a test can assert on the WHERE clause and the bound
 * parameters the router actually sends. That is where org scoping lives, so it
 * is the part worth pinning down without a live database.
 */
export const fakeDatabase = (): FakeDatabase => {
  const queries: RecordedQuery[] = [];
  const pending: (readonly (readonly unknown[])[])[] = [];

  const send = async (
    sql: string,
    params: readonly unknown[],
  ): Promise<{ rows: readonly (readonly unknown[])[] }> => {
    queries.push({ sql, params });
    const rows = pending.shift() ?? [];
    return { rows };
  };

  // The driver calls `client.query(sql, params, config)`; the tagged-template
  // form is the same callable, so both entry points share one recorder.
  const client = Object.assign(send, { query: send }) as unknown as NeonQueryFunction<false, false>;

  return {
    db: drizzle(client, { schema: appSchema }),
    queries,
    queueRows: (rows) => {
      pending.push(rows);
    },
  };
};

export const sessionHeaders = new Headers();

/** Column order of the router's ticket select, for positional fake rows. */
export const ticketColumns = [
  "id",
  "title",
  "description",
  "reporterName",
  "status",
  "priority",
  "escalated",
  "escalatedReason",
  "organizationId",
  "organizationName",
  "productId",
  "productName",
  "assignedTo",
  "createdAt",
] as const;

/** Builds a fake ticket row in the order the router selects the columns. */
export const ticketRow = (
  overrides: Partial<Record<(typeof ticketColumns)[number], unknown>> = {},
): readonly unknown[] => {
  const values: Record<(typeof ticketColumns)[number], unknown> = {
    id: "ticket-1",
    title: "Conveyor belt stops mid-cycle",
    description: "The line halts after roughly twenty minutes of runtime.",
    reporterName: "Dana Okafor",
    status: "open",
    priority: "low",
    escalated: false,
    escalatedReason: null,
    organizationId: "org-acme",
    organizationName: "Acme Manufacturing",
    productId: "prod-line-9",
    productName: "Line 9 Controller",
    assignedTo: null,
    createdAt: new Date("2026-03-04T09:15:00Z"),
    ...overrides,
  };

  return ticketColumns.map((column) => values[column]);
};

/** Column order of the message select, for positional fake rows. */
export const messageColumns = ["id", "authorId", "content", "visibility", "createdAt"] as const;

/** Builds a fake message row in the order the router selects the columns. */
export const messageRow = (
  overrides: Partial<Record<(typeof messageColumns)[number], unknown>> = {},
): readonly unknown[] => {
  const values: Record<(typeof messageColumns)[number], unknown> = {
    id: "message-1",
    authorId: "test-user-id",
    content: "Looking into the controller logs now.",
    visibility: "public",
    createdAt: new Date("2026-03-04T10:00:00Z"),
    ...overrides,
  };

  return messageColumns.map((column) => values[column]);
};

export type { RouterSession };
