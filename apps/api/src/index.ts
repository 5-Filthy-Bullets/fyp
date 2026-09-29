import { Hono } from "hono";
import { cors } from "hono/cors";
import { RPCHandler } from "@orpc/server/fetch";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
// Must be the /zod4 entrypoint: the default `@orpc/zod` export targets zod 3
// and converts every zod 4 schema to an unrepresentable `{"not":{}}`.
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createAuth, type AuthEnv } from "./auth";
import { createDatabase } from "./db/client";
import { router } from "./router";

type Env = {
  Bindings: AuthEnv;
};

const app = new Hono<Env>();

/**
 * Both handlers get the same context. The auth instance and the drizzle
 * client are built per request: neither holds connection state, and building
 * them at module scope would read env bindings before Workers binds them.
 */
const buildContext = (env: AuthEnv, headers: Headers) => ({
  headers,
  auth: createAuth(env),
  db: createDatabase(env.DATABASE_URL),
});

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
    context: buildContext(c.env, c.req.raw.headers),
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
    context: buildContext(c.env, c.req.raw.headers),
  });

  if (matched) {
    return response;
  }

  return c.text("Not found", 404);
});

export default app;
