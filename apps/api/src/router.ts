import { ORPCError, os } from "@orpc/server";
import type { Auth } from "./auth";

export type RpcContext = {
  headers: Headers;
  auth: Auth;
};

const protectedProcedure = os.$context<RpcContext>().use(async ({ context, next }) => {
  const session = await context.auth.api.getSession({
    headers: context.headers,
  });

  if (!session) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return next({ context: { ...context, session } });
});

export const router = {
  hello: protectedProcedure.handler(({ context }) => ({
    message: `Hello, ${context.session.user.name}`,
  })),
};

export type AppRouter = typeof router;
