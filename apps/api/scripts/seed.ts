/**
 * Seeds the demo slice: one client org, two products linked to it, one client
 * user, one technician. Run with `pnpm --filter api db:seed`.
 *
 * Idempotent: every insert is an upsert keyed on a stable id, so re-running
 * tops up missing rows instead of duplicating them.
 */
import { eq } from "drizzle-orm";
import { createAuth, type AuthEnv } from "../src/auth";
import { createDatabase } from "../src/db/client";
import { organization, orgProduct, product, user } from "../src/db/schema";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().min(1),
  WEB_URL: z.string().min(1),
  BETTER_AUTH_LOG_LVL: z.enum(["debug", "info", "warn", "error"]).optional(),
});

process.loadEnvFile(new URL("../.dev.vars", import.meta.url));
const env: AuthEnv = envSchema.parse(process.env);

const auth = createAuth(env);
const db = createDatabase(env.DATABASE_URL);

const ORG_ID = "org-acme";
const PASSWORD = "demo-password-123";

const products = [
  { id: "prod-line-9", name: "Line 9 Controller", slug: "line-9-controller" },
  { id: "prod-scan-2", name: "ScanStation 2", slug: "scanstation-2" },
] as const;

/**
 * Signs a user up through Better Auth so the password hash is written the same
 * way the real sign-up flow writes it, then sets the fields that are
 * server-owned (`input: false` in the auth config).
 */
const upsertUser = async (input: {
  email: string;
  name: string;
  role: "client" | "technician";
  organizationId: string | null;
}) => {
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, input.email))
    .limit(1);

  if (existing[0]) {
    await db
      .update(user)
      .set({ role: input.role, organizationId: input.organizationId })
      .where(eq(user.id, existing[0].id));
    console.log(`updated ${input.email} (${input.role})`);
    return;
  }

  const created = await auth.api.signUpEmail({
    body: { email: input.email, name: input.name, password: PASSWORD },
  });

  await db
    .update(user)
    .set({ role: input.role, organizationId: input.organizationId })
    .where(eq(user.id, created.user.id));

  console.log(`created ${input.email} (${input.role})`);
};

const main = async () => {
  await db
    .insert(organization)
    .values({ id: ORG_ID, name: "Acme Manufacturing", slug: "acme-manufacturing" })
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: "Acme Manufacturing" },
    });

  for (const item of products) {
    await db
      .insert(product)
      .values(item)
      .onConflictDoUpdate({ target: product.id, set: { name: item.name } });

    await db
      .insert(orgProduct)
      .values({ organizationId: ORG_ID, productId: item.id })
      .onConflictDoNothing();
  }

  await upsertUser({
    email: "client@acme.test",
    name: "Dana Okafor",
    role: "client",
    organizationId: ORG_ID,
  });

  await upsertUser({
    email: "tech@reliable.test",
    name: "Toni Alvarez",
    role: "technician",
    organizationId: null,
  });

  console.log(`\nSeed complete. Sign in with either account, password: ${PASSWORD}`);
};

await main();
