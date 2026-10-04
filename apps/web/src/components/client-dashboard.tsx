import { Link } from "@tanstack/react-router";
import { CircleDashed, Inbox, LoaderCircle, CircleCheck, TicketPlus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RecentTickets, StatCard } from "@/components/dashboard-cards";
import { Button } from "@/components/ui/button";
import { useMyTickets, summarizeTickets } from "@/lib/tickets";
import { useCaller } from "@/lib/session";

/**
 * Client home: own-org ticket summary, a prominent New Ticket call to action,
 * and a recent-activity table. The CTA and card links point at the pre-filtered
 * list routes Phase 5 will honor; until then they land on the home placeholder.
 */
export function ClientDashboard() {
  const { email } = useCaller();
  const query = useMyTickets();
  const tickets = query.data?.tickets ?? [];
  const summary = summarizeTickets(tickets);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="My tickets"
        description={
          email === undefined
            ? "Your organization's support tickets."
            : `Support tickets for your organization · signed in as ${email}.`
        }
        icon={Inbox}
        actions={
          <Button render={<Link to="/" search={{ q: "new" }} />}>
            <TicketPlus aria-hidden />
            New ticket
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={summary.total} icon={Inbox} to="/" search={{}} />
        <StatCard
          label="Open"
          value={summary.open}
          icon={CircleDashed}
          to="/"
          search={{ status: "open" }}
        />
        <StatCard
          label="In Progress"
          value={summary.inProgress}
          icon={LoaderCircle}
          to="/"
          search={{ status: "in_progress" }}
        />
        <StatCard
          label="Resolved"
          value={summary.resolved}
          icon={CircleCheck}
          to="/"
          search={{ status: "resolved" }}
        />
      </div>
      <RecentTickets
        title="Recent activity"
        description="Your newest tickets, newest first."
        tickets={tickets.slice(0, 8)}
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        emptyMessage="No tickets yet. File your first ticket with the New ticket button above."
        footerTo="/"
        footerLabel="View all my tickets"
        meta={(ticket) => `${ticket.productName} · ${ticket.reporterName}`}
      />
    </div>
  );
}
