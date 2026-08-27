import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { parseEnv } from "./src/env";

config({ path: "../../.env.local" });
const env = parseEnv(process.env);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: env.DATABASE_URL },
});
