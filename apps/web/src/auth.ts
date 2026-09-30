import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { Auth } from "../../api/src/auth";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

export const authClient = createAuthClient({
  baseURL: `${apiUrl}/api/auth`,
  // The api declares `role` and `organizationId` on the user, so the session
  // type here has to be told about them or the web app cannot read them.
  plugins: [inferAdditionalFields<Auth>()],
  fetchOptions: {
    credentials: "include",
  },
});
