import { authClient } from "@/auth";
import { z } from "zod";

/**
 * Roles match the Postgres `user_role` enum. The API re-validates the session
 * against the same values in `apps/api/src/access.ts`; this is the web copy
 * for display and redirect decisions only, never for authorization.
 */
export const roleSchema = z.enum(["admin", "technician", "client"]);

export type Role = z.infer<typeof roleSchema>;

export const isRole = (value: unknown): value is Role => roleSchema.safeParse(value).success;

const roleHomes = {
  admin: "/",
  technician: "/",
  client: "/",
} as const satisfies Record<Role, "/">;

/**
 * Landing page for a signed-in role. Every role lands on "/", where the
 * Phase 4 dashboards render per role.
 */
export const homePathForRole = (role: Role): "/" => roleHomes[role];

/**
 * Signed-in user id plus role. The Phase 3 shell reuses this instead of
 * reading the raw session shape in every route.
 */
export const useCaller = () => {
  const session = authClient.useSession();
  const role = isRole(session.data?.user.role) ? session.data.user.role : undefined;
  return {
    session,
    userId: session.data?.user.id,
    email: session.data?.user.email,
    role,
  };
};
