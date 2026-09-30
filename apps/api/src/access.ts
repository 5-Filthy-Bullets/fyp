import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { userRole } from "./db/schema";
import type { RouterSession } from "./router";

/** Single source of truth for roles: the Postgres enum the user table uses. */
export const roleSchema = z.enum(userRole.enumValues);
export type Role = z.infer<typeof roleSchema>;

/**
 * Role plus org, read off the session. Vendor staff (admin, technician) have
 * no organization, so `organizationId` is null for them and set for clients.
 */
export interface Caller {
  readonly userId: string;
  readonly role: Role;
  readonly organizationId: string | null;
}

/**
 * A caller that is known to belong to an org. Narrowing the field to `string`
 * here is what lets the client procedures scope a query without a `?? ""`
 * fallback that would silently widen the result set.
 */
export interface OrgCaller extends Caller {
  readonly organizationId: string;
}

const callerSchema = z.object({
  userId: z.string().min(1),
  role: roleSchema,
  organizationId: z.string().min(1).nullable(),
});

/**
 * Sessions come from Postgres, so the role and org are re-validated here
 * instead of trusted from the session shape. A row with a role outside the
 * enum (a bad manual edit, a stale deploy) yields FORBIDDEN rather than
 * silently falling through to a weaker role.
 */
export const readCaller = (session: RouterSession): Caller => {
  const parsed = callerSchema.safeParse({
    userId: session.user.id,
    role: session.user.role,
    organizationId: session.user.organizationId,
  });

  if (!parsed.success) {
    throw new ORPCError("FORBIDDEN", {
      // Only the failing field paths, never the values: a bad role or org id
      // is not something the caller needs to see, and messages reach logs.
      message: `Your account has an unusable ${parsed.error.issues
        .map((issue) => issue.path.join("."))
        .join(", ")}.`,
    });
  }

  return parsed.data;
};

/**
 * Client-scoped caller. A client with no org cannot file or read anything, so
 * the procedure fails loudly instead of running an unscoped query.
 */
export const requireClientCaller = (session: RouterSession): OrgCaller => {
  const caller = readCaller(session);

  if (caller.role !== "client") {
    throw new ORPCError("FORBIDDEN", {
      message: "Only client accounts can use this endpoint.",
    });
  }

  if (caller.organizationId === null) {
    throw new ORPCError("FORBIDDEN", {
      message: "Your account is not linked to an organization yet.",
    });
  }

  return { ...caller, organizationId: caller.organizationId };
};

export const requireStaffCaller = (session: RouterSession): Caller => {
  const caller = readCaller(session);

  if (caller.role !== "admin" && caller.role !== "technician") {
    throw new ORPCError("FORBIDDEN", {
      message: "Only vendor staff can use this endpoint.",
    });
  }

  return caller;
};
