import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createDb } from "./db";
import { schema } from "./db/schema";
import { parseEnv, type AppEnv } from "./env";

export type AuthEnv = AppEnv;

export const createAuth = (source: object) => {
  const env = parseEnv(source);

  return betterAuth({
    database: drizzleAdapter(createDb(env.DATABASE_URL), {
      provider: "pg",
      schema,
    }),
    emailAndPassword: { enabled: true },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.WEB_URL],
  });
};
