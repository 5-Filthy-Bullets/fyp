import { describe, expect, it } from "vitest";
import { fakeDatabase } from "../router.testFixtures";
import type { EmailMessage, EmailSender } from "./types";
import { findReminderCandidates, runTicketReminders } from "./reminders";

const NOW = new Date("2026-03-10T09:00:00Z");
const hoursAgo = (hours: number): Date => new Date(NOW.getTime() - hours * 3_600_000);

/** Positional row for the candidate select: keep the selectCandidate order. */
const candidateRow = (overrides: Record<string, unknown> = {}): readonly unknown[] => {
  const values: Record<string, unknown> = {
    id: "ticket-1",
    title: "Conveyor belt stops mid-cycle",
    status: "open",
    priority: "high",
    reporterName: "Dana Okafor",
    organizationId: "org-acme",
    organizationName: "Acme Manufacturing",
    productName: "Line 9 Controller",
    assignedTo: null,
    createdBy: "client-1",
    createdAt: hoursAgo(120),
    lastReminderAt: null,
    ...overrides,
  };
  return [
    values["id"],
    values["title"],
    values["status"],
    values["priority"],
    values["reporterName"],
    values["organizationId"],
    values["organizationName"],
    values["productName"],
    values["assignedTo"],
    values["createdBy"],
    values["createdAt"],
    values["lastReminderAt"],
  ];
};

const makeRecordedSender = () => {
  const messages: EmailMessage[] = [];
  const sender: EmailSender = {
    send: async (message: EmailMessage): Promise<void> => {
      messages.push(message);
    },
  };
  return { sender, messages };
};

describe("findReminderCandidates", () => {
  it("flags an old unassigned ticket", async () => {
    const fake = fakeDatabase();
    fake.queueRows([candidateRow()]);
    fake.queueRows([]);

    const found = await findReminderCandidates(fake.db, NOW);

    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe("unassigned");
    expect(found[0]?.id).toBe("ticket-1");
  });

  it("sits out a ticket reminded inside the cooldown", async () => {
    const fake = fakeDatabase();
    fake.queueRows([candidateRow({ lastReminderAt: hoursAgo(1) })]);
    fake.queueRows([]);

    await expect(findReminderCandidates(fake.db, NOW)).resolves.toEqual([]);
  });

  it("reminds again once the cooldown has passed", async () => {
    const fake = fakeDatabase();
    fake.queueRows([candidateRow({ lastReminderAt: hoursAgo(30) })]);
    fake.queueRows([]);

    const found = await findReminderCandidates(fake.db, NOW);

    expect(found).toHaveLength(1);
  });

  it("suppresses a stale ticket with a fresh reply", async () => {
    const fake = fakeDatabase();
    fake.queueRows([]);
    fake.queueRows([candidateRow({ status: "in_progress", assignedTo: "tech-1" })]);
    fake.queueRows([[hoursAgo(1)]]);

    await expect(findReminderCandidates(fake.db, NOW)).resolves.toEqual([]);
  });

  it("flags a stale ticket whose thread has gone quiet", async () => {
    const fake = fakeDatabase();
    fake.queueRows([]);
    fake.queueRows([candidateRow({ status: "in_progress", assignedTo: "tech-1" })]);
    fake.queueRows([[hoursAgo(100)]]);

    const found = await findReminderCandidates(fake.db, NOW);

    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe("stale");
  });
});

describe("runTicketReminders", () => {
  it("mails the reminder and stamps the ticket so the next run skips it", async () => {
    const fake = fakeDatabase();
    fake.queueRows([candidateRow()]);
    fake.queueRows([]);
    fake.queueRows([["tech@reliable.test"]]);
    const { sender, messages } = makeRecordedSender();

    const result = await runTicketReminders(fake.db, sender, "https://fyp-web.pages.dev", NOW);

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.to).toEqual(["tech@reliable.test"]);
    expect(messages[0]?.subject).toContain("[Reminder");
    const stamp = fake.queries.find((query) => query.sql.startsWith('update "ticket"'));
    expect(stamp?.params).toEqual([NOW.toISOString(), "ticket-1"]);
  });

  it("does nothing without a sender, and never touches the tickets", async () => {
    const fake = fakeDatabase();

    const result = await runTicketReminders(fake.db, undefined, "https://fyp-web.pages.dev", NOW);

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(fake.queries).toHaveLength(0);
  });
});
