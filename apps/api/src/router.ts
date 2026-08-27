import { os } from "@orpc/server";

export const router = {
  hello: os.handler(() => ({ message: "Hello from oRPC" })),
};

export type AppRouter = typeof router;
