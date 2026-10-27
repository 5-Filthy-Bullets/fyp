import { describe, expect, it } from "vitest";
import {
  assignedTemplate,
  escalatedTemplate,
  newReplyTemplate,
  newTicketTemplate,
  reminderTemplate,
  statusChangedTemplate,
  ticketUrl,
} from "./templates";

const ticket = {
  id: "ticket-abc-123",
  title: "Conveyor belt stops mid-cycle",
  status: "open",
  priority: "high",
  organizationName: "Acme Manufacturing",
  productName: "Line 9 Controller",
  reporterName: "Dana Okafor",
};

describe("ticket mail templates", () => {
  it("links new-ticket mail at the detail page with a short id", () => {
    const body = newTicketTemplate(ticket, "https://fyp-web.pages.dev");

    expect(body.subject).toBe("[New ticket #ticket-a] Conveyor belt stops mid-cycle");
    expect(body.html).toContain("https://fyp-web.pages.dev/tickets/ticket-abc-123");
    expect(body.text).toContain("https://fyp-web.pages.dev/tickets/ticket-abc-123");
    expect(body.text).toContain("Acme Manufacturing");
  });

  it("tolerates a web url with a trailing slash", () => {
    expect(ticketUrl("https://fyp-web.pages.dev/", ticket.id)).toBe(
      "https://fyp-web.pages.dev/tickets/ticket-abc-123",
    );
  });

  it("names the owner in assignment mail", () => {
    const body = assignedTemplate(ticket, "Toni Alvarez", "https://fyp-web.pages.dev");

    expect(body.subject).toContain("[Assigned");
    expect(body.html).toContain("Toni Alvarez");
    expect(body.text).toContain("Toni Alvarez");
  });

  it("carries the new status so the client knows what changed", () => {
    const body = statusChangedTemplate(
      { ...ticket, status: "resolved" },
      "https://fyp-web.pages.dev",
    );

    expect(body.subject).toContain("[resolved");
    expect(body.text).toContain("resolved");
  });

  it("keeps the escalation reason in the admin mail", () => {
    const body = escalatedTemplate(ticket, "Needs a spare part", "https://fyp-web.pages.dev");

    expect(body.html).toContain("Needs a spare part");
    expect(body.text).toContain("Needs a spare part");
  });

  it("quotes who replied and what they said", () => {
    const body = newReplyTemplate({
      ticket,
      authorName: "Toni Alvarez",
      excerpt: "Looking into the controller logs now.",
      webUrl: "https://fyp-web.pages.dev",
    });

    expect(body.html).toContain("Toni Alvarez");
    expect(body.html).toContain("Looking into the controller logs now.");
  });

  it("words unassigned and stale reminders differently", () => {
    const webUrl = "https://fyp-web.pages.dev";
    const unassigned = reminderTemplate({ ticket, kind: "unassigned", webUrl });
    const stale = reminderTemplate({ ticket, kind: "stale", webUrl });

    expect(unassigned.text).toContain("unassigned");
    expect(stale.text).toContain("in progress");
    expect(unassigned.subject).not.toBe(stale.text);
  });
});
