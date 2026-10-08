import { createRouterUtils } from "@orpc/tanstack-query";
import { orpc } from "./orpc";

/** oRPC query utils reusing the RPCLink from orpc.ts (10s timeout, cookies). */
export const orpcQuery = createRouterUtils(orpc);
