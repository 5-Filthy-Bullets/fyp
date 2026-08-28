import { Hono } from "hono";
import { cors } from "hono/cors";
import { RPCHandler } from "@orpc/server/fetch";
import { router } from "./router";
import { createAuth } from "./auth";
import type { AppEnv } from "./env";

const app = new Hono<{ Bindings: AppEnv }>();
const rpcHandler = new RPCHandler(router);

app.use("/api/auth/*", (c, next) => cors({ origin: c.env.WEB_URL, credentials: true })(c, next));
app.all("/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));
app.use("/rpc/*", (c, next) => cors({ origin: c.env.WEB_URL, credentials: true })(c, next));

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

export default app;
