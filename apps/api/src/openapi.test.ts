import { describe, expect, it } from "vitest";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { router } from "./router";

/**
 * The `/zod4` converter is the point of this file. The default `@orpc/zod`
 * export targets zod 3, and against zod 4 schemas it converts everything to an
 * unrepresentable `{"not":{}}`. That fails loudly on procedures with a path
 * parameter, and silently produces an unusable spec everywhere else.
 */
const generate = async () =>
  new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] }).generate(router, {
    info: { title: "FYP API", version: "1.0.0" },
  });

describe("openapi spec", () => {
  it("exposes every procedure at its documented path", async () => {
    const spec = await generate();

    expect(Object.keys(spec.paths ?? {}).sort()).toEqual([
      "/admin/clients",
      "/admin/organizations",
      "/admin/organizations/{organizationId}",
      "/admin/organizations/{organizationId}/active",
      "/admin/organizations/{organizationId}/products",
      "/admin/products",
      "/admin/technicians",
      "/admin/users",
      "/admin/users/{userId}",
      "/admin/users/{userId}/active",
      "/hello",
      "/me",
      "/products",
      "/tickets",
      "/tickets/mine",
      "/tickets/technicians",
      "/tickets/{ticketId}",
      "/tickets/{ticketId}/assignee",
      "/tickets/{ticketId}/escalation",
      "/tickets/{ticketId}/messages",
      "/tickets/{ticketId}/status",
    ]);
  });

  it("documents request bodies with real schemas rather than unrepresentable ones", async () => {
    const spec = await generate();
    const create = spec.paths?.["/tickets"]?.post;

    // The generator types request bodies as `ReferenceObject | RequestBodyObject`,
    // so these read the serialized form instead of narrowing the union by hand.
    expect(JSON.stringify(create?.requestBody)).toContain(
      '"required":["productId","title","description","reporterName"]',
    );
  });

  it("describes the status enum the ticket procedures accept", async () => {
    const spec = await generate();
    const status = spec.paths?.["/tickets/{ticketId}/status"]?.patch?.requestBody;

    expect(JSON.stringify(status)).toContain("in_progress");
  });
});
