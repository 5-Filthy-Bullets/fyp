import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { user, type userRole } from "../db/schema";

type Role = (typeof userRole.enumValues)[number];

export interface RecipientFilter {
  readonly organizationId?: string;
  readonly roles?: ReadonlyArray<Role>;
}

/**
 * Active addresses for a group of users. Banned accounts never receive
 * mail; an empty filter reaches every active account.
 */
export const listActiveEmails = async (
  db: Database,
  filter: RecipientFilter = {},
): Promise<string[]> => {
  const conditions = [
    eq(user.banned, false),
    ...(filter.organizationId === undefined
      ? []
      : [eq(user.organizationId, filter.organizationId)]),
    ...(filter.roles === undefined || filter.roles.length === 0
      ? []
      : [inArray(user.role, [...filter.roles])]),
  ];

  const rows = await db
    .select({ email: user.email })
    .from(user)
    .where(and(...conditions));

  return rows.map((row) => row.email);
};

/** One active address, or null when the account is gone or banned. */
export const getActiveUserEmail = async (db: Database, userId: string): Promise<string | null> => {
  const [row] = await db
    .select({ email: user.email, banned: user.banned })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!row || row.banned) {
    return null;
  }
  return row.email;
};
