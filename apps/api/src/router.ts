import { ORPCError, os } from "@orpc/server";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  assertCallerActive,
  readCaller,
  requireAdminCaller,
  requireClientCaller,
  requireStaffCaller,
  type Caller,
} from "./access";
import type { Auth } from "./auth";
import type { Database } from "./db/client";
import {
  messageVisibility,
  organization,
  orgProduct,
  product,
  session,
  ticket,
  ticketMessage,
  ticketPriority,
  ticketStatus,
  user,
  userRole,
} from "./db/schema";

/** Session value the router reads, inferred from the real Auth type. */
export type RouterSession = Auth["$Infer"]["Session"];

/**
 * Narrow auth surface the router consumes. Full `Auth` satisfies this,
 * so production still passes `createAuth()` straight through.
 */
/** Minimal shape of the sign-up response the router reads back. */
interface SignUpResult {
  readonly user: { readonly id: string };
}

export interface SessionReader {
  readonly api: {
    readonly getSession: (input: { readonly headers: Headers }) => Promise<RouterSession | null>;
    readonly signUpEmail: (input: {
      readonly body: { readonly email: string; readonly name: string; readonly password: string };
    }) => Promise<SignUpResult>;
  };
}

export interface RpcContext {
  readonly headers: Headers;
  readonly auth: SessionReader;
  readonly db: Database;
}

const protectedProcedure = os.$context<RpcContext>().use(async ({ context, next }) => {
  const session = await context.auth.api.getSession({
    headers: context.headers,
  });

  if (!session) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return next({ context: { ...context, session } });
});

/** Any signed-in account, with the role and org validated off the session. */
const callerProcedure = protectedProcedure.use(async ({ context, next }) => {
  const caller = readCaller(context.session);
  await assertCallerActive(context.db, caller);
  return next({ context: { ...context, caller } });
});

/** Clients only. The org is read from the session, never from input. */
const clientProcedure = protectedProcedure.use(async ({ context, next }) => {
  const caller = requireClientCaller(context.session);
  await assertCallerActive(context.db, caller);
  return next({ context: { ...context, caller } });
});

/** Vendor staff, who work across every client org. */
const staffProcedure = protectedProcedure.use(async ({ context, next }) => {
  const caller = requireStaffCaller(context.session);
  await assertCallerActive(context.db, caller);
  return next({ context: { ...context, caller } });
});

/**
 * Admins only, with the account re-checked against the database. The session
 * carries the role, but a ban or org suspension can land after the session
 * is written, so the check runs per call instead of trusting cached data.
 */
const adminProcedure = protectedProcedure.use(async ({ context, next }) => {
  const caller = requireAdminCaller(context.session);
  await assertCallerActive(context.db, caller);
  return next({ context: { ...context, caller } });
});

const productOutput = z.object({
  id: z.string().describe("Product id"),
  name: z.string().describe("Product display name"),
  slug: z.string().describe("URL-safe product identifier"),
});

const callerOutput = z.object({
  userId: z.string().describe("Session user id"),
  role: z.enum(userRole.enumValues).describe("Role the session was granted"),
  organizationId: z.string().nullable().describe("Client org id, null for vendor staff"),
});

const ticketOutput = z.object({
  id: z.string().describe("Ticket id"),
  title: z.string().describe("Short summary of the problem"),
  description: z.string().describe("Full detail from the reporter"),
  reporterName: z.string().describe("Name of the person who filed it"),
  status: z.enum(ticketStatus.enumValues).describe("Current ticket status"),
  priority: z.enum(ticketPriority.enumValues).describe("Filing urgency, adjustable by staff"),
  escalated: z.boolean().describe("True once staff flag the ticket for admin review"),
  escalatedReason: z
    .string()
    .nullable()
    .describe("Why the ticket was escalated, null until escalated"),
  organizationId: z.string().describe("Owning client organization id"),
  organizationName: z.string().describe("Owning client organization name"),
  productId: z.string().describe("Product the ticket is about"),
  productName: z.string().describe("Product display name"),
  assignedTo: z.string().nullable().describe("Staff user id, null when unclaimed"),
  createdAt: z.string().describe("ISO 8601 creation timestamp"),
});

const messageOutput = z.object({
  id: z.string().describe("Message id"),
  authorId: z.string().nullable().describe("Author user id, null when the account is gone"),
  content: z.string().describe("Reply or note text"),
  visibility: z.enum(messageVisibility.enumValues).describe("public replies vs staff-only notes"),
  createdAt: z.string().describe("ISO 8601 creation timestamp"),
});

const ticketDetailOutput = z.object({
  ticket: ticketOutput,
  messages: z.array(messageOutput).describe("Replies oldest first, visibility-filtered by role"),
});

const userOutput = z.object({
  id: z.string().describe("User id"),
  name: z.string().describe("Display name"),
  email: z.string().describe("Sign-in email"),
  role: z.enum(userRole.enumValues).describe("Account role"),
  organizationId: z.string().nullable().describe("Client org id, null for vendor staff"),
  organizationName: z.string().nullable().describe("Client org name, null for vendor staff"),
  banned: z.boolean().describe("True once an admin deactivates the account"),
  createdAt: z.string().describe("ISO 8601 creation timestamp"),
});

const orgOutput = z.object({
  id: z.string().describe("Organization id"),
  name: z.string().describe("Company display name"),
  slug: z.string().describe("URL-safe company identifier"),
  isActive: z.boolean().describe("False once an admin suspends the company"),
  memberCount: z.number().describe("Users linked to this organization"),
  productCount: z.number().describe("Products this organization can file against"),
});

const orgDetailOutput = orgOutput.extend({
  productIds: z.array(z.string()).describe("Entitled product ids"),
});

/** Search plus paging the admin lists share. Small caps keep it yagni. */
const adminListInput = {
  search: z
    .string()
    .trim()
    .max(120)
    .optional()
    .describe("Matches name or email (users) or name (orgs, products)"),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Rows per page"),
  offset: z.coerce.number().int().min(0).default(0).describe("Rows to skip"),
};

const lifecycleMessage = (active: boolean, noun: string): string =>
  active ? `${noun} reactivated.` : `${noun} deactivated. Existing sessions are dropped.`;

type UserJoin = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: (typeof userRole.enumValues)[number];
  readonly organizationId: string | null;
  readonly organizationName: string | null;
  readonly banned: boolean;
  readonly createdAt: Date;
};

