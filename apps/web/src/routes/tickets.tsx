import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Inbox, TicketPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SessionGuard } from "@/components/auth-guard";
import { PriorityBadge, StatusBadge } from "@/components/dashboard-cards";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useCaller } from "@/lib/session";
import { formatTicketDate, statusLabel, ticketStatuses } from "@/lib/tickets";
import type { Ticket, TicketListSearch, TicketStatus } from "@/lib/tickets";
import { useMyTickets, useTicketQueue } from "@/lib/tickets";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 250;
const ALL_STATUSES = "all";
const SCOPE_QUEUE = "queue";
const SCOPE_MINE = "mine";
const SCOPE_ALL = "all";
const SCOPE_ESCALATED = "escalated";

type TechScope = "queue" | "mine";
type AdminScope = "all" | "escalated";
type StatusFilter = TicketStatus | typeof ALL_STATUSES;

/** Search ?q= is owned by the topbar too, so the hook reads it, not local state. */
const useDebouncedValue = (value: string, delayMs: number): string => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
};

const matchesQuery = (ticket: Ticket, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return true;
  }
  return [ticket.title, ticket.description, ticket.reporterName, ticket.productName]
    .join(" ")
    .toLowerCase()
    .includes(needle);
};

const matchesScope = (
  ticket: Ticket,
  scope: string,
  userId: string | undefined,
  role: string | undefined,
): boolean => {
  if (scope === SCOPE_MINE) {
    return userId !== undefined && ticket.assignedTo === userId;
  }
  if (scope === SCOPE_QUEUE) {
    return ticket.assignedTo === null;
  }
  if (scope === SCOPE_ESCALATED) {
    return ticket.escalated;
  }
  if (role === "technician" && scope === SCOPE_ALL) {
    return true;
  }
  return true;
};

export function TicketsPage() {
  return (
    <SessionGuard mode="signed-in">
      <AppShell>
        <TicketsList />
      </AppShell>
    </SessionGuard>
  );
}

