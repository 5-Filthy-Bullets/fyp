import { describe, expect, it } from "vitest";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { router } from "./router";

/**
 * The `/zod4` converter is the point of this file. The default `@orpc/zod/zod4`
 * export targets zod 3, and against zod 4 schemas it converts everything to an
 * unrepresentable `{"not":{}}`. That fails loudly on procedures with a path
 * parameter, and silently produces an unusable spec everywhere else.
 */
const generate = async () =>
  new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] }).generate(router, {
    info: { title: "FYP API", version: "1.0.0" },
  });

describe("openapi spec", () => {
  it("documents response schemas rather than unrepresentable ones", async () => {
    const spec = await generate();
    const hello = spec.paths?.["/hello"]?.get;

    expect(JSON.stringify(hello?.responses)).toContain('"message"');
    expect(JSON.stringify(hello?.responses)).not.toContain('"not":{}');
  });
});
