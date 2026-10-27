import type { Database } from "../db/client";
import { getActiveUserEmail, listActiveEmails } from "./recipients";
import {
  assignedTemplate,
  escalatedTemplate,
  newReplyTemplate,
  newTicketTemplate,
  statusChangedTemplate,
  type TemplateBody,
} from "./templates";
import type { EmailMessage, EmailSender } from "./types";

/** Smallest ticket shape the notifiers need. Router rows satisfy this. */
export interface NotifiableTicket {
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
}

/**
 * Sends one message without ever failing the caller. Ticket writes must
 * succeed even when the provider is down, so send errors are logged and
 * swallowed here rather than thrown into the oRPC handler.
 */
const deliver = async (
  sender: EmailSender | undefined,
  to: ReadonlyArray<string>,
  body: TemplateBody,
): Promise<void> => {
  if (sender === undefined || to.length === 0) {
    return;
  }
  const message: EmailMessage = { to, subject: body.subject, html: body.html, text: body.text };
  try {
    await sender.send(message);
  } catch (error) {
    console.error(`Ticket email not delivered: ${body.subject}`, error);
  }
};

const without = (emails: ReadonlyArray<string>, exclude: string | null): string[] =>
  exclude === null ? [...emails] : emails.filter((email) => email !== exclude);

/** New ticket filed: every active technician and admin hears about it. */
export const notifyTicketCreated = async (
  db: Database,
  sender: EmailSender | undefined,
  webUrl: string,
  ticket: NotifiableTicket,
): Promise<void> => {
  if (sender === undefined) {
    return;
  }
  const to = await listActiveEmails(db, { roles: ["admin", "technician"] });
  await deliver(sender, without(to, null), newTicketTemplate(ticket, webUrl));
};

/** Ticket handed to a technician: only the new owner is mailed. */
export const notifyTicketAssigned = async (
  db: Database,
  sender: EmailSender | undefined,
  webUrl: string,
  ticket: NotifiableTicket,
  assigneeId: string,
  assigneeName: string,
): Promise<void> => {
  if (sender === undefined) {
    return;
  }
  const email = await getActiveUserEmail(db, assigneeId);
  if (email === null) {
    return;
  }
  await deliver(sender, [email], assignedTemplate(ticket, assigneeName, webUrl));
};

/**
 * Status moved: the client org hears about it. The author keeps no copy,
 * so a technician flipping statuses does not mail themselves.
 */
export const notifyStatusChanged = async (
  db: Database,
  sender: EmailSender | undefined,
  webUrl: string,
  ticket: NotifiableTicket,
  authorUserId: string,
): Promise<void> => {
  if (sender === undefined) {
    return;
  }
  const orgEmails = await listActiveEmails(db, { organizationId: ticket.organizationId });
  const authorEmail = await getActiveUserEmail(db, authorUserId);
  await deliver(sender, without(orgEmails, authorEmail), statusChangedTemplate(ticket, webUrl));
};

/** Escalation raised: admins review it. */
export const notifyEscalated = async (
  db: Database,
  sender: EmailSender | undefined,
  webUrl: string,
  ticket: NotifiableTicket,
  reason: string,
): Promise<void> => {
  if (sender === undefined) {
    return;
  }
  const to = await listActiveEmails(db, { roles: ["admin"] });
  await deliver(sender, to, escalatedTemplate(ticket, reason, webUrl));
};

export interface ReplyNotice {
  readonly authorUserId: string;
  readonly authorName: string;
  readonly authorIsStaff: boolean;
  readonly excerpt: string;
}

/**
 * Public reply posted. Internal notes stay silent: they are staff-only by
 * definition. A staff reply goes to the client org; a client reply goes to
 * the owner when claimed, otherwise to every active technician.
 */
export const notifyNewReply = async (
  db: Database,
  sender: EmailSender | undefined,
  webUrl: string,
  ticket: NotifiableTicket,
  reply: ReplyNotice,
): Promise<void> => {
  if (sender === undefined) {
    return;
  }
  const authorEmail = await getActiveUserEmail(db, reply.authorUserId);

  if (reply.authorIsStaff) {
    const orgEmails = await listActiveEmails(db, { organizationId: ticket.organizationId });
    await deliver(
      sender,
      without(orgEmails, authorEmail),
      newReplyTemplate({ ticket, authorName: reply.authorName, excerpt: reply.excerpt, webUrl }),
    );
    return;
  }

  if (ticket.assignedTo !== null) {
    const ownerEmail = await getActiveUserEmail(db, ticket.assignedTo);
    if (ownerEmail === null) {
      return;
    }
    await deliver(
      sender,
      without([ownerEmail], authorEmail),
      newReplyTemplate({ ticket, authorName: reply.authorName, excerpt: reply.excerpt, webUrl }),
    );
    return;
  }

  const staffEmails = await listActiveEmails(db, { roles: ["technician"] });
  await deliver(
    sender,
    without(staffEmails, authorEmail),
    newReplyTemplate({ ticket, authorName: reply.authorName, excerpt: reply.excerpt, webUrl }),
  );
};
