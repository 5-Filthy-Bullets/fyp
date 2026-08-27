import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { schema } from "./schema";

export const createDb = (databaseUrl: string) => drizzle(neon(databaseUrl), { schema });