/** One account by id, with the org name resolved. */
const selectUserById = async (db: Database, userId: string): Promise<UserJoin | undefined> => {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: organization.name,
      banned: user.banned,
      createdAt: user.createdAt,
    })
    .from(user)
    .leftJoin(organization, eq(user.organizationId, organization.id))
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0];
};

const toUserOutput = (row: UserJoin) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  organizationId: row.organizationId,
  organizationName: row.organizationName,
  banned: row.banned,
  createdAt: row.createdAt.toISOString(),
});

/** User list with the org name resolved, so the page needs no second query. */
const selectUsers = async (
  db: Database,
  filter: { readonly role?: "technician" | "client"; readonly search?: string },
): Promise<UserJoin[]> => {
  const needle = filter.search?.trim();
  const conditions = [
    ...(filter.role === undefined ? [] : [eq(user.role, filter.role)]),
    ...(needle === undefined || needle === ""
      ? []
      : [or(ilike(user.name, `%${needle}%`), ilike(user.email, `%${needle}%`))]),
  ];

  const base = db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: organization.name,
      banned: user.banned,
      createdAt: user.createdAt,
    })
    .from(user)
    .leftJoin(organization, eq(user.organizationId, organization.id))
    .orderBy(desc(user.createdAt));

  return conditions.length > 0 ? base.where(and(...conditions)) : base;
};

const emailInput = z
  .email("Enter a valid email address.")
  .transform((value) => value.toLowerCase());

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/**
 * Creates the account through the same public sign-up that writes the
 * credential row (scrypt hash better-auth verifies at sign-in), then stamps
 * the server-owned role and org onto that row. Public sign-up can never set
 * those fields itself (`input: false` in auth.ts), so writing them here is
 * what keeps admin-created accounts in the same shape as seeded ones.
 */
const insertCredentialUser = async (
  db: Database,
  auth: SessionReader,
  input: {
    readonly name: string;
    readonly email: string;
    readonly password: string;
    readonly role: "technician" | "client";
    readonly organizationId: string | null;
  },
): Promise<string> => {
  const created = await auth.api.signUpEmail({
    body: { email: input.email, name: input.name, password: input.password },
  });
  const id = created.user.id;

  await db
    .update(user)
    .set({ role: input.role, organizationId: input.organizationId })
    .where(eq(user.id, id));

  return id;
};

/**
 * Reads a better-auth failure without importing its error class. The admin
 * procedures translate duplicate-email and validation failures into oRPC
 * errors the UI can show, and anything else becomes a generic failure so
 * password hashes and driver messages never reach the client.
 */
const toAdminError = (error: unknown, fallback: string): ORPCError<string, unknown> => {
  if (typeof error === "object" && error !== null && "body" in error) {
    const body = (error as { body?: { code?: unknown; message?: unknown } }).body;
    const code = typeof body?.code === "string" ? body.code : undefined;
    if (code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
      return new ORPCError("CONFLICT", { message: "That email is already registered." });
    }
    if (typeof body?.message === "string" && body.message.length > 0) {
      return new ORPCError("BAD_REQUEST", { message: body.message });
    }
  }
  if (error instanceof ORPCError) {
    return error;
  }
  return new ORPCError("INTERNAL_SERVER_ERROR", { message: fallback });
};

export const adminProductRouter = {
  /**
   * Full catalog for the admin entitlement editor. Clients use
   * product.listForOrg; this one lists every product with its link count.
   */
  list: adminProcedure
    .route({
      method: "GET",
      path: "/admin/products",
      summary: "List every product with entitlement counts",
      description:
        "Admin catalog view. Returns all products with the number of organizations entitled to each, so the entitlement editor can show coverage.",
      tags: ["Admin"],
    })
    .input(z.object(adminListInput))
    .output(
      z.object({
        products: z.array(
          productOutput.extend({
            organizationCount: z.number().describe("Orgs entitled to this product"),
          }),
        ),
        total: z.number().describe("Products matching the search"),
      }),
    )
    .handler(async ({ context, input }) => {
      const needle = input.search?.trim();
      const conditions = [
        ...(needle === undefined || needle === "" ? [] : [ilike(product.name, `%${needle}%`)]),
      ];

      const base = context.db
        .select({
          id: product.id,
          name: product.name,
          slug: product.slug,
        })
        .from(product)
        .orderBy(asc(product.name));

      const rows = conditions.length > 0 ? await base.where(and(...conditions)) : await base;

      const links = await context.db.select({ productId: orgProduct.productId }).from(orgProduct);
      const counts = new Map<string, number>();
      for (const link of links) {
        counts.set(link.productId, (counts.get(link.productId) ?? 0) + 1);
      }

      const products = rows
        .map((row) => ({
          ...row,
          organizationCount: counts.get(row.id) ?? 0,
        }))
        .slice(input.offset, input.offset + input.limit);

      return { products, total: rows.length };
    }),

  create: adminProcedure
    .route({
      method: "POST",
      path: "/admin/products",
      summary: "Create a product",
      description:
        "Adds a product to the catalog. The slug defaults to a slugified name when omitted, and must stay unique.",
      tags: ["Admin"],
      successStatus: 201,
    })
    .input(
      z.object({
        name: z.string().trim().min(2).max(120).describe("Product display name"),
        slug: z
          .string()
          .trim()
          .min(2)
          .max(80)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, digits, and dashes.")
          .optional()
          .describe("URL-safe identifier, slugified from the name when omitted"),
      }),
    )
    .output(z.object({ product: productOutput }))
    .handler(async ({ context, input }) => {
      const slug = input.slug ?? slugify(input.name);
      if (slug === "") {
        throw new ORPCError("BAD_REQUEST", {
          message: "The name needs a letter or digit so a slug can be built from it.",
        });
      }

      const existing = await context.db
        .select({ id: product.id })
        .from(product)
        .where(eq(product.slug, slug))
        .limit(1);
      if (existing.length > 0) {
        throw new ORPCError("CONFLICT", { message: "That product slug is already taken." });
      }

      const [created] = await context.db
        .insert(product)
        .values({ id: crypto.randomUUID(), name: input.name, slug })
        .returning();
      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "The product could not be saved.",
        });
      }

      return { product: { id: created.id, name: created.name, slug: created.slug } };
    }),
};

