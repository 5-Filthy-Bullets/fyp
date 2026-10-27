import { describe, expect, it } from "vitest";
import { router } from "./router";
import type { EmailMessage, EmailSender } from "./email/types";
import { authWithSession, fakeDatabase, sessionHeaders, ticketRow } from "./router.testFixtures";

const headers = sessionHeaders;
const webUrl = "https://fyp-web.pages.dev";

const makeRecordedSender = () => {
  const messages: EmailMessage[] = [];
  const sender: EmailSender = {
    send: async (message: EmailMessage): Promise<void> => {
      messages.push(message);
    },
  };
  return { sender, messages };
};

const clientContext = (fake: ReturnType<typeof fakeDatabase>, sender: EmailSender) => ({
  headers,
  auth: authWithSession({ name: "Dana Okafor", role: "client", organizationId: "org-acme" }),
  db: fake.db,
  email: sender,
  webUrl,
});

const staffContext = (fake: ReturnType<typeof fakeDatabase>, sender: EmailSender) => ({
  headers,
  auth: authWithSession({ name: "Toni Alvarez", role: "technician", organizationId: null }),
  db: fake.db,
  email: sender,
  webUrl,
});

describe("ticket mail hooks", () => {
  it("mails every technician and admin when a client files a ticket", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["prod-line-9"]]);
    fake.queueRows([["ticket-1"]]);
    fake.queueRows([ticketRow({ priority: "high" })]);
    fake.queueRows([["tech@reliable.test"], ["admin@reliable.test"]]);
    const { sender, messages } = makeRecordedSender();

    const create = router.ticket.create.callable({ context: clientContext(fake, sender) });
    await create({
      productId: "prod-line-9",
      title: "Conveyor belt stops mid-cycle",
      description: "The line halts after roughly twenty minutes of runtime.",
      reporterName: "Dana Okafor",
      priority: "high",
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.to).toEqual(["tech@reliable.test", "admin@reliable.test"]);
    expect(messages[0]?.subject).toContain("[New ticket");
    expect(messages[0]?.html).toContain("/tickets/ticket-1");
  });

  it("stays quiet on filing when no mail sender is configured", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["prod-line-9"]]);
    fake.queueRows([["ticket-1"]]);
    fake.queueRows([ticketRow({ priority: "high" })]);

    const create = router.ticket.create.callable({
      context: {
        headers,
        auth: authWithSession({ name: "Dana Okafor", role: "client", organizationId: "org-acme" }),
        db: fake.db,
      },
    });
    await create({
      productId: "prod-line-9",
      title: "Conveyor belt stops mid-cycle",
      description: "The line halts after roughly twenty minutes of runtime.",
      reporterName: "Dana Okafor",
      priority: "high",
    });

    // No sender means no recipient query either: the filing costs three statements.
    expect(fake.queries).toHaveLength(3);
  });

  it("mails only the new owner on assignment", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["tech-2", "technician", false, "Zoe Park"]]);
    fake.queueRows([[null]]);
    fake.queueRows([["ticket-1"]]);
    fake.queueRows([ticketRow({ status: "in_progress", assignedTo: "tech-2" })]);
    fake.queueRows([["zoe@reliable.test", false]]);
    const { sender, messages } = makeRecordedSender();

    const assign = router.ticket.assign.callable({ context: staffContext(fake, sender) });
    await assign({ ticketId: "ticket-1", assigneeId: "tech-2" });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.to).toEqual(["zoe@reliable.test"]);
    expect(messages[0]?.subject).toContain("[Assigned");
    expect(messages[0]?.html).toContain("Zoe Park");
  });

  it("mails the client org when the status moves, but not on a priority-only tweak", async () => {
    const statusFake = fakeDatabase();
    statusFake.queueRows([["ticket-1"]]);
    statusFake.queueRows([ticketRow({ status: "resolved" })]);
    statusFake.queueRows([["client@acme.test"]]);
    statusFake.queueRows([["staff@reliable.test", false]]);
    const statusMail = makeRecordedSender();

    const setStatus = router.ticket.setStatus.callable({
      context: staffContext(statusFake, statusMail.sender),
    });
    await setStatus({ ticketId: "ticket-1", status: "resolved" });

    expect(statusMail.messages).toHaveLength(1);
    expect(statusMail.messages[0]?.to).toEqual(["client@acme.test"]);
    expect(statusMail.messages[0]?.subject).toContain("[resolved");

    const priorityFake = fakeDatabase();
    priorityFake.queueRows([["ticket-1"]]);
    priorityFake.queueRows([ticketRow({ priority: "urgent" })]);
    const priorityMail = makeRecordedSender();

    const tweak = router.ticket.setStatus.callable({
      context: staffContext(priorityFake, priorityMail.sender),
    });
    await tweak({ ticketId: "ticket-1", priority: "urgent" });

    expect(priorityMail.messages).toHaveLength(0);
  });

  it("mails technicians when a client replies on an unclaimed ticket", async () => {
    const fake = fakeDatabase();
    fake.queueRows([ticketRow({ assignedTo: null, createdBy: "test-user-id" })]);
    fake.queueRows([
      [
        "message-1",
        "ticket-1",
        "test-user-id",
        "The line is still down.",
        "public",
        null,
        null,
        null,
        new Date("2026-03-04T10:00:00Z"),
      ],
    ]);
    fake.queueRows([["client@acme.test", false]]);
    fake.queueRows([["tech@reliable.test"], ["tech2@reliable.test"]]);
    const { sender, messages } = makeRecordedSender();

    const postMessage = router.ticket.postMessage.callable({
      context: clientContext(fake, sender),
    });
    await postMessage({ ticketId: "ticket-1", content: "The line is still down." });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.to).toEqual(["tech@reliable.test", "tech2@reliable.test"]);
    expect(messages[0]?.subject).toContain("[Reply");
  });

  it("never mails for an internal staff note", async () => {
    const fake = fakeDatabase();
    fake.queueRows([ticketRow()]);
    fake.queueRows([
      [
        "message-2",
        "ticket-1",
        "test-user-id",
        "Waiting on parts.",
        "internal",
        null,
        null,
        null,
        new Date("2026-03-04T10:05:00Z"),
      ],
    ]);
    const { sender, messages } = makeRecordedSender();

    const postMessage = router.ticket.postMessage.callable({ context: staffContext(fake, sender) });
    await postMessage({
      ticketId: "ticket-1",
      content: "Waiting on parts.",
      visibility: "internal",
    });

    expect(messages).toHaveLength(0);
    // Ticket read plus the insert: no recipient lookups run for internal notes.
    expect(fake.queries).toHaveLength(2);
  });

  it("mails admins when a ticket is escalated", async () => {
    const fake = fakeDatabase();
    fake.queueRows([["ticket-1"]]);
    fake.queueRows([ticketRow({ escalated: true })]);
    fake.queueRows([["admin@reliable.test"]]);
    const { sender, messages } = makeRecordedSender();

    const escalate = router.ticket.escalate.callable({ context: staffContext(fake, sender) });
    await escalate({ ticketId: "ticket-1", reason: "Needs a spare part." });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.to).toEqual(["admin@reliable.test"]);
    expect(messages[0]?.subject).toContain("[Escalated");
  });
});
