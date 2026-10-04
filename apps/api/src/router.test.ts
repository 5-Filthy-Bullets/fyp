import { describe, expect, it } from "vitest";
import { router } from "./router";
import {
  authWithSession,
  authWithoutSession,
  fakeDatabase,
  messageRow,
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

    expect(result.ticket.status).toBe("open");
    expect(result.ticket.priority).toBe("high");
    expect(result.ticket.escalated).toBe(false);
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
    fake.queueRows([["tech-2", "technician"]]);
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
    expect(fake.queries[0]?.params).toContain("tech-2");
  });

  it("rejects an assignee who is not a technician", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["client-9", "client"]]);

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
    expect(fake.queries[0]?.params).toContain(reason);
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
