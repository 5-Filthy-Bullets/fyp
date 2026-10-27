import { and, asc, desc, eq, isNull, lt } from "drizzle-orm";
import type { Database } from "../db/client";
import { organization, product, ticket, ticketMessage } from "../db/schema";
import { getActiveUserEmail, listActiveEmails } from "./recipients";
import { reminderTemplate, type ReminderKind } from "./templates";
import type { EmailSender } from "./types";

export interface ReminderCandidate {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly productName: string;
  readonly reporterName: string;
  readonly assignedTo: string | null;
  readonly createdBy: string | null;
  readonly kind: ReminderKind;
  readonly createdAt: Date;
  readonly lastReminderAt: Date | null;
}

export interface ReminderOptions {
  /** Open tickets older than this with no owner get nudged. */
  readonly unassignedAfterHours?: number;
  /** In-progress tickets quieter than this get nudged. */
  readonly staleAfterHours?: number;
  /** Minimum gap between two reminders for the same ticket. */
  readonly cooldownHours?: number;
}

const HOUR_MS = 3_600_000;

const cooledDown = (
  candidate: { lastReminderAt: Date | null },
  now: Date,
  cooldownMs: number,
): boolean =>
  candidate.lastReminderAt === null ||
  now.getTime() - candidate.lastReminderAt.getTime() >= cooldownMs;

const selectCandidate = {
  id: ticket.id,
  title: ticket.title,
  status: ticket.status,
  priority: ticket.priority,
  reporterName: ticket.reporterName,
  organizationId: ticket.organizationId,
  organizationName: organization.name,
  productName: product.name,
  assignedTo: ticket.assignedTo,
  createdBy: ticket.createdBy,
  createdAt: ticket.createdAt,
  lastReminderAt: ticket.lastReminderAt,
};

/**
 * Tickets the daily cron should nudge. Unassigned open tickets older than
 * the unassigned window, plus in-progress tickets with no reply inside the
 * stale window. Recently reminded tickets sit out the cooldown.
 */
export const findReminderCandidates = async (
  db: Database,
  now: Date,
  options: ReminderOptions = {},
): Promise<ReminderCandidate[]> => {
  const unassignedAfterMs = (options.unassignedAfterHours ?? 24) * HOUR_MS;
  const staleAfterMs = (options.staleAfterHours ?? 72) * HOUR_MS;
  const cooldownMs = (options.cooldownHours ?? 24) * HOUR_MS;

  const unassignedRows = await db
    .select(selectCandidate)
    .from(ticket)
    .innerJoin(organization, eq(ticket.organizationId, organization.id))
    .innerJoin(product, eq(ticket.productId, product.id))
    .where(
      and(
        eq(ticket.status, "open"),
        isNull(ticket.assignedTo),
        lt(ticket.createdAt, new Date(now.getTime() - unassignedAfterMs)),
      ),
    )
    .orderBy(asc(ticket.createdAt));

  const staleRows = await db
    .select(selectCandidate)
    .from(ticket)
    .innerJoin(organization, eq(ticket.organizationId, organization.id))
    .innerJoin(product, eq(ticket.productId, product.id))
    .where(
      and(
        eq(ticket.status, "in_progress"),
        lt(ticket.createdAt, new Date(now.getTime() - staleAfterMs)),
      ),
    )
    .orderBy(asc(ticket.createdAt));

  const candidates: ReminderCandidate[] = unassignedRows
    .filter((row) => cooledDown(row, now, cooldownMs))
    .map((row) => ({ ...row, kind: "unassigned" as const }));

  for (const row of staleRows) {
    if (!cooledDown(row, now, cooldownMs)) {
      continue;
    }
    const [latest] = await db
      .select({ createdAt: ticketMessage.createdAt })
      .from(ticketMessage)
      .where(eq(ticketMessage.ticketId, row.id))
      .orderBy(desc(ticketMessage.createdAt))
      .limit(1);
    if (latest && latest.createdAt.getTime() > now.getTime() - staleAfterMs) {
      continue;
    }
    candidates.push({ ...row, kind: "stale" });
  }

  return candidates;
};

export interface ReminderRun {
  readonly sent: number;
  readonly failed: number;
}

/**
 * Sends one reminder per candidate and stamps `lastReminderAt` on success.
 * A failing ticket is counted and skipped, never aborting the rest of the
 * run. Resolved tickets never appear: the finder only returns open and
 * in-progress work.
 */
export const runTicketReminders = async (
  db: Database,
  sender: EmailSender | undefined,
  webUrl: string,
  now: Date,
  options: ReminderOptions = {},
): Promise<ReminderRun> => {
  if (sender === undefined) {
    return { sent: 0, failed: 0 };
  }

  const candidates = await findReminderCandidates(db, now, options);
  let sent = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      const to =
        candidate.kind === "unassigned" || candidate.assignedTo === null
          ? await listActiveEmails(db, { roles: ["technician"] })
          : await ownerOrStaff(db, candidate.assignedTo);

      if (to.length === 0) {
        continue;
      }

      await sender.send({
        to,
        ...reminderTemplate({ ticket: candidate, kind: candidate.kind, webUrl }),
      });

      await db.update(ticket).set({ lastReminderAt: now }).where(eq(ticket.id, candidate.id));
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(`Reminder not delivered for ticket ${candidate.id}`, error);
    }
  }

  return { sent, failed };
};

const ownerOrStaff = async (db: Database, ownerId: string): Promise<string[]> => {
  const ownerEmail = await getActiveUserEmail(db, ownerId);
  if (ownerEmail !== null) {
    return [ownerEmail];
  }
  return listActiveEmails(db, { roles: ["technician"] });
};
