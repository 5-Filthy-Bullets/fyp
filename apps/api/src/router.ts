import { ORPCError, os } from "@orpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { readCaller, requireClientCaller, requireStaffCaller, type Caller } from "./access";
import type { Auth } from "./auth";
import type { Database } from "./db/client";
import { organization, orgProduct, product, ticket, ticketStatus, userRole } from "./db/schema";

/** Session value the router reads, inferred from the real Auth type. */
export type RouterSession = Auth["$Infer"]["Session"];

/**
 * Narrow auth surface the router consumes. Full `Auth` satisfies this,
 * so production still passes `createAuth()` straight through.
 */
export interface SessionReader {
  readonly api: {
    readonly getSession: (input: { readonly headers: Headers }) => Promise<RouterSession | null>;
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
const callerProcedure = protectedProcedure.use(({ context, next }) => {
  const caller = readCaller(context.session);
  return next({ context: { ...context, caller } });
});

/** Clients only. The org is read from the session, never from input. */
const clientProcedure = protectedProcedure.use(({ context, next }) => {
  const caller = requireClientCaller(context.session);
  return next({ context: { ...context, caller } });
});

/** Vendor staff, who work across every client org. */
const staffProcedure = protectedProcedure.use(({ context, next }) => {
  const caller = requireStaffCaller(context.session);
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
  organizationId: z.string().describe("Owning client organization id"),
  organizationName: z.string().describe("Owning client organization name"),
  productId: z.string().describe("Product the ticket is about"),
  productName: z.string().describe("Product display name"),
  assignedTo: z.string().nullable().describe("Staff user id, null when unclaimed"),
  createdAt: z.string().describe("ISO 8601 creation timestamp"),
});

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

  list: staffProcedure
    .route({
      method: "GET",
      path: "/tickets",
      summary: "List tickets across all client organizations",
      description:
        "Vendor staff queue. Returns every ticket newest first with the org and product resolved. Pass organizationId to narrow to one client.",
      tags: ["Tickets"],
    })
    .input(
      z.object({
        organizationId: z
          .string()
          .min(1)
          .optional()
          .describe("Optional client organization filter"),
      }),
    )
    .output(z.object({ tickets: z.array(ticketOutput) }))
    .handler(async ({ context, input }) => {
      const rows = await selectTickets(context.db, {
        ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
      });

      return { tickets: rows.map(toTicketOutput) };
    }),

  setStatus: staffProcedure
    .route({
      method: "PATCH",
      path: "/tickets/{ticketId}/status",
      summary: "Claim a ticket or change its status",
      description:
        "Moves a ticket to a new status. Claims an unassigned ticket for the caller, and leaves an existing owner alone so a second technician cannot silently steal a claimed ticket. There are no status-transition guards, so any status can move to any other.",
      tags: ["Tickets"],
    })
    .input(
      z.object({
        ticketId: z.string().min(1).describe("Ticket to update"),
        status: z.enum(ticketStatus.enumValues).describe("Status to move the ticket to"),
      }),
    )
    .output(z.object({ ticket: ticketOutput }))
    .handler(async ({ context, input }) => {
      const [updated] = await context.db
        .update(ticket)
        .set({
          status: input.status,
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
};

/**
 * Ticket filters for the single read path. The two optional keys are mutually
 * independent; an empty filter is the full staff queue.
 */
type TicketFilter = {
  readonly organizationId?: string;
  readonly ticketId?: string;
};

/** Row shape straight from the join, before the wire conversion. */
type TicketJoin = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly reporterName: string;
  readonly status: (typeof ticketStatus.enumValues)[number];
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
  ];

  const base = db
    .select({
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      reporterName: ticket.reporterName,
      status: ticket.status,
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
};

export type AppRouter = typeof router;
