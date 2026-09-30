import { boolean, pgEnum, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Staff (admin, technician) work across every client org, so `user.role` and
 * `user.organizationId` together decide what a session can see. Better Auth
 * only knows about the core user table, so `auth.ts` declares these two
 * columns again as server-owned `additionalFields`.
 */
export const userRole = pgEnum("user_role", ["admin", "technician", "client"]);

export const ticketStatus = pgEnum("ticket_status", ["open", "in_progress", "resolved"]);

/** A client company that buys from the vendor. */
export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

/** Something the vendor sells and the client can raise a ticket about. */
export const product = pgTable("product", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("client"),
  /** Null for vendor staff, who are not tied to a single client org. */
  organizationId: text("organization_id").references(() => organization.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

/** Which products a given org is entitled to see and file against. */
export const orgProduct = pgTable(
  "org_product",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.productId] })],
);

export const ticket = pgTable("ticket", {
  id: text("id").primaryKey(),
  /** Taken from the reporter at creation, never from request input. */
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => product.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  reporterName: text("reporter_name").notNull(),
  status: ticketStatus("status").notNull().default("open"),
  /** Set when a technician or admin claims the ticket. */
  assignedTo: text("assigned_to").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  issuer: text("issuer"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const authSchema = { user, session, account, verification };

/** Everything outside the auth tables, so the oRPC context can query it all. */
export const appSchema = {
  ...authSchema,
  organization,
  product,
  orgProduct,
  ticket,
};

export type UserId = string & { readonly __brand: "UserId" };
export const userId = (raw: string): UserId => raw as UserId;

export type SessionId = string & { readonly __brand: "SessionId" };
export const sessionId = (raw: string): SessionId => raw as SessionId;

export type AccountId = string & { readonly __brand: "AccountId" };
export const accountId = (raw: string): AccountId => raw as AccountId;

export type VerificationId = string & { readonly __brand: "VerificationId" };
export const verificationId = (raw: string): VerificationId => raw as VerificationId;
