import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Search, TicketPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SessionGuard } from "@/components/auth-guard";
import { PriorityBadge, StatusBadge } from "@/components/dashboard-cards";
import { TicketTitleLink } from "@/components/ticket-link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCaller } from "@/lib/session";
import {
  segmentedControlItemVariants,
  segmentedControlRootClassName,
} from "@/lib/segmented-control";
import {
  formatTicketDate,
  priorityLabel,
  statusLabel,
  ticketPriorities,
  ticketStatuses,
} from "@/lib/tickets";
import type { Ticket, TicketListSearch, TicketStatus } from "@/lib/tickets";
import { useMyTickets, useTicketQueue } from "@/lib/tickets";
import { useBackgroundTicketPrefetch } from "@/lib/tickets";
import { ALL_PRIORITIES, useTicketListStore } from "@/stores/ticket-list-store";
import type { TicketPriorityFilter } from "@/stores/ticket-list-store";

const SEARCH_DEBOUNCE_MS = 250;
const ALL_STATUSES = "all";
const SCOPE_QUEUE = "queue";
const SCOPE_MINE = "mine";
const SCOPE_ALL = "all";
const SCOPE_ESCALATED = "escalated";

type TechScope = "queue" | "mine";
type AdminScope = "all" | "escalated";
type StatusFilter = TicketStatus | typeof ALL_STATUSES;
type PriorityFilter = TicketPriorityFilter;

const columnHelper = createColumnHelper<Ticket>();