export const productRouter = {
  listForOrg: clientProcedure
    .route({
      method: "GET",
      path: "/products",
      summary: "List products for my organization",
      description:
        "Returns only the products linked to the caller's organization. The organization is taken from the session, so a client cannot ask for another org's catalog.",
      tags: ["Products"],
    })
    .output(z.object({ products: z.array(productOutput) }))
    .handler(async ({ context }) => {
      const rows = await context.db
        .select({
          id: product.id,
          name: product.name,
          slug: product.slug,
        })
        .from(orgProduct)
        .innerJoin(product, eq(orgProduct.productId, product.id))
        .where(eq(orgProduct.organizationId, context.caller.organizationId));

      return { products: rows };
    }),
};

export const ticketRouter = {
  create: clientProcedure
    .route({
      method: "POST",
      path: "/tickets",
      summary: "File a support ticket",
      description:
        "Creates a ticket scoped to the caller's organization. The product must be linked to that organization, so a client cannot file against a product it does not own.",
      tags: ["Tickets"],
      successStatus: 201,
    })
    .input(
      z.object({
        productId: z.string().min(1).describe("Product the problem is about"),
        title: z.string().trim().min(3).max(120).describe("Short summary"),
        description: z
          .string()
          .trim()
          .min(10)
          .max(4000)
          .describe("What happened, and what was expected"),
        reporterName: z
          .string()
          .trim()
          .min(2)
          .max(80)
          .describe("Name of the person reporting the problem"),
        priority: z
          .enum(ticketPriority.enumValues)
          .default("low")
          .describe("Filing urgency, low unless the reporter says otherwise"),
      }),
    )
    .output(z.object({ ticket: ticketOutput }))
    .handler(async ({ context, input }) => {
      const { organizationId } = context.caller;

      const ownsProduct = await context.db
        .select({ productId: orgProduct.productId })
        .from(orgProduct)
        .where(
          and(
            eq(orgProduct.organizationId, organizationId),
            eq(orgProduct.productId, input.productId),
          ),
        )
        .limit(1);

      if (ownsProduct.length === 0) {
        throw new ORPCError("FORBIDDEN", {
          message: "That product is not available to your organization.",
        });
      }

      const [created] = await context.db
        .insert(ticket)
        .values({
          id: crypto.randomUUID(),
          organizationId,
          productId: input.productId,
          title: input.title,
          description: input.description,
          reporterName: input.reporterName,
          priority: input.priority,
        })
        .returning();

      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "The ticket could not be saved.",
        });
      }

      const rows = await selectTickets(context.db, { ticketId: created.id });
      const saved = rows[0];

      if (!saved) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "The ticket was saved but could not be read back.",
        });
      }

      return { ticket: toTicketOutput(saved) };
    }),

  listMine: clientProcedure
    .route({
      method: "GET",
      path: "/tickets/mine",
      summary: "List my organization's tickets",
      description:
        "Client inbox. Returns only the tickets filed under the caller's organization, newest first. The organization is taken from the session, so a client cannot read another org's tickets.",
      tags: ["Tickets"],
    })
    .output(z.object({ tickets: z.array(ticketOutput) }))
    .handler(async ({ context }) => {
      const rows = await selectTickets(context.db, {
        organizationId: context.caller.organizationId,
      });

      return { tickets: rows.map(toTicketOutput) };
    }),

  list: staffProcedure
    .route({
      method: "GET",
      path: "/tickets",
      summary: "List tickets across all client organizations",
      description:
        "Vendor staff queue. Returns every ticket newest first with the org and product resolved. Pass organizationId to narrow to one client, and escalatedOnly to show only the tickets flagged for admin review.",
      tags: ["Tickets"],
    })
    .input(
      z.object({
        organizationId: z
          .string()
          .min(1)
          .optional()
          .describe("Optional client organization filter"),
        escalatedOnly: z.boolean().optional().describe("Only tickets escalated for admin review"),
      }),
    )
    .output(z.object({ tickets: z.array(ticketOutput) }))
    .handler(async ({ context, input }) => {
      const rows = await selectTickets(context.db, {
        ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
        ...(input.escalatedOnly === true ? { escalatedOnly: true } : {}),
      });

      return { tickets: rows.map(toTicketOutput) };
    }),

  /**
   * One endpoint for the detail page's right-rail actions: an optional
   * status move plus an optional priority change in one write. The claim
   * behavior stays untouched: whoever is already assigned keeps the ticket.
   */
  setStatus: staffProcedure
    .route({
      method: "PATCH",
      path: "/tickets/{ticketId}/status",
      summary: "Claim a ticket, change its status, or adjust its priority",
      description:
        "Moves a ticket to a new status and optionally changes its priority. Claims an unassigned ticket for the caller, and leaves an existing owner alone so a second technician cannot silently steal a claimed ticket. There are no status-transition guards, so any status can move to any other.",
      tags: ["Tickets"],
    })
    .input(
      z.object({
        ticketId: z.string().min(1).describe("Ticket to update"),
        status: z.enum(ticketStatus.enumValues).optional().describe("Status to move the ticket to"),
        priority: z
          .enum(ticketPriority.enumValues)
          .optional()
          .describe("Priority to set on the ticket"),
      }),
    )
    .output(z.object({ ticket: ticketOutput }))
    .handler(async ({ context, input }) => {
      if (input.status === undefined && input.priority === undefined) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Pass a status, a priority, or both.",
        });
      }

      const [updated] = await context.db
        .update(ticket)
        .set({
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.priority === undefined ? {} : { priority: input.priority }),
          // Fills an empty slot only. Overwriting would let whoever touched the
          // status last silently take over a ticket someone else already claimed.
          assignedTo: sql`coalesce(${ticket.assignedTo}, ${context.caller.userId})`,
        })
        .where(eq(ticket.id, input.ticketId))
        .returning();

      if (!updated) {
        throw new ORPCError("NOT_FOUND", {
          message: "That ticket does not exist.",
        });
      }

      const rows = await selectTickets(context.db, { ticketId: input.ticketId });
      const changed = rows[0];

      if (!changed) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "The ticket was updated but could not be read back.",
        });
      }

      return { ticket: toTicketOutput(changed) };
    }),

  assign: staffProcedure
    .route({
      method: "PATCH",
      path: "/tickets/{ticketId}/assignee",
      summary: "Assign a ticket to a technician",
      description:
        "Explicitly hands a ticket to a chosen technician. The assignee must be a vendor staff account with the technician role, so a client or admin account cannot end up owning queue work.",
      tags: ["Tickets"],
    })
    .input(
      z.object({
        ticketId: z.string().min(1).describe("Ticket to assign"),
        assigneeId: z.string().min(1).describe("Technician user id to own the ticket"),
      }),
    )
    .output(z.object({ ticket: ticketOutput }))
    .handler(async ({ context, input }) => {
      const [assignee] = await context.db
        .select({ id: user.id, role: user.role, banned: user.banned })
        .from(user)
        .where(eq(user.id, input.assigneeId))
        .limit(1);

      if (!assignee || assignee.role !== "technician" || assignee.banned) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That account is not an active technician.",
        });
      }

      const [updated] = await context.db
        .update(ticket)
        .set({ assignedTo: input.assigneeId })
        .where(eq(ticket.id, input.ticketId))
        .returning();

      if (!updated) {
        throw new ORPCError("NOT_FOUND", {
          message: "That ticket does not exist.",
        });
      }

      const rows = await selectTickets(context.db, { ticketId: input.ticketId });
      const changed = rows[0];

      if (!changed) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "The ticket was updated but could not be read back.",
        });
      }

      return { ticket: toTicketOutput(changed) };
    }),

  /**
   * Assignee picker for the detail page's Actions card. Every active
   * technician, name-sorted, so staff can search by name, email, or id
   * instead of pasting a raw user id. Staff-wide because technicians assign
   * too; banned accounts are excluded because assign rejects them.
   */
  listTechnicians: staffProcedure
    .route({
      method: "GET",
      path: "/tickets/technicians",
      summary: "List active technicians for the assignee picker",
      description:
        "Every vendor technician account that can own queue work, name-sorted. Banned accounts are excluded because assigning to them fails.",
      tags: ["Tickets"],
    })
    .input(z.object({}))
    .output(
      z.object({
        technicians: z.array(
          z.object({
            id: z.string().describe("Technician user id"),
            name: z.string().describe("Technician display name"),
            email: z.string().describe("Technician sign-in email"),
          }),
        ),
      }),
    )
    .handler(async ({ context }) => {
      const rows = await context.db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(and(eq(user.role, "technician"), eq(user.banned, false)))
        .orderBy(asc(user.name));

      return { technicians: rows };
    }),

  escalate: staffProcedure
    .route({
      method: "PATCH",
      path: "/tickets/{ticketId}/escalation",
      summary: "Flag a ticket for admin review",
      description:
        "Marks a ticket escalated with a short reason. The admin dashboard's escalated view reads this flag, so a raised ticket shows up there immediately.",
      tags: ["Tickets"],
    })
    .input(
      z.object({
        ticketId: z.string().min(1).describe("Ticket to escalate"),
        reason: z.string().trim().min(3).max(500).describe("Why the ticket needs admin review"),
      }),
    )
    .output(z.object({ ticket: ticketOutput }))
    .handler(async ({ context, input }) => {
      const [updated] = await context.db
        .update(ticket)
        .set({ escalated: true, escalatedReason: input.reason })
        .where(eq(ticket.id, input.ticketId))
        .returning();

      if (!updated) {
        throw new ORPCError("NOT_FOUND", {
          message: "That ticket does not exist.",
        });
      }

      const rows = await selectTickets(context.db, { ticketId: input.ticketId });
      const changed = rows[0];

      if (!changed) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "The ticket was updated but could not be read back.",
        });
      }

      return { ticket: toTicketOutput(changed) };
    }),

  /**
   * The detail page's single read: ticket plus its messages, with the message
   * list filtered by caller role. Clients 404 on other-org tickets so the
   * response never leaks that a ticket exists.
   */
  get: callerProcedure
    .route({
      method: "GET",
      path: "/tickets/{ticketId}",
      summary: "Read one ticket with its messages",
      description:
        "Ticket detail. Returns the ticket plus its message thread oldest first. Staff see every message; clients see only public replies. Clients asking for another org's ticket get not-found rather than forbidden, so the response never leaks that the ticket exists.",
      tags: ["Tickets"],
    })
    .input(z.object({ ticketId: z.string().min(1).describe("Ticket to read") }))
    .output(ticketDetailOutput)
    .handler(async ({ context, input }) => {
      const rows = await selectTickets(context.db, { ticketId: input.ticketId });
      const found = rows[0];

      if (!found) {
        throw new ORPCError("NOT_FOUND", {
          message: "That ticket does not exist.",
        });
      }

      const caller = context.caller;
      const isStaff = caller.role === "admin" || caller.role === "technician";

      if (!isStaff && found.organizationId !== caller.organizationId) {
        throw new ORPCError("NOT_FOUND", {
          message: "That ticket does not exist.",
        });
      }

      const visibility = isStaff ? undefined : { visibility: "public" as const };
      const messages = await selectMessages(context.db, {
        ticketId: input.ticketId,
        ...visibility,
      });

      return { ticket: toTicketOutput(found), messages };
    }),

  listMessages: callerProcedure
    .route({
      method: "GET",
      path: "/tickets/{ticketId}/messages",
      summary: "List messages on a ticket",
      description:
        "Message thread oldest first. Staff see every message including internal notes; clients see only public replies. Clients asking for another org's ticket get not-found rather than forbidden.",
      tags: ["Tickets"],
    })
    .input(z.object({ ticketId: z.string().min(1).describe("Ticket to read") }))
    .output(z.object({ messages: z.array(messageOutput) }))
    .handler(async ({ context, input }) => {
      const found = await loadTicketForCaller(context.db, context.caller, input.ticketId);
      const isStaff = context.caller.role === "admin" || context.caller.role === "technician";

      const messages = await selectMessages(context.db, {
        ticketId: found.id,
        ...(isStaff ? {} : { visibility: "public" as const }),
      });

      return { messages };
    }),

  postMessage: callerProcedure
    .route({
      method: "POST",
      path: "/tickets/{ticketId}/messages",
      summary: "Reply on a ticket",
      description:
        "Posts a public reply or, for staff only, an internal note. Clients can only touch their own org's tickets; posting internal as a client is rejected.",
      tags: ["Tickets"],
      successStatus: 201,
    })
    .input(
      z.object({
        ticketId: z.string().min(1).describe("Ticket to reply to"),
        content: z.string().trim().min(1).max(4000).describe("Reply or note text"),
        visibility: z
          .enum(messageVisibility.enumValues)
          .default("public")
          .describe("public reply or internal staff note"),
      }),
    )
    .output(z.object({ message: messageOutput }))
    .handler(async ({ context, input }) => {
      const caller = context.caller;
      const isStaff = caller.role === "admin" || caller.role === "technician";

      if (!isStaff && input.visibility === "internal") {
        throw new ORPCError("FORBIDDEN", {
          message: "Only vendor staff can post internal notes.",
        });
      }

      await loadTicketForCaller(context.db, caller, input.ticketId);

      const [created] = await context.db
        .insert(ticketMessage)
        .values({
          id: crypto.randomUUID(),
          ticketId: input.ticketId,
          authorId: caller.userId,
          content: input.content,
          visibility: input.visibility,
        })
        .returning();

      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "The reply could not be saved.",
        });
      }

      return {
        message: {
          id: created.id,
          authorId: created.authorId,
          content: created.content,
          visibility: created.visibility,
          createdAt: created.createdAt.toISOString(),
        },
      };
    }),
};

