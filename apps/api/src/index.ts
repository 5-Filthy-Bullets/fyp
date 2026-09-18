import { Hono } from "hono";
import { cors } from "hono/cors";
import { RPCHandler } from "@orpc/server/fetch";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { createAuth, type AuthEnv } from "./auth";
import { router } from "./router";

type Env = {
  Bindings: AuthEnv;
};

const app = new Hono<Env>();

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
          description:
            "Demo API built with oRPC + Hono on Cloudflare Workers. Try GET /hello (auth required) to see OpenAPI in action.",
        },
      },
    }),
  ],
});

app.use("/api/auth/*", async (c, next) => {
  return cors({
    origin: c.env.WEB_URL,
    credentials: true,
  })(c, next);
});

app.all("/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

app.use("/rpc/*", async (c, next) => {
  return cors({
    origin: c.env.WEB_URL,
    credentials: true,
  })(c, next);
});

app.all("/rpc/*", async (c) => {
  const { matched, response } = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: {
      headers: c.req.raw.headers,
      auth: createAuth(c.env),
    },
  });

  if (matched) {
    return response;
  }

  return c.text("Not found", 404);
});

app.get("/", (c) => c.text("API is running"));

app.all("/*", async (c) => {
  const { matched, response } = await openapiHandler.handle(c.req.raw, {
    prefix: "/",
    context: {
      headers: c.req.raw.headers,
      auth: createAuth(c.env),
    },
  });

  if (matched) {
    return response;
  }

  return c.text("Not found", 404);
});

export default app;
