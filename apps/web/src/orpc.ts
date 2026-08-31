import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "../../api/src/router";

const link = new RPCLink({
  url: `${import.meta.env.VITE_API_URL ?? "http://localhost:8787"}/rpc`,
  fetch: (request, init) => fetch(request, { ...init, credentials: "include" }),
});

export const orpc: RouterClient<AppRouter> = createORPCClient(link);