/**
 * Ticket filters for the single read path. The optional keys are mutually
 * independent; an empty filter is the full staff queue.
 */
type TicketFilter = {
  readonly organizationId?: string;
  readonly ticketId?: string;
  readonly escalatedOnly?: true;
};

/**
 * Loads one ticket the caller is allowed to see. Clients asking for another
 * org's ticket get NOT_FOUND, never FORBIDDEN, so the response never leaks
 * that the ticket exists.
 */
const loadTicketForCaller = async (
  db: Database,
  caller: Caller,
  ticketId: string,
): Promise<TicketJoin> => {
  const rows = await selectTickets(db, { ticketId });
  const found = rows[0];

  if (!found) {
    throw new ORPCError("NOT_FOUND", {
      message: "That ticket does not exist.",
    });
  }

  const isStaff = caller.role === "admin" || caller.role === "technician";

  if (!isStaff && found.organizationId !== caller.organizationId) {
    throw new ORPCError("NOT_FOUND", {
      message: "That ticket does not exist.",
    });
  }

  return found;
};

/** Row shape straight from the join, before the wire conversion. */
type TicketJoin = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly reporterName: string;
  readonly status: (typeof ticketStatus.enumValues)[number];
  readonly priority: (typeof ticketPriority.enumValues)[number];
  readonly escalated: boolean;
  readonly escalatedReason: string | null;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly productId: string;
  readonly productName: string;
  readonly assignedTo: string | null;
  readonly createdAt: Date;
};