/** Search ?q= arrives via shared links, so the hook reads it, not local state. */
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

  // Shared links can carry ?q=, so sync its value in on arrival.
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
  // The sidebar owns the admin All/Escalated split via ?escalated=, so the
  // scope derives straight from the URL with no in-page tabs.
  const adminScope: AdminScope = escalatedFromUrl ? SCOPE_ESCALATED : SCOPE_ALL;
  const defaultTechScope: TechScope = role === "technician" ? scopeFromUrl : SCOPE_MINE;
  const [techScope, setTechScope] = useState<TechScope>(defaultTechScope);

  useEffect(() => {
    if (role === "technician") {
      setTechScope(scopeFromUrl);
    }
  }, [scopeFromUrl, role]);

  // Canonical staff scope URLs: a bare /tickets means "queue" for technicians
  // and "all" (?escalated=false) for admins. Writing it into the URL keeps the
  // sidebar highlight, the tab state, and shared links in agreement instead
  // of leaving a param-less URL no nav entry owns.
  const needsTechScope = role === "technician" && search.scope === undefined;
  const needsAdminScope = role === "admin" && search.escalated === undefined;
  useEffect(() => {
    if (!needsTechScope && !needsAdminScope) {
      return;
    }
    void navigate({
      to: "/tickets",
      search: (prev) => ({
        ...prev,
        ...(needsTechScope ? { scope: SCOPE_QUEUE } : {}),
        ...(needsAdminScope ? { escalated: "false" } : {}),
      }),
      replace: true,
    });
  }, [needsTechScope, needsAdminScope, navigate]);

  // Priority, sorting, and pagination live in the ticket-list store so the
  // filter controls subscribe narrowly instead of re-rendering the whole
  // list on every tweak. q/status/scope stay in the URL (shared links).
  const priority = useTicketListStore((state) => state.priority);
  const setPriority = useTicketListStore((state) => state.setPriority);
  const sorting = useTicketListStore((state) => state.sorting);
  const setSorting = useTicketListStore((state) => state.setSorting);
  const pagination = useTicketListStore((state) => state.pagination);
  const setPagination = useTicketListStore((state) => state.setPagination);
  const resetPage = useTicketListStore((state) => state.resetPage);

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
        (priority === ALL_PRIORITIES || ticket.priority === priority) &&
        matchesScope(ticket, scope, userId, role) &&
        (needle === "" || matchesQuery(ticket, needle)),
    );
  }, [debouncedQuery, priority, role, scope, status, tickets, userId]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("title", {
        cell: (info) => {
          const ticket = info.row.original;
          return (
            <div className="min-w-52">
              <TicketTitleLink ticketId={ticket.id} title={ticket.title} />
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {isStaff
                  ? `${ticket.organizationName} · ${ticket.productName} · ${ticket.reporterName}`
                  : `${ticket.productName} · ${ticket.reporterName}`}
              </p>
            </div>
          );
        },
        header: "Ticket",
      }),
      columnHelper.accessor("status", {
        cell: (info) => <StatusBadge status={info.getValue()} />,
        header: "Status",
      }),
      columnHelper.accessor("priority", {
        cell: (info) => (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={info.getValue()} />
            {info.row.original.escalated && <Badge variant="error">Escalated</Badge>}
          </span>
        ),
        header: "Priority",
      }),
      columnHelper.accessor("createdAt", {
        cell: (info) => (
          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {formatTicketDate(info.getValue())}
          </span>
        ),
        header: "Created",
      }),
    ],
    [isStaff],
  );

  const table = useReactTable({
    autoResetPageIndex: false,
    columns,
    data: filtered,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // The table hands over updaters; resolve them against the store first.
    onPaginationChange: (updater) =>
      setPagination(typeof updater === "function" ? updater(pagination) : updater),
    onSortingChange: (updater) =>
      setSorting(typeof updater === "function" ? updater(sorting) : updater),
    state: { pagination, sorting },
  });

  // Warm the visible page in the background: opening a row renders from
  // cache even without a hover first. Bounded inside the hook.
  useBackgroundTicketPrefetch(table.getRowModel().rows.map((row) => row.original));

  // A filter change can strand the page past the last page, so jump back.
  // Pagination stays put across background refetches and re-sorts.
  useEffect(() => {
    resetPage();
  }, [debouncedQuery, scope, status, priority, techScope, adminScope, role, resetPage]);

  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;

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

      {role === "technician" && (
        <div className="flex max-w-full flex-wrap gap-2" role="tablist" aria-label="Ticket scope">
          {techTabs.map((tab) => (
            <ScopeTab
              key={tab}
              active={techScope === tab}
              label={tab === SCOPE_QUEUE ? "Queue" : "My work"}
              onSelect={() => {
                setTechScope(tab);
                void navigate({
                  to: "/tickets",
                  search: (prev) =>
                    tab === SCOPE_MINE ? { ...prev, scope: "mine" } : { ...prev, scope: "queue" },
                  replace: true,
                });
              }}
            />
          ))}
        </div>
      )}

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <SegmentedFilter<StatusFilter>
          label="Status"
          value={status}
          onSelect={(next) => setStatusFilter(next)}
          options={[
            { label: "All", value: ALL_STATUSES },
            ...ticketStatuses.map((value) => ({ label: statusLabel(value), value })),
          ]}
        />
        <SegmentedFilter<PriorityFilter>
          label="Priority"
          value={priority}
          onSelect={(next) => setPriority(next)}
          options={[
            { label: "All", value: ALL_PRIORITIES },
            ...ticketPriorities.map((value) => ({ label: priorityLabel(value), value })),
          ]}
        />
      </div>
      <InputGroup>
        <InputGroupInput
          id="ticket-search"
          type="search"
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder="Search title, description, reporter…"
          aria-label="Search tickets"
        />
        <InputGroupAddon>
          <Search aria-hidden />
        </InputGroupAddon>
        {(queryInput !== debouncedQuery || queryInput !== "") && (
          <InputGroupAddon align="inline-end">
            {queryInput !== debouncedQuery ? (
              <Spinner className="size-4" aria-label="Applying search" />
            ) : (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Clear search"
                onClick={() => setQueryInput("")}
              >
                <X aria-hidden />
              </Button>
            )}
          </InputGroupAddon>
        )}
      </InputGroup>

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
        <div className="grid min-w-0 gap-3">
          {/* Mobile-first cards: no horizontal scroll below lg. */}
          <ul className="grid gap-3 lg:hidden">
            {table.getRowModel().rows.map((row) => {
              const ticket = row.original;
              return (
                <li key={ticket.id}>
                  <Card>
                    <CardPanel className="grid gap-2 p-4">
                      <TicketTitleLink ticketId={ticket.id} title={ticket.title} />
                      <p className="text-xs break-words text-muted-foreground">
                        {isStaff
                          ? `${ticket.organizationName} · ${ticket.productName} · ${ticket.reporterName}`
                          : `${ticket.productName} · ${ticket.reporterName}`}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={ticket.status} />
                        <PriorityBadge priority={ticket.priority} />
                        {ticket.escalated && <Badge variant="error">Escalated</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatTicketDate(ticket.createdAt)}
                      </p>
                    </CardPanel>
                  </Card>
                </li>
              );
            })}
          </ul>
          <div className="hidden lg:block">
            <Table variant="card">
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const sorted = header.column.getIsSorted();
                      return (
                        <TableHead
                          key={header.id}
                          aria-sort={
                            sorted === "asc"
                              ? "ascending"
                              : sorted === "desc"
                                ? "descending"
                                : "none"
                          }
                        >
                          {header.isPlaceholder ? null : (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 hover:text-foreground lg:min-h-0"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              <SortIcon direction={sorted} />
                            </button>
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {pageCount > 1 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                Page {pageIndex + 1} of {pageCount} · {filtered.length} tickets
              </p>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 lg:min-h-0"
                  disabled={!table.getCanPreviousPage()}
                  onClick={() => table.previousPage()}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 lg:min-h-0"
                  disabled={!table.getCanNextPage()}
                  onClick={() => table.nextPage()}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
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

/**
 * One exclusive filter as a segmented control: a single-select toggle group
 * on the shared coss surface. Deselecting the active segment is ignored so
 * the filter always holds a value.
 */
function SegmentedFilter<T extends string>({
  label,
  options,
  value,
  onSelect,
}: {
  readonly label: string;
  readonly options: ReadonlyArray<{ readonly label: string; readonly value: T }>;
  readonly value: T;
  readonly onSelect: (next: T) => void;
}) {
  return (
    <fieldset className="grid min-w-0 content-start gap-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <ToggleGroupPrimitive
        value={[value]}
        onValueChange={(next) => {
          const first = next[0];
          if (first !== undefined) {
            onSelect(first);
          }
        }}
        className={segmentedControlRootClassName}
      >
        {options.map((option) => (
          <TogglePrimitive
            key={option.value}
            value={option.value}
            className={segmentedControlItemVariants({ size: "sm", state: "pressed" })}
          >
            {option.label}
          </TogglePrimitive>
        ))}
      </ToggleGroupPrimitive>
    </fieldset>
  );
}

function SortIcon({ direction }: { readonly direction: "asc" | "desc" | false }) {
  if (direction === "asc") {
    return <ArrowUp aria-hidden className="size-3.5" />;
  }
  if (direction === "desc") {
    return <ArrowDown aria-hidden className="size-3.5" />;
  }
  return <ArrowUpDown aria-hidden className="size-3.5 opacity-50" />;
}
