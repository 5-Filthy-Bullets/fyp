import { describe, expect, it } from "vitest";
import { router } from "./router";
import {
  authWithSession,
  authWithoutSession,
  fakeDatabase,
  sessionHeaders,
  ticketRow,
} from "./router.testFixtures";

const headers = sessionHeaders;

describe("hello", () => {
  it("greets the authenticated user by name", async () => {
    const hello = router.hello.callable({
      context: {
        headers,
        auth: authWithSession({
          name: "Jane",
          role: "client",
          organizationId: "org-acme",
        }),
        db: fakeDatabase().db,
      },
    });

    await expect(hello()).resolves.toEqual({ message: "Hello, Jane" });
  });

  it("rejects callers without a session as unauthorized", async () => {
    const hello = router.hello.callable({
      context: { headers, auth: authWithoutSession(), db: fakeDatabase().db },
    });

    await expect(hello()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("me", () => {
  it("returns the client role and organization from the session", async () => {
    const me = router.me.callable({
      context: {
        headers,
        auth: authWithSession({
          name: "Dana Okafor",
          role: "client",
          organizationId: "org-acme",
        }),
        db: fakeDatabase().db,
      },
    });

    await expect(me()).resolves.toEqual({
      caller: {
        userId: "test-user-id",
        role: "client",
        organizationId: "org-acme",
      },
    });
  });

  it("rejects a session whose role is outside the known enum", async () => {
    const me = router.me.callable({
      context: {
        headers,
        auth: authWithSession({
          name: "Mallory",
          role: "superuser",
          organizationId: "org-acme",
        }),
        db: fakeDatabase().db,
      },
    });

    await expect(me()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("product.listForOrg", () => {
  it("filters on the caller's organization, not anything the client sends", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["prod-line-9", "Line 9 Controller", "line-9-controller"]]);

    const listForOrg = router.product.listForOrg.callable({
      context: {
        headers,
        auth: authWithSession({
          name: "Dana Okafor",
          role: "client",
          organizationId: "org-acme",
        }),
        db: fake.db,
      },
    });

    await expect(listForOrg({})).resolves.toEqual({
      products: [{ id: "prod-line-9", name: "Line 9 Controller", slug: "line-9-controller" }],
    });

    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0]?.params).toContain("org-acme");
  });

  it("refuses staff accounts, who have no client catalog", async () => {
    const listForOrg = router.product.listForOrg.callable({
      context: {
        headers,
        auth: authWithSession({
          name: "Toni Alvarez",
          role: "technician",
          organizationId: null,
        }),
        db: fakeDatabase().db,
      },
    });

    await expect(listForOrg({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a client with no organization rather than running an unscoped query", async () => {
    const fake = fakeDatabase();

    const listForOrg = router.product.listForOrg.callable({
      context: {
        headers,
        auth: authWithSession({
          name: "Unlinked",
          role: "client",
          organizationId: null,
        }),
        db: fake.db,
      },
    });

    await expect(listForOrg({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.queries).toHaveLength(0);
  });
});

describe("ticket.create", () => {
  const clientContext = (fake: ReturnType<typeof fakeDatabase>) => ({
    headers,
    auth: authWithSession({
      name: "Dana Okafor",
      role: "client",
      organizationId: "org-acme",
    }),
    db: fake.db,
  });

  const validInput = {
    productId: "prod-line-9",
    title: "Conveyor belt stops mid-cycle",
    description: "The line halts after roughly twenty minutes of runtime.",
    reporterName: "Dana Okafor",
  };

  it("files the ticket under the caller's organization and returns it", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["prod-line-9"]]);
    fake.queueRows([
      [
        "ticket-1",
        "org-acme",
        "prod-line-9",
        validInput.title,
        validInput.description,
        validInput.reporterName,
        "open",
        null,
        new Date("2026-03-04T09:15:00Z"),
      ],
    ]);
    fake.queueRows([ticketRow({ title: validInput.title })]);

    const create = router.ticket.create.callable({ context: clientContext(fake) });
    const result = await create(validInput);

    expect(result.ticket.status).toBe("open");
    expect(result.ticket.organizationId).toBe("org-acme");
    expect(result.ticket.createdAt).toBe("2026-03-04T09:15:00.000Z");
    expect(fake.queries[1]?.params).toContain("org-acme");
  });

  it("refuses a product the organization does not own", async () => {
    const fake = fakeDatabase();
    fake.queueRows([]);

    const create = router.ticket.create.callable({ context: clientContext(fake) });

    await expect(create({ ...validInput, productId: "prod-other-org" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(fake.queries).toHaveLength(1);
  });

  it("refuses staff accounts", async () => {
    const fake = fakeDatabase();

    const create = router.ticket.create.callable({
      context: {
        headers,
        auth: authWithSession({
          name: "Toni Alvarez",
          role: "technician",
          organizationId: null,
        }),
        db: fake.db,
      },
    });

    await expect(create(validInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects a description too short to be actionable", async () => {
    const create = router.ticket.create.callable({
      context: clientContext(fakeDatabase()),
    });

    await expect(create({ ...validInput, description: "broken" })).rejects.toThrow();
  });
});

describe("ticket.listMine", () => {
  it("returns only the caller's organization, scoped from the session", async () => {
    const fake = fakeDatabase();
    fake.queueRows([ticketRow()]);

    const listMine = router.ticket.listMine.callable({
      context: {
        headers,
        auth: authWithSession({
          name: "Dana Okafor",
          role: "client",
          organizationId: "org-acme",
        }),
        db: fake.db,
      },
    });

    const { tickets } = await listMine({});

    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.organizationId).toBe("org-acme");
    // The org filter comes from the session, never from input.
    expect(fake.queries[0]?.params).toContain("org-acme");
    expect(fake.queries[0]?.sql).toContain('order by "ticket"."created_at" desc');
  });

  it("refuses staff accounts, who use the full queue instead", async () => {
    const listMine = router.ticket.listMine.callable({
      context: {
        headers,
        auth: authWithSession({
          name: "Toni Alvarez",
          role: "technician",
          organizationId: null,
        }),
        db: fakeDatabase().db,
      },
    });

    await expect(listMine({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a client with no organization rather than running an unscoped query", async () => {
    const fake = fakeDatabase();

    const listMine = router.ticket.listMine.callable({
      context: {
        headers,
        auth: authWithSession({
          name: "Unlinked",
          role: "client",
          organizationId: null,
        }),
        db: fake.db,
      },
    });

    await expect(listMine({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.queries).toHaveLength(0);
  });
});

describe("ticket.list", () => {
  it("returns the staff queue with org and product names resolved", async () => {
    const fake = fakeDatabase();
    fake.queueRows([ticketRow()]);

    const list = router.ticket.list.callable({
      context: {
        headers,
        auth: authWithSession({
          name: "Toni Alvarez",
          role: "technician",
          organizationId: null,
        }),
        db: fake.db,
      },
    });

    const { tickets } = await list({});

    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.organizationName).toBe("Acme Manufacturing");
    expect(tickets[0]?.productName).toBe("Line 9 Controller");
  });

  it("scopes to one organization when the caller passes a filter", async () => {
    const fake = fakeDatabase();
    fake.queueRows([ticketRow()]);

    const list = router.ticket.list.callable({
      context: {
        headers,
        auth: authWithSession({
          name: "Toni Alvarez",
          role: "technician",
          organizationId: null,
        }),
        db: fake.db,
      },
    });

    await list({ organizationId: "org-acme" });

    expect(fake.queries[0]?.params).toContain("org-acme");
  });

  it("orders newest first, which is what the route and the UI both promise", async () => {
    const fake = fakeDatabase();
    fake.queueRows([ticketRow()]);

    const list = router.ticket.list.callable({
      context: {
        headers,
        auth: authWithSession({
          name: "Toni Alvarez",
          role: "technician",
          organizationId: null,
        }),
        db: fake.db,
      },
    });

    await list({});

    // Regression: the queue read oldest-first while the copy said newest-first,
    // so a fresh ticket landed at the bottom of the list.
    expect(fake.queries[0]?.sql).toContain('order by "ticket"."created_at" desc');
  });

  it("refuses client accounts", async () => {
    const list = router.ticket.list.callable({
      context: {
        headers,
        auth: authWithSession({
          name: "Dana Okafor",
          role: "client",
          organizationId: "org-acme",
        }),
        db: fakeDatabase().db,
      },
    });

    await expect(list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("ticket.setStatus", () => {
  const staffContext = (fake: ReturnType<typeof fakeDatabase>) => ({
    headers,
    auth: authWithSession({
      name: "Toni Alvarez",
      role: "technician" as const,
      organizationId: null,
    }),
    db: fake.db,
  });

  it("claims an unassigned ticket for the caller", async () => {
    const fake = fakeDatabase();
    fake.queueRows([
      [
        "ticket-1",
        "org-acme",
        "prod-line-9",
        "Conveyor belt stops mid-cycle",
        "The line halts after roughly twenty minutes of runtime.",
        "Dana Okafor",
        "in_progress",
        "test-user-id",
        new Date("2026-03-04T09:15:00Z"),
      ],
    ]);
    fake.queueRows([ticketRow({ status: "in_progress", assignedTo: "test-user-id" })]);

    const setStatus = router.ticket.setStatus.callable({ context: staffContext(fake) });
    const { ticket } = await setStatus({ ticketId: "ticket-1", status: "in_progress" });

    expect(ticket.status).toBe("in_progress");
    expect(ticket.assignedTo).toBe("test-user-id");
    expect(fake.queries[0]?.params).toContain("test-user-id");
  });

  it("leaves an existing owner alone so a second technician cannot steal the ticket", async () => {
    const fake = fakeDatabase();
    fake.queueRows([
      [
        "ticket-1",
        "org-acme",
        "prod-line-9",
        "Conveyor belt stops mid-cycle",
        "The line halts after roughly twenty minutes of runtime.",
        "Dana Okafor",
        "resolved",
        "other-technician-id",
        new Date("2026-03-04T09:15:00Z"),
      ],
    ]);
    fake.queueRows([ticketRow({ status: "resolved", assignedTo: "other-technician-id" })]);

    const setStatus = router.ticket.setStatus.callable({ context: staffContext(fake) });
    const { ticket } = await setStatus({ ticketId: "ticket-1", status: "resolved" });

    // The caller is bound for the coalesce, but must not overwrite the owner.
    expect(fake.queries[0]?.sql).toContain("coalesce");
    expect(fake.queries[0]?.params).toContain("test-user-id");
    expect(ticket.assignedTo).toBe("other-technician-id");
  });

  it("reports a missing ticket as not found", async () => {
    const fake = fakeDatabase();
    fake.queueRows([]);

    const setStatus = router.ticket.setStatus.callable({ context: staffContext(fake) });

    await expect(
      setStatus({ ticketId: "ticket-missing", status: "resolved" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a status outside the enum", async () => {
    const fake = fakeDatabase();

    const setStatus = router.ticket.setStatus.callable({ context: staffContext(fake) });

    await expect(
      setStatus({
        ticketId: "ticket-1",
        status: "exploded" as "open",
      }),
    ).rejects.toThrow();
    expect(fake.queries).toHaveLength(0);
  });

  it("refuses client accounts", async () => {
    const setStatus = router.ticket.setStatus.callable({
      context: {
        headers,
        auth: authWithSession({
          name: "Dana Okafor",
          role: "client",
          organizationId: "org-acme",
        }),
        db: fakeDatabase().db,
      },
    });

    await expect(setStatus({ ticketId: "ticket-1", status: "resolved" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
