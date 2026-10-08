import { describe, expect, it } from "vitest";
import { router } from "./router";
import {
  authWithSession,
  authWithoutSession,
  fakeDatabase,
  messageRow,
  queueSignUpUser,
  sessionHeaders,
  ticketRow,
  userRow,
} from "./router.testFixtures";

const headers = sessionHeaders;

describe("hello", () => {
  it("rejects callers without a session as unauthorized", async () => {
    const hello = router.hello.callable({
      context: { headers, auth: authWithoutSession(), db: fakeDatabase().db },
    });

    await expect(hello()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("me", () => {
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
    priority: "high" as const,
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
        "high",
        false,
        null,
        new Date("2026-03-04T09:15:00Z"),
      ],
    ]);
    fake.queueRows([ticketRow({ title: validInput.title, priority: "high" })]);

    const create = router.ticket.create.callable({ context: clientContext(fake) });
    const result = await create(validInput);

    // Priority flows from the input; the org from the session, never the body.
    expect(result.ticket.priority).toBe("high");
    expect(result.ticket.organizationId).toBe("org-acme");
    // Timestamps cross the wire as ISO strings, converted off the Date row.
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

  it("refuses a banned client even with a live session", async () => {
    const fake = fakeDatabase();
    fake.queueBannedCaller();

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

    await expect(listMine({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.queries).toHaveLength(0);
  });

  it("refuses a client whose organization was suspended", async () => {
    const fake = fakeDatabase();
    fake.queueSuspendedOrg();

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

    await expect(listMine({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.queries).toHaveLength(0);
  });
});

describe("ticket.list", () => {
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

  it("accepts the URL query-string form of escalatedOnly", async () => {
    const fake = fakeDatabase();
    fake.queueRows([ticketRow({ escalated: true })]);
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

    // GET /tickets?escalatedOnly=true arrives as the string "true".
    const filtered = await list({ escalatedOnly: "true" as unknown as boolean });
    expect(filtered.tickets).toHaveLength(1);
    expect(filtered.tickets[0]?.escalated).toBe(true);
    expect(fake.queries[0]?.params).toContain(true);

    // "false" must stay false (z.coerce.boolean() would flip it to true).
    const unfiltered = await list({ escalatedOnly: "false" as unknown as boolean });
    expect(unfiltered.tickets).toHaveLength(1);
    expect(fake.queries[1]?.params).not.toContain(true);
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

  it("refuses a banned technician even with a live session", async () => {
    const fake = fakeDatabase();
    fake.queueBannedCaller();

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

    await expect(list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.queries).toHaveLength(0);
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
        "low",
        false,
        null,
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
        "low",
        false,
        null,
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

  it("updates only the priority when no status is passed", async () => {
    const fake = fakeDatabase();
    fake.queueRows([
      [
        "ticket-1",
        "org-acme",
        "prod-line-9",
        "Conveyor belt stops mid-cycle",
        "The line halts after roughly twenty minutes of runtime.",
        "Dana Okafor",
        "open",
        "urgent",
        false,
        null,
        "test-user-id",
        new Date("2026-03-04T09:15:00Z"),
      ],
    ]);
    fake.queueRows([ticketRow({ priority: "urgent", assignedTo: "test-user-id" })]);

    const setStatus = router.ticket.setStatus.callable({ context: staffContext(fake) });
    const { ticket } = await setStatus({ ticketId: "ticket-1", priority: "urgent" });

    expect(ticket.priority).toBe("urgent");
    expect(ticket.status).toBe("open");
  });

  it("rejects an update with neither status nor priority", async () => {
    const fake = fakeDatabase();

    const setStatus = router.ticket.setStatus.callable({ context: staffContext(fake) });

    await expect(setStatus({ ticketId: "ticket-1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(fake.queries).toHaveLength(0);
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

describe("ticket.assign", () => {
  const staffContext = (fake: ReturnType<typeof fakeDatabase>) => ({
    headers,
    auth: authWithSession({
      name: "Ada Admin",
      role: "admin" as const,
      organizationId: null,
    }),
    db: fake.db,
  });

  const assignedRow = (assignedTo: string) => ticketRow({ status: "open", assignedTo });

  it("hands the ticket to a chosen technician", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["tech-2", "technician", false]]);
    fake.queueRows([
      [
        "ticket-1",
        "org-acme",
        "prod-line-9",
        "Conveyor belt stops mid-cycle",
        "The line halts after roughly twenty minutes of runtime.",
        "Dana Okafor",
        "open",
        "low",
        false,
        null,
        "tech-2",
        new Date("2026-03-04T09:15:00Z"),
      ],
    ]);
    fake.queueRows([assignedRow("tech-2")]);

    const assign = router.ticket.assign.callable({ context: staffContext(fake) });
    const { ticket } = await assign({ ticketId: "ticket-1", assigneeId: "tech-2" });

    expect(ticket.assignedTo).toBe("tech-2");
    // The owner in the response is read back from a queued row, so pin the
    // write itself: the update must carry the assignee to the right ticket.
    const write = fake.queries.find((query) => query.sql.startsWith('update "ticket"'));
    expect(write?.params).toEqual(["tech-2", "ticket-1"]);
  });

  it("rejects an assignee who is not a technician", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["client-9", "client", false]]);

    const assign = router.ticket.assign.callable({ context: staffContext(fake) });

    await expect(assign({ ticketId: "ticket-1", assigneeId: "client-9" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(fake.queries).toHaveLength(1);
  });

  it("rejects an assignee who does not exist", async () => {
    const fake = fakeDatabase();
    fake.queueRows([]);

    const assign = router.ticket.assign.callable({ context: staffContext(fake) });

    await expect(
      assign({ ticketId: "ticket-1", assigneeId: "tech-missing" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a technician who has been deactivated", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["tech-2", "technician", true]]);

    const assign = router.ticket.assign.callable({ context: staffContext(fake) });

    await expect(assign({ ticketId: "ticket-1", assigneeId: "tech-2" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("refuses client accounts", async () => {
    const assign = router.ticket.assign.callable({
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

    await expect(assign({ ticketId: "ticket-1", assigneeId: "tech-2" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("ticket.listTechnicians", () => {
  const techContext = (fake: ReturnType<typeof fakeDatabase>) => ({
    headers,
    auth: authWithSession({
      name: "Toni Alvarez",
      role: "technician" as const,
      organizationId: null,
    }),
    db: fake.db,
  });

  it("returns technicians name-sorted, without banned accounts in the query", async () => {
    const fake = fakeDatabase();
    fake.queueRows([
      ["tech-2", "Zoe Park", "zoe@reliable.test"],
      ["tech-1", "Toni Alvarez", "toni@reliable.test"],
    ]);

    const list = router.ticket.listTechnicians.callable({ context: techContext(fake) });

    await expect(list({})).resolves.toEqual({
      technicians: [
        { email: "zoe@reliable.test", id: "tech-2", name: "Zoe Park" },
        { email: "toni@reliable.test", id: "tech-1", name: "Toni Alvarez" },
      ],
    });
    expect(fake.queries[0]?.sql).toContain('"user"."banned"');
    expect(fake.queries[0]?.sql).toContain('order by "user"."name"');
  });

  it("refuses client accounts", async () => {
    const list = router.ticket.listTechnicians.callable({
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

describe("ticket.escalate", () => {
  const staffContext = (fake: ReturnType<typeof fakeDatabase>) => ({
    headers,
    auth: authWithSession({
      name: "Toni Alvarez",
      role: "technician" as const,
      organizationId: null,
    }),
    db: fake.db,
  });

  const reason = "Needs a replacement part before the line restarts.";

  it("flags the ticket with the reason for admin review", async () => {
    const fake = fakeDatabase();
    fake.queueRows([
      [
        "ticket-1",
        "org-acme",
        "prod-line-9",
        "Conveyor belt stops mid-cycle",
        "The line halts after roughly twenty minutes of runtime.",
        "Dana Okafor",
        "open",
        "low",
        true,
        reason,
        null,
        new Date("2026-03-04T09:15:00Z"),
      ],
    ]);
    fake.queueRows([ticketRow({ escalated: true, escalatedReason: reason })]);

    const escalate = router.ticket.escalate.callable({ context: staffContext(fake) });
    const { ticket } = await escalate({ ticketId: "ticket-1", reason });

    expect(ticket.escalated).toBe(true);
    expect(ticket.escalatedReason).toBe(reason);
    // The flag in the response is read back from a queued row, so pin the
    // write itself: the update must carry the flag and reason to the ticket.
    const write = fake.queries.find((query) => query.sql.startsWith('update "ticket"'));
    expect(write?.params).toEqual([true, reason, "ticket-1"]);
  });

  it("rejects a reason too short to act on", async () => {
    const escalate = router.ticket.escalate.callable({
      context: staffContext(fakeDatabase()),
    });

    await expect(escalate({ ticketId: "ticket-1", reason: "no" })).rejects.toThrow();
  });

  it("reports a missing ticket as not found", async () => {
    const fake = fakeDatabase();
    fake.queueRows([]);

    const escalate = router.ticket.escalate.callable({ context: staffContext(fake) });

    await expect(escalate({ ticketId: "ticket-missing", reason })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses client accounts", async () => {
    const escalate = router.ticket.escalate.callable({
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

    await expect(escalate({ ticketId: "ticket-1", reason })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("ticket.get", () => {
  it("returns the ticket with public and internal messages for staff", async () => {
    const fake = fakeDatabase();
    fake.queueRows([ticketRow()]);
    fake.queueRows([
      messageRow({ id: "message-1", visibility: "public" }),
      messageRow({ id: "message-2", visibility: "internal" }),
    ]);

    const get = router.ticket.get.callable({
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

    const result = await get({ ticketId: "ticket-1" });

    expect(result.ticket.id).toBe("ticket-1");
    expect(result.messages).toHaveLength(2);
    // Staff read every message, so no visibility value is bound as a filter.
    expect(fake.queries[1]?.params).not.toContain("public");
  });

  it("shows only public messages to the owning client", async () => {
    const fake = fakeDatabase();
    fake.queueRows([ticketRow()]);
    fake.queueRows([messageRow({ id: "message-1", visibility: "public" })]);

    const get = router.ticket.get.callable({
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

    const result = await get({ ticketId: "ticket-1" });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.visibility).toBe("public");
    expect(fake.queries[1]?.sql).toContain("visibility");
    expect(fake.queries[1]?.params).toContain("public");
  });

  it("hides other-org tickets from clients as not found", async () => {
    const fake = fakeDatabase();
    fake.queueRows([ticketRow({ organizationId: "org-other" })]);

    const get = router.ticket.get.callable({
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

    await expect(get({ ticketId: "ticket-1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // The message query never runs once the org check fails.
    expect(fake.queries).toHaveLength(1);
  });

  it("refuses a banned caller even with a live session", async () => {
    const fake = fakeDatabase();
    fake.queueBannedCaller();

    const get = router.ticket.get.callable({
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

    await expect(get({ ticketId: "ticket-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.queries).toHaveLength(0);
  });

  it("reports a missing ticket as not found", async () => {
    const fake = fakeDatabase();
    fake.queueRows([]);

    const get = router.ticket.get.callable({
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

    await expect(get({ ticketId: "ticket-missing" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("ticket.postMessage", () => {
  const clientContext = (fake: ReturnType<typeof fakeDatabase>) => ({
    headers,
    auth: authWithSession({
      name: "Dana Okafor",
      role: "client" as const,
      organizationId: "org-acme",
    }),
    db: fake.db,
  });

  const staffContext = (fake: ReturnType<typeof fakeDatabase>) => ({
    headers,
    auth: authWithSession({
      name: "Toni Alvarez",
      role: "technician" as const,
      organizationId: null,
    }),
    db: fake.db,
  });

  it("saves a public client reply on the caller's own ticket", async () => {
    const fake = fakeDatabase();
    fake.queueRows([ticketRow()]);
    fake.queueRows([
      [
        "message-1",
        "ticket-1",
        "test-user-id",
        "The line is still down.",
        "public",
        new Date("2026-03-04T10:00:00Z"),
      ],
    ]);

    const postMessage = router.ticket.postMessage.callable({ context: clientContext(fake) });
    const { message } = await postMessage({
      ticketId: "ticket-1",
      content: "The line is still down.",
    });

    expect(message.visibility).toBe("public");
    expect(message.content).toBe("The line is still down.");
  });

  it("lets staff post an internal note", async () => {
    const fake = fakeDatabase();
    fake.queueRows([ticketRow()]);
    fake.queueRows([
      [
        "message-2",
        "ticket-1",
        "test-user-id",
        "Waiting on parts.",
        "internal",
        new Date("2026-03-04T10:05:00Z"),
      ],
    ]);

    const postMessage = router.ticket.postMessage.callable({ context: staffContext(fake) });
    const { message } = await postMessage({
      ticketId: "ticket-1",
      content: "Waiting on parts.",
      visibility: "internal",
    });

    expect(message.visibility).toBe("internal");
  });

  it("refuses an internal note from a client", async () => {
    const fake = fakeDatabase();

    const postMessage = router.ticket.postMessage.callable({ context: clientContext(fake) });

    await expect(
      postMessage({ ticketId: "ticket-1", content: "Sneaky note.", visibility: "internal" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.queries).toHaveLength(0);
  });

  it("hides other-org tickets from clients as not found", async () => {
    const fake = fakeDatabase();
    fake.queueRows([ticketRow({ organizationId: "org-other" })]);

    const postMessage = router.ticket.postMessage.callable({ context: clientContext(fake) });

    await expect(postMessage({ ticketId: "ticket-1", content: "Hello?" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects an empty reply", async () => {
    const postMessage = router.ticket.postMessage.callable({
      context: clientContext(fakeDatabase()),
    });

    await expect(postMessage({ ticketId: "ticket-1", content: "   " })).rejects.toThrow();
  });
});

describe("ticket.listMessages", () => {
  it("shows only public messages to the owning client", async () => {
    const fake = fakeDatabase();
    fake.queueRows([ticketRow()]);
    fake.queueRows([messageRow({ visibility: "public" })]);

    const listMessages = router.ticket.listMessages.callable({
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

    const { messages } = await listMessages({ ticketId: "ticket-1" });

    expect(messages).toHaveLength(1);
    expect(fake.queries[1]?.params).toContain("public");
  });

  it("hides other-org tickets from clients as not found", async () => {
    const fake = fakeDatabase();
    fake.queueRows([ticketRow({ organizationId: "org-other" })]);

    const listMessages = router.ticket.listMessages.callable({
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

    await expect(listMessages({ ticketId: "ticket-1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("admin guard", () => {
  const adminContext = (fake: ReturnType<typeof fakeDatabase>) => ({
    headers,
    auth: authWithSession({
      name: "Ada Admin",
      role: "admin" as const,
      organizationId: null,
    }),
    db: fake.db,
  });

  it("refuses technicians on admin user lists", async () => {
    const list = router.admin.user.list.callable({
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

    await expect(list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses clients on admin product creation", async () => {
    const create = router.admin.product.create.callable({
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

    await expect(create({ name: "Line 10 Controller" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("fails closed when the admin account is banned behind its session", async () => {
    const fake = fakeDatabase();
    fake.queueBannedCaller();

    const list = router.admin.user.list.callable({ context: adminContext(fake) });

    await expect(list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.queries).toHaveLength(0);
  });
});

describe("admin.user.list", () => {
  const adminContext = (fake: ReturnType<typeof fakeDatabase>) => ({
    headers,
    auth: authWithSession({
      name: "Ada Admin",
      role: "admin" as const,
      organizationId: null,
    }),
    db: fake.db,
  });

  it("pages through the directory without recounting", async () => {
    const fake = fakeDatabase();
    const directory = [
      userRow(),
      userRow({ id: "user-2", email: "tech2@reliable.test" }),
      userRow({ id: "user-3", email: "tech3@reliable.test" }),
    ];
    // One result set per call: the fake consumes a queued set per statement.
    fake.queueRows(directory);
    fake.queueRows(directory);

    const list = router.admin.user.list.callable({ context: adminContext(fake) });
    const first = await list({ role: "technician", limit: 2 });
    const second = await list({ role: "technician", limit: 2, offset: 2 });

    expect(first.users.map((user) => user.id)).toEqual(["user-1", "user-2"]);
    expect(second.users.map((user) => user.id)).toEqual(["user-3"]);
    // The total counts the whole directory, not the page.
    expect(first.total).toBe(3);
    expect(second.total).toBe(3);
  });

  it("filters on name or email when a search is passed", async () => {
    const fake = fakeDatabase();
    fake.queueRows([userRow({ name: "Dana Okafor" })]);

    const list = router.admin.user.list.callable({ context: adminContext(fake) });
    await list({ search: "dana" });

    expect(fake.queries[0]?.params).toContain("%dana%");
  });
});

describe("admin.user.createTechnician", () => {
  const adminContext = (fake: ReturnType<typeof fakeDatabase>) => ({
    headers,
    auth: authWithSession({
      name: "Ada Admin",
      role: "admin" as const,
      organizationId: null,
    }),
    db: fake.db,
  });

  const validInput = {
    name: "New Tech",
    email: "newtech@reliable.test",
    password: "demo-password-123",
  };

  it("creates a technician with no organization", async () => {
    const fake = fakeDatabase();
    fake.queueRows([]);
    queueSignUpUser("tech-new");
    fake.queueRows([]);
    fake.queueRows([userRow({ id: "tech-new", name: "New Tech" })]);

    const create = router.admin.user.createTechnician.callable({ context: adminContext(fake) });
    const result = await create(validInput);

    expect(result.user.id).toBe("tech-new");
    // The role and org are stamped onto the sign-up row by a write the fake
    // swallows, so the recorded update is the only proof it happened.
    const stamp = fake.queries.find((query) => query.sql.startsWith('update "user"'));
    expect(stamp?.params).toEqual(["technician", null, "tech-new"]);
  });

  it("reports a duplicate email as conflict before touching auth", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["tech-taken"]]);

    const create = router.admin.user.createTechnician.callable({ context: adminContext(fake) });

    await expect(create(validInput)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects a password too short to hand over", async () => {
    const create = router.admin.user.createTechnician.callable({
      context: adminContext(fakeDatabase()),
    });

    await expect(create({ ...validInput, password: "short" })).rejects.toThrow();
  });
});

describe("admin.user.update", () => {
  const adminContext = (fake: ReturnType<typeof fakeDatabase>) => ({
    headers,
    auth: authWithSession({
      name: "Ada Admin",
      role: "admin" as const,
      organizationId: null,
    }),
    db: fake.db,
  });

  it("renames a technician", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["tech-1", "technician"]]);
    fake.queueRows([]);
    fake.queueRows([userRow({ id: "tech-1", name: "Renamed Tech" })]);

    const update = router.admin.user.update.callable({ context: adminContext(fake) });
    const result = await update({ userId: "tech-1", name: "Renamed Tech" });

    expect(result.user.name).toBe("Renamed Tech");
    // The name in the response is read back from a queued row, so pin the
    // write itself: the update must carry the new name to the right row.
    const write = fake.queries.find((query) => query.sql.startsWith('update "user"'));
    expect(write?.params).toEqual(["Renamed Tech", "tech-1"]);
  });

  it("refuses to touch admin accounts", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["admin-1", "admin"]]);

    const update = router.admin.user.update.callable({ context: adminContext(fake) });

    await expect(update({ userId: "admin-1", name: "Nope" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects an update with nothing to change", async () => {
    const fake = fakeDatabase();

    const update = router.admin.user.update.callable({ context: adminContext(fake) });

    await expect(update({ userId: "tech-1" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("admin.user.setActive", () => {
  const adminContext = (fake: ReturnType<typeof fakeDatabase>) => ({
    headers,
    auth: authWithSession({
      name: "Ada Admin",
      role: "admin" as const,
      organizationId: null,
    }),
    db: fake.db,
  });

  it("bans the account and drops its sessions", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["tech-1", "technician"]]);
    fake.queueRows([]);
    fake.queueRows([]);
    fake.queueRows([userRow({ id: "tech-1", banned: true })]);

    const setActive = router.admin.user.setActive.callable({ context: adminContext(fake) });
    const result = await setActive({ userId: "tech-1", active: false });

    expect(result.message).toContain("deactivated");
    // Banning must flip the flag and delete live sessions; the echoed row
    // cannot prove either, but the recorded writes can.
    const ban = fake.queries.find((query) => query.sql.startsWith('update "user"'));
    expect(ban?.params).toEqual([true, null, null, "tech-1"]);
    const drop = fake.queries.find((query) => query.sql.startsWith('delete from "session"'));
    expect(drop?.params).toEqual(["tech-1"]);
  });

  it("refuses to deactivate the caller's own admin account", async () => {
    const fake = fakeDatabase();

    const setActive = router.admin.user.setActive.callable({ context: adminContext(fake) });

    await expect(setActive({ userId: "test-user-id", active: false })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("admin.org", () => {
  const adminContext = (fake: ReturnType<typeof fakeDatabase>) => ({
    headers,
    auth: authWithSession({
      name: "Ada Admin",
      role: "admin" as const,
      organizationId: null,
    }),
    db: fake.db,
  });

  it("lists companies with member and product counts", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["org-acme", "Acme Manufacturing", "acme-manufacturing", true]]);
    fake.queueRows([["org-acme"], ["org-acme"]]);
    fake.queueRows([["org-acme", "prod-line-9"]]);

    const list = router.admin.org.list.callable({ context: adminContext(fake) });
    const result = await list({});

    expect(result.total).toBe(1);
    expect(result.organizations[0]?.memberCount).toBe(2);
    expect(result.organizations[0]?.productCount).toBe(1);
  });

  it("replaces the entitlement set wholesale", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["org-acme"]]);
    fake.queueRows([["prod-line-9"], ["prod-scan-2"]]);
    fake.queueRows([]);
    fake.queueRows([]);
    fake.queueRows([]);
    fake.queueRows([["org-acme", "Acme Manufacturing", "acme-manufacturing", true]]);
    fake.queueRows([["user-1"]]);

    const setEntitlements = router.admin.org.setEntitlements.callable({
      context: adminContext(fake),
    });
    const result = await setEntitlements({
      organizationId: "org-acme",
      productIds: ["prod-line-9", "prod-scan-2"],
    });

    expect(result.organization.productIds).toEqual(["prod-line-9", "prod-scan-2"]);
    // Wholesale means the old links are deleted before the new ones land.
    const clear = fake.queries.find((query) => query.sql.startsWith('delete from "org_product"'));
    expect(clear?.params).toEqual(["org-acme"]);
    const links = fake.queries.filter((query) => query.sql.startsWith('insert into "org_product"'));
    expect(links.map((query) => query.params)).toEqual([
      ["org-acme", "prod-line-9"],
      ["org-acme", "prod-scan-2"],
    ]);
  });

  it("rejects unknown product ids instead of narrowing silently", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["org-acme"]]);
    fake.queueRows([]);

    const setEntitlements = router.admin.org.setEntitlements.callable({
      context: adminContext(fake),
    });

    await expect(
      setEntitlements({ organizationId: "org-acme", productIds: ["prod-ghost"] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("suspends the company and reports it", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["org-acme", "Acme Manufacturing", "acme-manufacturing", false]]);
    fake.queueRows([["user-1"], ["user-2"]]);
    fake.queueRows([]);
    fake.queueRows([]);
    fake.queueRows([]);

    const setActive = router.admin.org.setActive.callable({ context: adminContext(fake) });
    const result = await setActive({ organizationId: "org-acme", active: false });

    expect(result.organization.isActive).toBe(false);
    expect(result.message).toContain("deactivated");
    // Suspending must drop every member session at once, not just flip the flag.
    const drops = fake.queries.filter((query) => query.sql.startsWith('delete from "session"'));
    expect(drops.map((query) => query.params)).toEqual([["user-1"], ["user-2"]]);
  });

  it("refuses technicians on org lists", async () => {
    const list = router.admin.org.list.callable({
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

    await expect(list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("admin.product", () => {
  const adminContext = (fake: ReturnType<typeof fakeDatabase>) => ({
    headers,
    auth: authWithSession({
      name: "Ada Admin",
      role: "admin" as const,
      organizationId: null,
    }),
    db: fake.db,
  });

  it("creates a product with a slugified name", async () => {
    const fake = fakeDatabase();
    fake.queueRows([]);
    fake.queueRows([["prod-new", "Line 10 Controller", "line-10-controller"]]);

    const create = router.admin.product.create.callable({ context: adminContext(fake) });
    const result = await create({ name: "Line 10 Controller" });

    expect(result.product.slug).toBe("line-10-controller");
  });

  it("reports a duplicate slug as conflict", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["prod-taken"]]);

    const create = router.admin.product.create.callable({ context: adminContext(fake) });

    await expect(
      create({ name: "Line 9 Controller", slug: "line-9-controller" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("admin.user.createClient", () => {
  const adminContext = (fake: ReturnType<typeof fakeDatabase>) => ({
    headers,
    auth: authWithSession({
      name: "Ada Admin",
      role: "admin" as const,
      organizationId: null,
    }),
    db: fake.db,
  });

  const validInput = {
    orgName: "Globex Corporation",
    name: "Hank Scorpio",
    email: "hank@globex.test",
    password: "demo-password-123",
    productIds: ["prod-line-9"],
  };

  it("creates the org, the user, and the entitlements in one flow", async () => {
    const fake = fakeDatabase();
    fake.queueRows([]);
    fake.queueRows([]);
    fake.queueRows([["prod-line-9"]]);
    fake.queueRows([]);
    queueSignUpUser("client-new");
    fake.queueRows([]);
    fake.queueRows([]);
    fake.queueRows([
      userRow({
        id: "client-new",
        name: "Hank Scorpio",
        email: "hank@globex.test",
        role: "client",
        organizationId: "org-new",
        organizationName: "Globex Corporation",
      }),
    ]);

    const create = router.admin.user.createClient.callable({ context: adminContext(fake) });
    const result = await create(validInput);

    expect(result.user.role).toBe("client");
    expect(result.organization.productIds).toEqual(["prod-line-9"]);
    expect(result.organization.productCount).toBe(1);
  });

  it("reports a taken company slug as conflict", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["org-taken"]]);

    const create = router.admin.user.createClient.callable({ context: adminContext(fake) });

    await expect(create(validInput)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects unknown products before creating anything", async () => {
    const fake = fakeDatabase();
    fake.queueRows([]);
    fake.queueRows([]);
    fake.queueRows([]);

    const create = router.admin.user.createClient.callable({ context: adminContext(fake) });

    await expect(create({ ...validInput, productIds: ["prod-ghost"] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
