import { Hono } from "hono";
import { cors } from "hono/cors";
import { RPCHandler } from "@orpc/server/fetch";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { router } from "./router";

const app = new Hono();
const rpcHandler = new RPCHandler(router);
const openapiHandler = new OpenAPIHandler(router, {
  plugins: [
    new OpenAPIReferencePlugin({
      docsPath: "/docs",
      docsProvider: "swagger",
      specPath: "/docs/spec.json",
      schemaConverters: [new ZodToJsonSchemaConverter()],
      specGenerateOptions: {
        info: {
          title: "FYP API",
          version: "1.0.0",
        },
      },
    }),
  ],
});

app.use("/rpc/*", cors());

app.all("/rpc/*", async (c) => {
  const { matched, response } = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: {},
  });

  if (matched) {
    return response;
  }

  return c.text("Not found", 404);
});

app.get("/", (c) => {
  return c.text("API is running");
});

app.all("/*", async (c) => {
  const { matched, response } = await openapiHandler.handle(c.req.raw, {
    prefix: "/",
    context: {},
  });

  if (matched) {
    return response;
  }

  return c.text("Not found", 404);
});

export default app;
