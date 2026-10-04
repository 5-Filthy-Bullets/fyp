import { CircleDashed, Inbox, LoaderCircle, CircleCheck, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RecentTickets, StatCard } from "@/components/dashboard-cards";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { summarizeTickets, useTicketQueue } from "@/lib/tickets";

/**
 * Admin home: fleet-wide stat cards linking into pre-filtered lists, the
 * recent-activity table, and the escalated view. Escalation has no backend
 * yet (Phase 6), so that card always renders its empty state; it lights up
 * once the flag exists.
 */
export function AdminDashboard() {
  const queue = useTicketQueue();
  const tickets = queue.data?.tickets ?? [];
  const summary = summarizeTickets(tickets);
  const escalated: readonly [] = [];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Dashboard"
        description="Every client org at a glance. Cards link into pre-filtered lists."
        icon={Inbox}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
        <StatCard label="Urgent" value={0} icon={TriangleAlert} to="/" search={{ q: "urgent" }} />
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
          footerTo="/"
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
              Tickets raised above the normal queue. Escalation lands in Phase 6.
            </CardDescription>
          </CardHeader>
          <CardPanel>
            {escalated.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing escalated right now. This view lights up once escalation exists.
              </p>
            )}
          </CardPanel>
        </Card>
      </div>
    </div>
  );
}
