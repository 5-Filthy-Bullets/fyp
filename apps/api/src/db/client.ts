import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { appSchema } from "./schema";

export type Database = NeonHttpDatabase<typeof appSchema>;

/**
 * One HTTP client per request. `neon()` is stateless over fetch, so building
 * it per call costs nothing and keeps the connection out of module scope,
 * which Cloudflare Workers forbids.
 */
export const createDatabase = (databaseUrl: string): Database =>
  drizzle(neon(databaseUrl), { schema: appSchema });