function TicketsList() {
  const { role, userId } = useCaller();
  const search: TicketListSearch = useSearch({ strict: false });
  const navigate = useNavigate();

  const urlQuery = typeof search.q === "string" ? search.q : "";
  const [queryInput, setQueryInput] = useState(urlQuery);
  const debouncedQuery = useDebouncedValue(queryInput, SEARCH_DEBOUNCE_MS);

  // The topbar parks ?q= on "/", so sync its value in when arriving from there.
  useEffect(() => {
    setQueryInput(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    if (debouncedQuery === urlQuery) {
      return;
    }
    void navigate({
      to: "/tickets",
      search: (prev) =>
        debouncedQuery.trim() === ""
          ? { ...prev, q: undefined }
          : { ...prev, q: debouncedQuery.trim() },
      replace: true,
    });
  }, [debouncedQuery, navigate, urlQuery]);

  const initialStatus: StatusFilter =
    search.status !== undefined && (ticketStatuses as readonly string[]).includes(search.status)
      ? (search.status as TicketStatus)
      : ALL_STATUSES;
  const [status, setStatus] = useState<StatusFilter>(initialStatus);

  useEffect(() => {
    const fromUrl =
      search.status !== undefined && (ticketStatuses as readonly string[]).includes(search.status)
        ? (search.status as TicketStatus)
        : ALL_STATUSES;
    setStatus(fromUrl);
  }, [search.status]);

  const escalatedFromUrl = search.escalated === "true";
  const scopeFromUrl: TechScope = search.scope === "mine" ? SCOPE_MINE : SCOPE_QUEUE;
  const techTabs: readonly TechScope[] = ["queue", "mine"];
  const adminTabs: readonly AdminScope[] = ["all", "escalated"];
  const defaultTechScope: TechScope = role === "technician" ? scopeFromUrl : SCOPE_MINE;
  const defaultAdminScope: AdminScope = escalatedFromUrl ? SCOPE_ESCALATED : SCOPE_ALL;
  const [techScope, setTechScope] = useState<TechScope>(defaultTechScope);
  const [adminScope, setAdminScope] = useState<AdminScope>(defaultAdminScope);

  useEffect(() => {
    if (role === "technician") {
      setTechScope(scopeFromUrl);
    }
  }, [scopeFromUrl, role]);

  useEffect(() => {
    if (role === "admin") {
      setAdminScope(escalatedFromUrl ? SCOPE_ESCALATED : SCOPE_ALL);
    }
  }, [escalatedFromUrl, role]);

  const [page, setPage] = useState(1);

  const clientQuery = useMyTickets();
  const staffQuery = useTicketQueue(
    role === "admin" && adminScope === SCOPE_ESCALATED ? true : undefined,
  );
  const isStaff = role === "technician" || role === "admin";
  const query = isStaff ? staffQuery : clientQuery;
  const tickets = useMemo(
    () => query.data?.tickets ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data],
  );

  const scope = role === "technician" ? techScope : role === "admin" ? adminScope : SCOPE_ALL;

  const filtered = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    return tickets.filter(
      (ticket) =>
        (status === ALL_STATUSES || ticket.status === status) &&
        matchesScope(ticket, scope, userId, role) &&
        (needle === "" || matchesQuery(ticket, needle)),
    );
  }, [debouncedQuery, role, scope, status, tickets, userId]);

  // A filter change can strand the page past the last page, so reset to page 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, scope, status, techScope, adminScope, role]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const setStatusFilter = (next: StatusFilter) => {
    setStatus(next);
    void navigate({
      to: "/tickets",
      search: (prev) =>
        next === ALL_STATUSES ? { ...prev, status: undefined } : { ...prev, status: next },
      replace: true,
    });
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title={
          role === "client" ? "My tickets" : role === "technician" ? "Ticket queue" : "Tickets"
        }
        description={
          role === "client"
            ? "Every ticket your organization filed, newest first."
            : role === "technician"
              ? "Every client org, newest first. Tabs split the unclaimed queue from your work."
              : "Every ticket across every org. The escalated tab mirrors the dashboard card."
        }
        icon={Inbox}
        actions={
          role === "client" ? (
            <Button render={<Link to="/tickets/new" />}>
              <TicketPlus aria-hidden />
              New ticket
            </Button>
          ) : undefined
        }
      />

      {(role === "technician" || role === "admin") && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Ticket scope">
          {role === "technician"
            ? techTabs.map((tab) => (
                <ScopeTab
                  key={tab}
                  active={techScope === tab}
                  label={tab === SCOPE_QUEUE ? "Queue" : "My work"}
                  onSelect={() => {
                    setTechScope(tab);
                    void navigate({
                      to: "/tickets",
                      search: (prev) =>
                        tab === SCOPE_MINE
                          ? { ...prev, scope: "mine" }
                          : { ...prev, scope: "queue" },
                      replace: true,
                    });
                  }}
                />
              ))
            : adminTabs.map((tab) => (
                <ScopeTab
                  key={tab}
                  active={adminScope === tab}
                  label={tab === SCOPE_ALL ? "All" : "Escalated"}
                  onSelect={() => {
                    setAdminScope(tab);
                    void navigate({
                      to: "/tickets",
                      search: (prev) =>
                        tab === SCOPE_ESCALATED
                          ? { ...prev, escalated: "true" }
                          : { ...prev, escalated: undefined },
                      replace: true,
                    });
                  }}
                />
              ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-1.5">
          <Label htmlFor="ticket-search">Search</Label>
          <Input
            id="ticket-search"
            type="search"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="Search title, description, reporter…"
            aria-label="Search tickets"
          />
        </div>
        <fieldset className="grid gap-1.5">
          <legend className="text-sm font-medium">Status</legend>
          <div className="flex flex-wrap gap-2">
            <StatusFilterButton
              active={status === ALL_STATUSES}
              label="All"
              onSelect={() => setStatusFilter(ALL_STATUSES)}
            />
            {ticketStatuses.map((value) => (
              <StatusFilterButton
                key={value}
                active={status === value}
                label={statusLabel(value)}
                onSelect={() => setStatusFilter(value)}
              />
            ))}
          </div>
        </fieldset>
      </div>

      {query.isPending ? (
        <Card>
          <CardPanel role="status" aria-label="Loading tickets">
            <Spinner className="size-4" aria-hidden />
          </CardPanel>
        </Card>
      ) : query.isError ? (
        <Card>
          <CardPanel className="grid gap-3">
            <p className="text-sm text-destructive" role="alert">
              Could not load tickets. Check your connection and try again.
            </p>
            <div>
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          </CardPanel>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardPanel>
            <p className="text-sm text-muted-foreground">
              {tickets.length === 0
                ? role === "client"
                  ? "No tickets yet. File your first ticket with the New ticket button above."
                  : "The queue is clear. New client tickets land here."
                : "No tickets match these filters. Clear the search or pick another status."}
            </p>
          </CardPanel>
        </Card>
      ) : (
        <Card>
          <CardPanel className="grid gap-0 p-0">
            <ul className="divide-y">
              {visible.map((ticket) => (
                <li key={ticket.id} className="px-6 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/tickets/$ticketId"
                      params={{ ticketId: ticket.id }}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-primary hover:underline"
                    >
                      {ticket.title}
                    </Link>
                    <StatusBadge status={ticket.status} />
                    <PriorityBadge priority={ticket.priority} />
                    {ticket.escalated && <Badge variant="error">Escalated</Badge>}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {isStaff
                      ? `${ticket.organizationName} · ${ticket.productName} · ${ticket.reporterName}`
                      : `${ticket.productName} · ${ticket.reporterName}`}{" "}
                    · {formatTicketDate(ticket.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
            {pageCount > 1 && (
              <div className="flex items-center justify-between border-t px-6 py-3">
                <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                  Page {safePage} of {pageCount} · {filtered.length} tickets
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setPage(safePage - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage >= pageCount}
                    onClick={() => setPage(safePage + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardPanel>
        </Card>
      )}
    </div>
  );
}

function ScopeTab({
  active,
  label,
  onSelect,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onSelect: () => void;
}) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
    >
      {label}
    </Button>
  );
}

function StatusFilterButton({
  active,
  label,
  onSelect,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onSelect: () => void;
}) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      aria-pressed={active}
      onClick={onSelect}
    >
      {label}
    </Button>
  );
}
