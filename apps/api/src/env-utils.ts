import { ZodError, type ZodType } from "zod";

export const parseEnvOrThrow = <T>(
  schema: ZodType<T>,
  source: Record<string, unknown>,
  configHint: string,
): Readonly<T> => {
  try {
    return Object.freeze(schema.parse(source));
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
      throw new Error(`\nEnvironment validation error(s):\n${issues}\n\nCheck your ${configHint}.`);
    }
    throw error;
  }
};
