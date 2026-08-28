import { config } from "dotenv";
import { z, type ZodType } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().trim().min(32),
  BETTER_AUTH_URL: z.url(),
  WEB_URL: z.url(),
});

export type AppEnv = z.infer<typeof envSchema>;

const parseOrThrow = <T>(schema: ZodType<T>, source: unknown, hint: string): T => {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`\nEnvironment validation error(s):\n${issues}\n\nCheck your ${hint}.`);
  }
  return result.data;
};

export const parseEnv = (source: unknown) =>
  parseOrThrow(envSchema, source, ".env.local or Worker secrets");

// Only used by drizzle-kit locally; Workers get env from bindings.
export const loadDatabaseUrlFromDotEnv = (path: string) => {
  config({ path });
  return parseOrThrow(envSchema.pick({ DATABASE_URL: true }), process.env, "DATABASE_URL").DATABASE_URL;
};
