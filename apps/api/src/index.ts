import { Hono } from "hono";
import { cors } from "hono/cors";
import { RPCHandler } from "@orpc/server/fetch";
import { router } from "./router";

const app = new Hono();
const rpcHandler = new RPCHandler(router);

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

export default app;
