import { ORPCError, os } from "@orpc/server";
import { z } from "zod";
import type { Auth } from "./auth";

/** Session value the router reads, inferred from the real Auth type. */
export type RouterSession = Auth["$Infer"]["Session"];

/**
 * Narrow auth surface the router consumes. Full `Auth` satisfies this,
 * so production still passes `createAuth()` straight through.
 */
export interface SessionReader {
	readonly api: {
		readonly getSession: (input: {
			readonly headers: Headers;
		}) => Promise<RouterSession | null>;
	};
}

export interface RpcContext {
	readonly headers: Headers;
	readonly auth: SessionReader;
}

const protectedProcedure = os
	.$context<RpcContext>()
	.use(async ({ context, next }) => {
		const session = await context.auth.api.getSession({
			headers: context.headers,
		});

		if (!session) {
			throw new ORPCError("UNAUTHORIZED");
		}

		return next({ context: { ...context, session } });
	});

export const router = {
	/**
	 * Demo endpoint to showcase oRPC + OpenAPI.
	 * GET /hello -> { message: "Hello, <name>" }
	 * Shows up on /docs via the OpenAPI plugin.
	 */
	hello: protectedProcedure
		.route({
			method: "GET",
			path: "/hello",
			summary: "Say hello",
			description:
				"Demo endpoint. Returns a personalized greeting for the authenticated user. Requires a valid session cookie from better-auth.",
			tags: ["Demo"],
		})
		.output(
			z.object({
				message: z.string().describe("Greeting message"),
			}),
		)
		.handler(({ context }) => ({
			message: `Hello, ${context.session.user.name}`,
		})),
};

export type AppRouter = typeof router;