/** Timestamps cross the wire as ISO strings, so the UI never parses Dates. */
const toTicketOutput = (row: TicketJoin) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  reporterName: row.reporterName,
  status: row.status,
  priority: row.priority,
  escalated: row.escalated,
  escalatedReason: row.escalatedReason,
  organizationId: row.organizationId,
  organizationName: row.organizationName,
  productId: row.productId,
  productName: row.productName,
  assignedTo: row.assignedTo,
  createdAt: row.createdAt.toISOString(),
});

/** Resolves org and product names so the staff list needs no second roundtrip. */
const selectTickets = async (db: Database, filter: TicketFilter): Promise<TicketJoin[]> => {
  const conditions = [
    ...(filter.organizationId === undefined
      ? []
      : [eq(ticket.organizationId, filter.organizationId)]),
    ...(filter.ticketId === undefined ? [] : [eq(ticket.id, filter.ticketId)]),
    ...(filter.escalatedOnly === undefined ? [] : [eq(ticket.escalated, true)]),
  ];

  const base = db
    .select({
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      reporterName: ticket.reporterName,
      status: ticket.status,
      priority: ticket.priority,
      escalated: ticket.escalated,
      escalatedReason: ticket.escalatedReason,
      organizationId: ticket.organizationId,
      organizationName: organization.name,
      productId: ticket.productId,
      productName: product.name,
      assignedTo: ticket.assignedTo,
      createdAt: ticket.createdAt,
    })
    .from(ticket)
    .innerJoin(organization, eq(ticket.organizationId, organization.id))
    .innerJoin(product, eq(ticket.productId, product.id))
    .orderBy(desc(ticket.createdAt));

  return conditions.length > 0 ? base.where(and(...conditions)) : base;
};

/** Message filters for the thread read. Visibility unset means every message. */
type MessageFilter = {
  readonly ticketId: string;
  readonly visibility?: "public";
};

/** Message thread oldest first, so the detail page reads like a conversation. */
const selectMessages = async (db: Database, filter: MessageFilter) => {
  const conditions = [
    eq(ticketMessage.ticketId, filter.ticketId),
    ...(filter.visibility === undefined ? [] : [eq(ticketMessage.visibility, filter.visibility)]),
  ];

  const rows = await db
    .select({
      id: ticketMessage.id,
      authorId: ticketMessage.authorId,
      content: ticketMessage.content,
      visibility: ticketMessage.visibility,
      createdAt: ticketMessage.createdAt,
    })
    .from(ticketMessage)
    .where(and(...conditions))
    .orderBy(asc(ticketMessage.createdAt));

  return rows.map((row) => ({
    id: row.id,
    authorId: row.authorId,
    content: row.content,
    visibility: row.visibility,
    createdAt: row.createdAt.toISOString(),
  }));
};

/**
 * Everything under /admin. The procedures share the admin guard, and the
 * nested routers keep users, orgs, and products apart.
 */
