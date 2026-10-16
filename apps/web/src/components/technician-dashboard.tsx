import { Link } from "@tanstack/react-router";
import { CircleDashed, Hand, Inbox, LoaderCircle, Wrench } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RecentTickets, StatCard, StatusBadge } from "@/components/dashboard-cards";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useCaller } from "@/lib/session";
import { summarizeTickets, useSetTicketStatus, useTicketQueue } from "@/lib/tickets";
import type { Ticket } from "@/lib/tickets";

const MY_WORK_LIMIT = 5;

/**
 * Technician home: queue summary, unclaimed tickets with claim buttons, and a
 * My Work section of tickets the signed-in tech owns. Claiming reuses the
 * existing setStatus endpoint, which fills only an empty owner slot.
 */
export function TechnicianDashboard() {
  const { userId } = useCaller();
  const queue = useTicketQueue();
  const tickets = queue.data?.tickets ?? [];
  const summary = summarizeTickets(tickets);

  const unclaimed = tickets.filter((ticket) => ticket.assignedTo === null).slice(0, MY_WORK_LIMIT);
  const mine =
    userId === undefined
      ? []
      : tickets.filter((ticket) => ticket.assignedTo === userId).slice(0, MY_WORK_LIMIT);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Ticket queue"
        description="Every client org, newest first. Claim a ticket to start work."
        icon={Inbox}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Queue" value={summary.total} icon={Inbox} to="/tickets" search={{}} />
        <StatCard
          label="Open"
          value={summary.open}
          icon={CircleDashed}
          to="/tickets"
          search={{ status: "open" }}
        />
        <StatCard
          label="Unclaimed"
          value={summary.unclaimed}
          icon={Hand}
          to="/tickets"
          search={{ scope: "queue" }}
        />
        <StatCard
          label="In Progress"
          value={summary.inProgress}
          icon={LoaderCircle}
          to="/tickets"
          search={{ status: "in_progress" }}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Needs a technician</CardTitle>
          <CardDescription>
            Unclaimed tickets, newest first. Claim one to start work.
          </CardDescription>
        </CardHeader>
        {queue.isPending ? (
          <CardPanel role="status" aria-label="Loading queue">
            <Spinner className="size-4" aria-hidden />
          </CardPanel>
        ) : queue.isError ? (
          <CardPanel className="grid gap-3">
            <p className="text-sm text-destructive" role="alert">
              Could not load the queue. Check your connection and try again.
            </p>
            <div>
              <Button variant="outline" size="sm" onClick={() => void queue.refetch()}>
                Try again
              </Button>
            </div>
          </CardPanel>
        ) : unclaimed.length === 0 ? (
          <CardPanel>
            <p className="text-sm text-muted-foreground">
              The queue is clear. New client tickets land here.
            </p>
          </CardPanel>
        ) : (
          <CardPanel className="grid gap-0 p-0">
            <ul className="divide-y">
              {unclaimed.map((ticket) => (
                <ClaimRow key={ticket.id} ticket={ticket} />
              ))}
            </ul>
          </CardPanel>
        )}
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle>My work</CardTitle>
          </div>
          <CardDescription>Tickets you claimed. Resolve them from the list.</CardDescription>
        </CardHeader>
        {queue.isPending ? (
          <CardPanel role="status" aria-label="Loading my work">
            <Spinner className="size-4" aria-hidden />
          </CardPanel>
        ) : queue.isError ? (
          <CardPanel className="grid gap-3">
            <p className="text-sm text-destructive" role="alert">
              Could not load your work. Check your connection and try again.
            </p>
            <div>
              <Button variant="outline" size="sm" onClick={() => void queue.refetch()}>
                Try again
              </Button>
            </div>
          </CardPanel>
        ) : mine.length === 0 ? (
          <CardPanel>
            <p className="text-sm text-muted-foreground">
              Nothing claimed yet. Claim a ticket above and it shows up here.
            </p>
          </CardPanel>
        ) : (
          <CardPanel className="grid gap-0 p-0">
            <ul className="divide-y">
              {mine.map((ticket) => (
                <li
                  key={ticket.id}
                  className="flex flex-wrap items-center gap-2 px-6 py-3.5 sm:flex-nowrap"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/tickets/$ticketId"
                      params={{ ticketId: ticket.id }}
                      className="block truncate text-sm font-medium text-primary hover:underline"
                    >
                      {ticket.title}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {ticket.organizationName} · {ticket.productName}
                    </p>
                  </div>
                  <StatusBadge status={ticket.status} />
                </li>
              ))}
            </ul>
          </CardPanel>
        )}
      </Card>
      <RecentTickets
        title="Recent activity"
        description="Latest tickets across every org."
        tickets={tickets.slice(0, 8)}
        isPending={queue.isPending}
        isError={queue.isError}
        onRetry={() => void queue.refetch()}
        emptyMessage="No tickets in the queue yet."
        footerTo="/tickets"
        footerLabel="View full queue"
        meta={(ticket) => `${ticket.organizationName} · ${ticket.productName}`}
      />
    </div>
  );
}

function ClaimRow({ ticket }: { readonly ticket: Ticket }) {
  const setStatus = useSetTicketStatus(ticket.id);

  const claim = () => {
    setStatus.mutate({ ticketId: ticket.id, status: "in_progress" });
  };

  return (
    <li className="flex flex-wrap items-center gap-2 px-6 py-3.5 sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <Link
          to="/tickets/$ticketId"
          params={{ ticketId: ticket.id }}
          className="block truncate text-sm font-medium text-primary hover:underline"
        >
          {ticket.title}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {ticket.organizationName} · {ticket.productName} · {ticket.reporterName}
        </p>
      </div>
      <StatusBadge status={ticket.status} />
      <Button
        size="sm"
        variant="outline"
        onClick={claim}
        aria-label={`Claim ticket ${ticket.title}`}
      >
        Claim
      </Button>
      {setStatus.isError && (
        <p className="w-full text-xs text-destructive" role="alert">
          Could not claim this ticket. Try again.
        </p>
      )}
    </li>
  );
}
