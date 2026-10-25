/**
 * Pure template builders for ticket mail. They take row data and return a
 * subject plus HTML/text bodies; sending stays in the sender so these are
 * trivially testable without network access.
 */

export interface TemplateTicket {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly organizationName: string;
  readonly productName: string;
  readonly reporterName: string;
}

export interface TemplateBody {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export const ticketUrl = (webUrl: string, ticketId: string): string =>
  `${webUrl.replace(/\/+$/, "")}/tickets/${ticketId}`;

const shortId = (id: string): string => id.slice(0, 8);

const layout = (input: {
  readonly heading: string;
  readonly intro: string;
  readonly rows: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  readonly ctaUrl: string;
}): string => {
  const rows = input.rows
    .map(
      (row) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#5b5b5b;vertical-align:top;">${row.label}</td>` +
        `<td style="padding:6px 0;vertical-align:top;">${row.value}</td></tr>`,
    )
    .join("");

  return (
    `<div style="font-family:'IBM Plex Sans',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">` +
    `<h2 style="font-size:18px;margin:0 0 12px;">${input.heading}</h2>` +
    `<p style="font-size:14px;line-height:1.5;">${input.intro}</p>` +
    `<table style="font-size:14px;border-collapse:collapse;margin:12px 0;">${rows}</table>` +
    `<a href="${input.ctaUrl}" style="display:inline-block;margin-top:8px;padding:10px 18px;` +
    `background:#1a1a1a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;">Open ticket</a>` +
    `</div>`
  );
};

const detailRows = (ticket: TemplateTicket): ReadonlyArray<{ label: string; value: string }> => [
  { label: "Ticket", value: `${ticket.title} (#${shortId(ticket.id)})` },
  { label: "Client", value: ticket.organizationName },
  { label: "Product", value: ticket.productName },
  { label: "Status", value: ticket.status },
  { label: "Priority", value: ticket.priority },
  { label: "Reporter", value: ticket.reporterName },
];

export const newTicketTemplate = (ticket: TemplateTicket, webUrl: string): TemplateBody => {
  const url = ticketUrl(webUrl, ticket.id);
  const subject = `[New ticket #${shortId(ticket.id)}] ${ticket.title}`;
  const intro = `A new ticket was filed by ${ticket.reporterName} and needs triage.`;
  return {
    subject,
    html: layout({ heading: subject, intro, rows: detailRows(ticket), ctaUrl: url }),
    text: `${subject}\n${intro}\nClient: ${ticket.organizationName}\nProduct: ${ticket.productName}\nOpen: ${url}`,
  };
};

export const assignedTemplate = (
  ticket: TemplateTicket,
  assigneeName: string,
  webUrl: string,
): TemplateBody => {
  const url = ticketUrl(webUrl, ticket.id);
  const subject = `[Assigned #${shortId(ticket.id)}] ${ticket.title}`;
  const intro = `${assigneeName}, this ticket is now yours.`;
  return {
    subject,
    html: layout({ heading: subject, intro, rows: detailRows(ticket), ctaUrl: url }),
    text: `${subject}\n${intro}\nClient: ${ticket.organizationName}\nProduct: ${ticket.productName}\nOpen: ${url}`,
  };
};

export const statusChangedTemplate = (ticket: TemplateTicket, webUrl: string): TemplateBody => {
  const url = ticketUrl(webUrl, ticket.id);
  const subject = `[${ticket.status} #${shortId(ticket.id)}] ${ticket.title}`;
  const intro = `Your ticket moved to ${ticket.status}.`;
  return {
    subject,
    html: layout({ heading: subject, intro, rows: detailRows(ticket), ctaUrl: url }),
    text: `${subject}\n${intro}\nProduct: ${ticket.productName}\nOpen: ${url}`,
  };
};

export const escalatedTemplate = (
  ticket: TemplateTicket,
  reason: string,
  webUrl: string,
): TemplateBody => {
  const url = ticketUrl(webUrl, ticket.id);
  const subject = `[Escalated #${shortId(ticket.id)}] ${ticket.title}`;
  const intro = `Flagged for admin review: ${reason}`;
  return {
    subject,
    html: layout({
      heading: subject,
      intro,
      rows: detailRows(ticket),
      ctaUrl: url,
    }),
    text: `${subject}\n${intro}\nClient: ${ticket.organizationName}\nOpen: ${url}`,
  };
};

export const newReplyTemplate = (input: {
  readonly ticket: TemplateTicket;
  readonly authorName: string;
  readonly excerpt: string;
  readonly webUrl: string;
}): TemplateBody => {
  const url = ticketUrl(input.webUrl, input.ticket.id);
  const subject = `[Reply #${shortId(input.ticket.id)}] ${input.ticket.title}`;
  const intro = `${input.authorName} replied: ${input.excerpt}`;
  return {
    subject,
    html: layout({ heading: subject, intro, rows: detailRows(input.ticket), ctaUrl: url }),
    text: `${subject}\n${intro}\nOpen: ${url}`,
  };
};

/** Reminder reason, kept as a literal so the cron and the template agree. */
export type ReminderKind = "unassigned" | "stale";

export const reminderTemplate = (input: {
  readonly ticket: TemplateTicket;
  readonly kind: ReminderKind;
  readonly webUrl: string;
}): TemplateBody => {
  const url = ticketUrl(input.webUrl, input.ticket.id);
  const subject = `[Reminder #${shortId(input.ticket.id)}] ${input.ticket.title}`;
  const intro =
    input.kind === "unassigned"
      ? "This ticket is still unassigned. Claim it so the client is not left waiting."
      : "This ticket has been in progress for a while. Post an update so the client knows where it stands.";
  return {
    subject,
    html: layout({ heading: subject, intro, rows: detailRows(input.ticket), ctaUrl: url }),
    text: `${subject}\n${intro}\nClient: ${input.ticket.organizationName}\nOpen: ${url}`,
  };
};