export const adminUserRouter = {
  /**
   * Staff and client accounts in one list. The role filter is a fixed union
   * (technician or client), so an admin can never list fellow admins here.
   */
  list: adminProcedure
    .route({
      method: "GET",
      path: "/admin/users",
      summary: "List technician and client accounts",
      description:
        "Admin directory. Pass role=technician for vendor techs or role=client for client accounts. Matches name or email on search. Paged with limit and offset.",
      tags: ["Admin"],
    })
    .input(
      z.object({
        ...adminListInput,
        role: z.enum(["technician", "client"]).optional().describe("Filter to one manageable role"),
      }),
    )
    .output(z.object({ users: z.array(userOutput), total: z.number() }))
    .handler(async ({ context, input }) => {
      const rows = await selectUsers(context.db, {
        ...(input.role === undefined ? {} : { role: input.role }),
        ...(input.search === undefined ? {} : { search: input.search }),
      });
      const users = rows.slice(input.offset, input.offset + input.limit).map(toUserOutput);
      return { users, total: rows.length };
    }),

  /**
   * Creates a technician: staff account, no org. The password is the initial
   * one the admin hands over outside the app, so the response never echoes
   * it back.
   */
  createTechnician: adminProcedure
    .route({
      method: "POST",
      path: "/admin/technicians",
      summary: "Create a technician account",
      description:
        "Creates a vendor technician with the given name, email, and initial password. Technicians have no organization. The admin hands the password over outside the app.",
      tags: ["Admin"],
      successStatus: 201,
    })
    .input(
      z.object({
        name: z.string().trim().min(2).max(80).describe("Technician display name"),
        email: emailInput.describe("Sign-in email, unique across accounts"),
        password: z
          .string()
          .min(8)
          .max(128)
          .describe("Initial password, handed over outside the app"),
      }),
    )
    .output(z.object({ user: userOutput }))
    .handler(async ({ context, input }) => {
      const taken = await context.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, input.email))
        .limit(1);
      if (taken.length > 0) {
        throw new ORPCError("CONFLICT", { message: "That email is already registered." });
      }

      let id: string;
      try {
        id = await insertCredentialUser(context.db, context.auth, {
          name: input.name,
          email: input.email,
          password: input.password,
          role: "technician",
          organizationId: null,
        });
      } catch (error) {
        throw toAdminError(error, "The technician could not be created.");
      }

      const created = await selectUserById(context.db, id);
      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "The technician was created but could not be read back.",
        });
      }
      return { user: toUserOutput(created) };
    }),

  /**
   * One flow for a new client company: the org row, its first client user,
   * and the product entitlements, created together. Splitting those across
   * calls would leave half-made orgs behind when a step fails.
   */
  createClient: adminProcedure
    .route({
      method: "POST",
      path: "/admin/clients",
      summary: "Create a client company with its first user",
      description:
        "Creates the organization, its first client account, and the product entitlements in one flow. The admin hands the initial password over outside the app.",
      tags: ["Admin"],
      successStatus: 201,
    })
    .input(
      z.object({
        orgName: z.string().trim().min(2).max(120).describe("Company display name"),
        orgSlug: z
          .string()
          .trim()
          .min(2)
          .max(80)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, digits, and dashes.")
          .optional()
          .describe("URL-safe company identifier, slugified from the name when omitted"),
        name: z.string().trim().min(2).max(80).describe("First client display name"),
        email: emailInput.describe("First client sign-in email, unique across accounts"),
        password: z
          .string()
          .min(8)
          .max(128)
          .describe("Initial password, handed over outside the app"),
        productIds: z
          .array(z.string().min(1))
          .max(100)
          .default([])
          .describe("Products the new org may file tickets against"),
      }),
    )
    .output(z.object({ user: userOutput, organization: orgDetailOutput }))
    .handler(async ({ context, input }) => {
      const slug = input.orgSlug ?? slugify(input.orgName);
      if (slug === "") {
        throw new ORPCError("BAD_REQUEST", {
          message: "The company name needs a letter or digit so a slug can be built from it.",
        });
      }

      const orgTaken = await context.db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.slug, slug))
        .limit(1);
      if (orgTaken.length > 0) {
        throw new ORPCError("CONFLICT", { message: "That company slug is already taken." });
      }

      const emailTaken = await context.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, input.email))
        .limit(1);
      if (emailTaken.length > 0) {
        throw new ORPCError("CONFLICT", { message: "That email is already registered." });
      }

      if (input.productIds.length > 0) {
        const found = await context.db
          .select({ id: product.id })
          .from(product)
          .where(or(...input.productIds.map((productId) => eq(product.id, productId))));
        const foundIds = new Set(found.map((row) => row.id));
        const missing = input.productIds.filter((productId) => !foundIds.has(productId));
        if (missing.length > 0) {
          throw new ORPCError("BAD_REQUEST", {
            message: `Unknown products: ${missing.join(", ")}.`,
          });
        }
      }

      const orgId = crypto.randomUUID();
      await context.db.insert(organization).values({ id: orgId, name: input.orgName, slug });

      let userId: string;
      try {
        userId = await insertCredentialUser(context.db, context.auth, {
          name: input.name,
          email: input.email,
          password: input.password,
          role: "client",
          organizationId: orgId,
        });
      } catch (error) {
        await context.db.delete(organization).where(eq(organization.id, orgId));
        throw toAdminError(error, "The client account could not be created.");
      }

      for (const productId of input.productIds) {
        await context.db
          .insert(orgProduct)
          .values({ organizationId: orgId, productId })
          .onConflictDoNothing();
      }

      const created = await selectUserById(context.db, userId);
      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "The client was created but could not be read back.",
        });
      }
      return {
        user: toUserOutput(created),
        organization: {
          id: orgId,
          name: input.orgName,
          slug,
          isActive: true,
          memberCount: 1,
          productCount: input.productIds.length,
          productIds: input.productIds,
        },
      };
    }),

  /**
   * Renames an account or moves it between roles and orgs. Role moves stay
   * inside technician and client; admins cannot mint or demote fellow
   * admins from here. Clearing the org on a client is rejected, since an
   * org-less client cannot file or read anything.
   */
  update: adminProcedure
    .route({
      method: "PATCH",
      path: "/admin/users/{userId}",
      summary: "Edit an account",
      description:
        "Renames a technician or client account, and optionally moves it between the technician and client roles or into another org. Cannot touch admin accounts.",
      tags: ["Admin"],
    })
    .input(
      z.object({
        userId: z.string().min(1).describe("User to edit"),
        name: z.string().trim().min(2).max(80).optional().describe("New display name"),
        role: z
          .enum(["technician", "client"])
          .optional()
          .describe("New role, technician or client only"),
        organizationId: z
          .string()
          .min(1)
          .nullable()
          .optional()
          .describe("New org for clients, null for technicians; required when changing roles"),
      }),
    )
    .output(z.object({ user: userOutput }))
    .handler(async ({ context, input }) => {
      if (
        input.name === undefined &&
        input.role === undefined &&
        input.organizationId === undefined
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Pass a name, a role, an organization, or a mix.",
        });
      }

      const [target] = await context.db
        .select({ id: user.id, role: user.role, organizationId: user.organizationId })
        .from(user)
        .where(eq(user.id, input.userId))
        .limit(1);
      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "That account does not exist." });
      }
      if (target.role === "admin") {
        throw new ORPCError("FORBIDDEN", {
          message: "Admin accounts cannot be edited here.",
        });
      }

      const nextRole = input.role ?? target.role;
      if (nextRole !== "technician" && nextRole !== "client") {
        throw new ORPCError("FORBIDDEN", {
          message: "Admin accounts cannot be edited here.",
        });
      }

      const isRoleChange = input.role !== undefined && input.role !== target.role;
      if (isRoleChange && input.organizationId === undefined) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "When changing roles, pass the organization too: an org id for clients, null for technicians.",
        });
      }

      const nextOrg = input.organizationId === undefined ? undefined : input.organizationId;
      if (nextRole === "technician" && nextOrg !== undefined && nextOrg !== null) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Technicians have no organization. Pass null to clear it.",
        });
      }
      if (nextRole === "client" && nextOrg === null) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Clients need an organization. Move the account to an org instead.",
        });
      }
      // The write below only touches the org when the caller passes one, so
      // fall back to the stored org to catch accounts that would stay
      // stranded: a client with no org, or a technician still holding one.
      const effectiveOrg = nextOrg === undefined ? target.organizationId : nextOrg;
      if (nextRole === "client" && effectiveOrg === null) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Clients need an organization. Pass an org id with the role.",
        });
      }
      if (nextRole === "technician" && effectiveOrg !== null) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Technicians have no organization. Pass null to clear it.",
        });
      }
      if (nextOrg !== undefined && nextOrg !== null) {
        const [org] = await context.db
          .select({ id: organization.id })
          .from(organization)
          .where(eq(organization.id, nextOrg))
          .limit(1);
        if (!org) {
          throw new ORPCError("BAD_REQUEST", {
            message: "That organization does not exist.",
          });
        }
      }

      await context.db
        .update(user)
        .set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.role === undefined ? {} : { role: input.role }),
          ...(nextOrg === undefined ? {} : { organizationId: nextOrg }),
        })
        .where(eq(user.id, input.userId));

      const updated = await selectUserById(context.db, input.userId);
      if (!updated) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "The account was updated but could not be read back.",
        });
      }
      return { user: toUserOutput(updated) };
    }),

  /**
   * Deactivate or reactivate. Banning drops every live session at once, so
   * the account cannot finish what it was doing, and the sign-in hook plus
   * the per-call check keep it out until reactivated.
   */
  setActive: adminProcedure
    .route({
      method: "PATCH",
      path: "/admin/users/{userId}/active",
      summary: "Deactivate or reactivate an account",
      description:
        "Deactivating bans the account and drops its live sessions, so it cannot sign in or call the API. Reactivating lifts the ban. Admins cannot deactivate themselves.",
      tags: ["Admin"],
    })
    .input(
      z.object({
        userId: z.string().min(1).describe("User to change"),
        active: z.boolean().describe("False to deactivate, true to reactivate"),
        reason: z
          .string()
          .trim()
          .max(500)
          .optional()
          .describe("Why the account was deactivated, shown on reactivation notes"),
      }),
    )
    .output(z.object({ user: userOutput, message: z.string() }))
    .handler(async ({ context, input }) => {
      if (input.userId === context.caller.userId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "You cannot deactivate your own admin account.",
        });
      }

      const [target] = await context.db
        .select({ id: user.id, role: user.role })
        .from(user)
        .where(eq(user.id, input.userId))
        .limit(1);
      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "That account does not exist." });
      }
      if (target.role === "admin") {
        throw new ORPCError("FORBIDDEN", {
          message: "Admin accounts cannot be deactivated here.",
        });
      }

      await context.db
        .update(user)
        .set({
          banned: !input.active,
          banReason: input.active ? null : (input.reason ?? null),
          banExpires: null,
        })
        .where(eq(user.id, input.userId));

      if (!input.active) {
        await context.db.delete(session).where(eq(session.userId, input.userId));
      }

      const changed = await selectUserById(context.db, input.userId);
      if (!changed) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "The account was updated but could not be read back.",
        });
      }
      return {
        user: toUserOutput(changed),
        message: lifecycleMessage(input.active, "Account"),
      };
    }),
};

