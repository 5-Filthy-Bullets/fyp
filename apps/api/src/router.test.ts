import { describe, expect, it } from "vitest";
import { router } from "./router";
import { authWithSession, authWithoutSession } from "./router.testFixtures";

const headers = new Headers();

describe("hello", () => {
  it("greets the authenticated user by name", async () => {
    const hello = router.hello.callable({
      context: { headers, auth: authWithSession("Jane") },
    });

    await expect(hello()).resolves.toEqual({ message: "Hello, Jane" });
  });

  it("rejects callers without a session as unauthorized", async () => {
    const hello = router.hello.callable({
      context: { headers, auth: authWithoutSession() },
    });

    await expect(hello()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
