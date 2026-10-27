import { Hono } from "hono";
import { cors } from "hono/cors";
import { RPCHandler } from "@orpc/server/fetch";
import { createRouteHandler } from "uploadthing/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
// Must be the /zod4 entrypoint: the default `@orpc/zod` export targets zod 3
// and converts every zod 4 schema to an unrepresentable `{"not":{}}`.
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createAuth, type AuthEnv } from "./auth";
import { createDatabase } from "./db/client";
import { runTicketReminders } from "./email/reminders";
import { createEmailSender } from "./email/sendgrid";
import { router } from "./router";
import { uploadRouter } from "./uploadthing";

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
  email: createEmailSender(env),
  webUrl: env.WEB_URL,
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

app.use("/api/uploadthing/*", async (c, next) => {
  return cors({
    origin: c.env.WEB_URL,
    credentials: true,
  })(c, next);
});

/**
 * Photo and video uploads for the conversation thread. Workers has no
 * process.env and no init.cache, so the token, dev flag, fetch shim, and
 * waitUntil hook come from the Worker env per request.
 */
app.all("/api/uploadthing/*", async (c) => {
  const handlers = createRouteHandler({
    router: uploadRouter,
    config: {
      token: c.env.UPLOADTHING_TOKEN,
      isDev: c.env.ENVIRONMENT === "development",
      fetch: (url, init) => {
        if (init && "cache" in init) delete init.cache;
        return fetch(url, init);
      },
      handleDaemonPromise: (promise) => c.executionCtx.waitUntil(promise),
    },
  });
  const request = c.req.raw;
  if (request.method !== "GET" && request.method !== "POST") {
    return c.text("Method not allowed", 405);
  }
  // v7's createRouteHandler resolves to one function taking the raw
  // request, not a per-method map, so it runs directly.
  return handlers(request);
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

/** Minimal shape of the runtime cron event. Only the fire time is used. */
interface CronEvent {
  readonly scheduledTime: number;
}

/** Smallest lifetime surface the cron run needs from the runtime. */
interface CronContext {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Daily reminders: unassigned open tickets and quiet in-progress ones get
 * one nudge per cooldown window. Runs off the `triggers.crons` entry in
 * wrangler.jsonc; a failed run only logs, it never throws into the runtime.
 */
const scheduled = async (event: CronEvent, env: AuthEnv, ctx: CronContext): Promise<void> => {
  const run = (async () => {
    const db = createDatabase(env.DATABASE_URL);
    await runTicketReminders(
      db,
      createEmailSender(env),
      env.WEB_URL,
      new Date(event.scheduledTime),
    );
  })();

  ctx.waitUntil(run);
  await run;
};

export default {
  fetch: app.fetch,
  scheduled,
};