export const adminOrgRouter = {
  /** Company directory with member and entitlement counts per row. */
  list: adminProcedure
    .route({
      method: "GET",
      path: "/admin/organizations",
      summary: "List client companies",
      description:
        "Admin company directory. Matches the company name on search. Paged with limit and offset.",
      tags: ["Admin"],
    })
    .input(z.object(adminListInput))
    .output(z.object({ organizations: z.array(orgOutput), total: z.number() }))
    .handler(async ({ context, input }) => {
      const needle = input.search?.trim();
      const conditions = [
        ...(needle === undefined || needle === "" ? [] : [ilike(organization.name, `%${needle}%`)]),
      ];
      const base = context.db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          isActive: organization.isActive,
        })
        .from(organization)
        .orderBy(asc(organization.name));
      const orgs = conditions.length > 0 ? await base.where(and(...conditions)) : await base;

      const members = await context.db.select({ organizationId: user.organizationId }).from(user);
      const memberCounts = new Map<string, number>();
      for (const member of members) {
        if (member.organizationId !== null) {
          memberCounts.set(
            member.organizationId,
            (memberCounts.get(member.organizationId) ?? 0) + 1,
          );
        }
      }
      const links = await context.db.select().from(orgProduct);
      const productCounts = new Map<string, number>();
      for (const link of links) {
        productCounts.set(link.organizationId, (productCounts.get(link.organizationId) ?? 0) + 1);
      }

      const organizations = orgs.map((org) => ({
        ...org,
        memberCount: memberCounts.get(org.id) ?? 0,
        productCount: productCounts.get(org.id) ?? 0,
      }));
      return {
        organizations: organizations.slice(input.offset, input.offset + input.limit),
        total: organizations.length,
      };
    }),

  /** One company with its entitled product ids, for the entitlement editor. */
  get: adminProcedure
    .route({
      method: "GET",
      path: "/admin/organizations/{organizationId}",
      summary: "Read one client company",
      description:
        "Company detail with member and entitlement counts plus the entitled product ids the editor checks off.",
      tags: ["Admin"],
    })
    .input(z.object({ organizationId: z.string().min(1).describe("Company to read") }))
    .output(z.object({ organization: orgDetailOutput }))
    .handler(async ({ context, input }) => {
      const [org] = await context.db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          isActive: organization.isActive,
        })
        .from(organization)
        .where(eq(organization.id, input.organizationId))
        .limit(1);
      if (!org) {
        throw new ORPCError("NOT_FOUND", { message: "That company does not exist." });
      }
      const members = await context.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.organizationId, org.id));
      const links = await context.db
        .select({ productId: orgProduct.productId })
        .from(orgProduct)
        .where(eq(orgProduct.organizationId, org.id));
      return {
        organization: {
          ...org,
          memberCount: members.length,
          productCount: links.length,
          productIds: links.map((link) => link.productId),
        },
      };
    }),

  /** Rename a company. The slug stays put so ticket links never break. */
  update: adminProcedure
    .route({
      method: "PATCH",
      path: "/admin/organizations/{organizationId}",
      summary: "Rename a client company",
      description: "Changes the company display name. The slug stays unchanged.",
      tags: ["Admin"],
    })
    .input(
      z.object({
        organizationId: z.string().min(1).describe("Company to rename"),
        name: z.string().trim().min(2).max(120).describe("New company display name"),
      }),
    )
    .output(z.object({ organization: orgDetailOutput }))
    .handler(async ({ context, input }) => {
      const [updated] = await context.db
        .update(organization)
        .set({ name: input.name })
        .where(eq(organization.id, input.organizationId))
        .returning();
      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: "That company does not exist." });
      }
      const members = await context.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.organizationId, updated.id));
      const links = await context.db
        .select({ productId: orgProduct.productId })
        .from(orgProduct)
        .where(eq(orgProduct.organizationId, updated.id));
      return {
        organization: {
          id: updated.id,
          name: updated.name,
          slug: updated.slug,
          isActive: updated.isActive,
          memberCount: members.length,
          productCount: links.length,
          productIds: links.map((link) => link.productId),
        },
      };
    }),

  /**
   * Suspend or reactivate a company. Suspending flips the flag and drops
   * every member session at once; the sign-in hook and the per-call check
   * keep the whole company out until reactivated.
   */
  setActive: adminProcedure
    .route({
      method: "PATCH",
      path: "/admin/organizations/{organizationId}/active",
      summary: "Suspend or reactivate a company",
      description:
        "Suspending drops every member session at once, so the whole company loses access immediately. Reactivating restores it.",
      tags: ["Admin"],
    })
    .input(
      z.object({
        organizationId: z.string().min(1).describe("Company to change"),
        active: z.boolean().describe("False to suspend, true to reactivate"),
      }),
    )
    .output(z.object({ organization: orgDetailOutput, message: z.string() }))
    .handler(async ({ context, input }) => {
      const [updated] = await context.db
        .update(organization)
        .set({ isActive: input.active })
        .where(eq(organization.id, input.organizationId))
        .returning();
      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: "That company does not exist." });
      }
      const members = await context.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.organizationId, updated.id));
      if (!input.active) {
        for (const member of members) {
          await context.db.delete(session).where(eq(session.userId, member.id));
        }
      }
      const links = await context.db
        .select({ productId: orgProduct.productId })
        .from(orgProduct)
        .where(eq(orgProduct.organizationId, updated.id));
      return {
        organization: {
          id: updated.id,
          name: updated.name,
          slug: updated.slug,
          isActive: updated.isActive,
          memberCount: members.length,
          productCount: links.length,
          productIds: links.map((link) => link.productId),
        },
        message: lifecycleMessage(input.active, "Company"),
      };
    }),

  /**
   * Replaces the entitlement set wholesale. The UI sends the checked ids;
   * unknown ids fail the whole write so a typo never silently narrows
   * what the org can file against.
   */
  setEntitlements: adminProcedure
    .route({
      method: "PUT",
      path: "/admin/organizations/{organizationId}/products",
      summary: "Set which products a company can file against",
      description:
        "Replaces the entitlement set for one company. Unknown product ids fail the whole write. The client filing form reads this through product.listForOrg.",
      tags: ["Admin"],
    })
    .input(
      z.object({
        organizationId: z.string().min(1).describe("Company to entitle"),
        productIds: z
          .array(z.string().min(1))
          .max(100)
          .describe("Products the company may file tickets against"),
      }),
    )
    .output(z.object({ organization: orgDetailOutput }))
    .handler(async ({ context, input }) => {
      const [org] = await context.db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, input.organizationId))
        .limit(1);
      if (!org) {
        throw new ORPCError("NOT_FOUND", { message: "That company does not exist." });
      }
      if (input.productIds.length > 0) {
        const found = await context.db
          .select({ id: product.id })
          .from(product)
          .where(or(...input.productIds.map((productId) => eq(product.id, productId))));
        const foundIds = new Set(found.map((row) => row.id));
        const missing = input.productIds.filter((productId) => !foundIds.has(productId));
        if (missing.length > 0) {
          throw new ORPCError("BAD_REQUEST", {
            message: `Unknown products: ${missing.join(", ")}.`,
          });
        }
      }
      await context.db
        .delete(orgProduct)
        .where(eq(orgProduct.organizationId, input.organizationId));
      for (const productId of input.productIds) {
        await context.db
          .insert(orgProduct)
          .values({ organizationId: input.organizationId, productId })
          .onConflictDoNothing();
      }
      const [full] = await context.db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          isActive: organization.isActive,
        })
        .from(organization)
        .where(eq(organization.id, input.organizationId))
        .limit(1);
      if (!full) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "The company was updated but could not be read back.",
        });
      }
      const members = await context.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.organizationId, input.organizationId));
      return {
        organization: {
          ...full,
          memberCount: members.length,
          productCount: input.productIds.length,
          productIds: input.productIds,
        },
      };
    }),
};

