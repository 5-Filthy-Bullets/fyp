import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { formatTicketDate, priorityLabel, statusLabel } from "@/lib/tickets";
import type { Ticket, TicketListSearch, TicketPriority, TicketStatus } from "@/lib/tickets";

const statusVariants: Record<TicketStatus, "info" | "warning" | "success"> = {
  open: "info",
  in_progress: "warning",
  resolved: "success",
};

export function StatusBadge({ status }: { readonly status: TicketStatus }) {
  return <Badge variant={statusVariants[status]}>{statusLabel(status)}</Badge>;
}

const priorityVariants: Record<TicketPriority, "secondary" | "info" | "warning" | "error"> = {
  low: "secondary",
  normal: "info",
  high: "warning",
  urgent: "error",
};

export function PriorityBadge({ priority }: { readonly priority: TicketPriority }) {
  return <Badge variant={priorityVariants[priority]}>{priorityLabel(priority)}</Badge>;
}

interface StatCardProps {
  readonly label: string;
  readonly value: number;
  readonly icon: LucideIcon;
  readonly to: "/" | "/tickets";
  readonly search?: TicketListSearch;
}

/**
 * Stat card across the top of a dashboard. Links into the pre-filtered list
 * the Phase 5 tickets page will honor (`?status=`, `?q=`), so the cards stay
 * useful before that page exists.
 */
export function StatCard({ label, value, icon: Icon, to, search }: StatCardProps) {
  return (
    <Link
      to={to}
      search={search}
      className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="transition-colors hover:bg-accent/50">
        <CardPanel className="flex items-center gap-3 p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4.5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm text-muted-foreground">{label}</span>
            <span className="block text-2xl font-semibold tracking-tight">{value}</span>
          </span>
        </CardPanel>
      </Card>
    </Link>
  );
}

function TableSkeleton({ rows = 4 }: { readonly rows?: number }) {
  return (
    <div className="grid gap-3 p-6" role="status" aria-label="Loading tickets">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Spinner className="size-4" aria-hidden />
          <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function QueryError({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
  return (
    <div className="grid gap-3 p-6">
      <p className="text-sm text-destructive" role="alert">
        {message}
      </p>
      <div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

const recentRowGrid = "grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3";

/**
 * Recent-activity table shared by dashboards: title, product/org meta line,
 * status badge, newest first. Rows link into the ticket detail page.
 */
export function RecentTickets({
  title,
  description,
  tickets,
  isPending,
  isError,
  onRetry,
  emptyMessage,
  footerTo,
  footerLabel,
  meta,
}: {
  readonly title: string;
  readonly description: string;
  readonly tickets: readonly Ticket[] | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly onRetry: () => void;
  readonly emptyMessage: string;
  readonly footerTo?: "/" | "/tickets";
  readonly footerLabel?: string;
  readonly meta: (ticket: Ticket) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {isPending ? (
        <TableSkeleton />
      ) : isError ? (
        <QueryError
          message="Could not load tickets. Check your connection and try again."
          onRetry={onRetry}
        />
      ) : tickets === undefined || tickets.length === 0 ? (
        <CardPanel>
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardPanel>
      ) : (
        <CardPanel className="grid gap-0 p-0">
          <ul className="divide-y">
            {tickets.map((ticket) => (
              <li key={ticket.id} className={cn(recentRowGrid, "px-6 py-3.5")}>
                <div className="min-w-0">
                  <Link
                    to="/tickets/$ticketId"
                    params={{ ticketId: ticket.id }}
                    className="block truncate text-sm font-medium text-primary hover:underline"
                  >
                    {ticket.title}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">{meta(ticket)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={ticket.status} />
                  {ticket.escalated && <Badge variant="error">Escalated</Badge>}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatTicketDate(ticket.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {footerTo !== undefined && footerLabel !== undefined && (
            <div className="border-t px-6 py-3">
              <Link to={footerTo} className="text-sm font-medium text-primary hover:underline">
                {footerLabel}
              </Link>
            </div>
          )}
        </CardPanel>
      )}
    </Card>
  );
}
