import { Link } from "@tanstack/react-router";
import { CircleDashed, Inbox, LoaderCircle, CircleCheck, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RecentTickets, StatCard } from "@/components/dashboard-cards";
import { TicketTitleLink } from "@/components/ticket-link";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { summarizeTickets, useTicketQueue } from "@/lib/tickets";

/**
 * Admin home: fleet-wide stat cards linking into pre-filtered lists, the
 * recent-activity table, and the escalated view backed by the ticket flag.
 */
export function AdminDashboard() {
  const queue = useTicketQueue();
  const escalatedQuery = useTicketQueue(true);
  const tickets = queue.data?.tickets ?? [];
  const summary = summarizeTickets(tickets);
  const escalated = escalatedQuery.data?.tickets ?? [];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Dashboard"
        description="Every client org at a glance. Cards link into pre-filtered lists."
        icon={Inbox}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total" value={summary.total} icon={Inbox} to="/tickets" search={{}} />
        <StatCard
          label="Open"
          value={summary.open}
          icon={CircleDashed}
          to="/tickets"
          search={{ status: "open" }}
        />
        <StatCard
          label="In Progress"
          value={summary.inProgress}
          icon={LoaderCircle}
          to="/tickets"
          search={{ status: "in_progress" }}
        />
        <StatCard
          label="Resolved"
          value={summary.resolved}
          icon={CircleCheck}
          to="/tickets"
          search={{ status: "resolved" }}
        />
        <StatCard
          label="Escalated"
          value={summary.escalated}
          icon={TriangleAlert}
          to="/tickets"
          search={{ escalated: "true" }}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <RecentTickets
          title="Recent activity"
          description="Latest tickets across every org."
          tickets={tickets.slice(0, 8)}
          isPending={queue.isPending}
          isError={queue.isError}
          onRetry={() => void queue.refetch()}
          emptyMessage="No tickets yet. Client tickets land here."
          footerTo="/tickets"
          footerLabel="View all tickets"
          meta={(ticket) => `${ticket.organizationName} · ${ticket.productName}`}
        />
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>Escalated</CardTitle>
            </div>
            <CardDescription>
              Tickets raised above the normal queue for admin review.
            </CardDescription>
          </CardHeader>
          {escalatedQuery.isPending ? (
            <CardPanel role="status" aria-label="Loading escalated tickets">
              <Spinner className="size-4" aria-hidden />
            </CardPanel>
          ) : escalatedQuery.isError ? (
            <CardPanel className="grid gap-3">
              <p className="text-sm text-destructive" role="alert">
                Could not load escalated tickets. Check your connection and try again.
              </p>
              <div>
                <Button variant="outline" size="sm" onClick={() => void escalatedQuery.refetch()}>
                  Try again
                </Button>
              </div>
            </CardPanel>
          ) : escalated.length === 0 ? (
            <CardPanel>
              <p className="text-sm text-muted-foreground">
                Nothing escalated right now. Technician escalations land here.
              </p>
            </CardPanel>
          ) : (
            <CardPanel className="grid gap-0 p-0">
              <ul className="divide-y">
                {escalated.slice(0, 8).map((ticket) => (
                  <li key={ticket.id} className="px-6 py-3.5">
                    <TicketTitleLink ticketId={ticket.id} title={ticket.title} />
                    <p className="truncate text-xs text-muted-foreground">
                      {ticket.organizationName} · {ticket.escalatedReason ?? "No reason given"}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="border-t px-6 py-3">
                <Link
                  to="/tickets"
                  search={{ escalated: "true" }}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View all escalated
                </Link>
              </div>
            </CardPanel>
          )}
        </Card>
      </div>
    </div>
  );
}