export const adminRouter = {
  user: adminUserRouter,
  org: adminOrgRouter,
  product: adminProductRouter,
};

export const router = {
  /**
   * Demo endpoint to showcase oRPC + OpenAPI.
   * GET /hello -> { message: "Hello, <name>" }
   * Shows up on /docs via the OpenAPI plugin.
   */
  hello: protectedProcedure
    .route({
      method: "GET",
      path: "/hello",
      summary: "Say hello",
      description:
        "Demo endpoint. Returns a personalized greeting for the authenticated user. Requires a valid session cookie from better-auth.",
      tags: ["Demo"],
    })
    .output(
      z.object({
        message: z.string().describe("Greeting message"),
      }),
    )
    .handler(({ context }) => ({
      message: `Hello, ${context.session.user.name}`,
    })),

  /** Who the caller is and what they may do. Drives role-based rendering. */
  me: callerProcedure
    .route({
      method: "GET",
      path: "/me",
      summary: "Describe the current session",
      description:
        "Returns the caller's id, role, and organization. The web app uses this to decide between the client intake form and the staff ticket queue.",
      tags: ["Session"],
    })
    .output(z.object({ caller: callerOutput }))
    .handler(({ context }) => ({ caller: context.caller satisfies Caller })),

  product: productRouter,
  ticket: ticketRouter,
  admin: adminRouter,
};

export type AppRouter = typeof router;
