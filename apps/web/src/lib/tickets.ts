import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "../../../api/src/router";
import { orpcQuery } from "@/query";

/** Tickets refetch on an interval: no websockets, so polling keeps queues fresh. */
const TICKET_POLL_MS = 5_000;

type OrpcTicket = Awaited<ReturnType<RouterClient<AppRouter>["ticket"]["list"]>>["tickets"][number];

export type Ticket = OrpcTicket;

export type TicketStatus = Ticket["status"];

export const ticketStatuses = [
  "open",
  "in_progress",
  "resolved",
] as const satisfies readonly TicketStatus[];

const statusLabels: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

export const statusLabel = (status: TicketStatus): string => statusLabels[status];

/** Shows "Oct 4, 2026, 3:12 PM" from the ISO timestamp the API returns. */
export const formatTicketDate = (iso: string): string =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

interface TicketSummary {
  readonly total: number;
  readonly open: number;
  readonly inProgress: number;
  readonly resolved: number;
  readonly unclaimed: number;
}

/** Counts one pass over the tickets, so every dashboard card shares the math. */
export const summarizeTickets = (tickets: readonly Ticket[]): TicketSummary => {
  let open = 0;
  let inProgress = 0;
  let resolved = 0;
  let unclaimed = 0;

  for (const ticket of tickets) {
    if (ticket.status === "open") {
      open += 1;
    } else if (ticket.status === "in_progress") {
      inProgress += 1;
    } else {
      resolved += 1;
    }
    if (ticket.assignedTo === null) {
      unclaimed += 1;
    }
  }

  return { total: tickets.length, open, inProgress, resolved, unclaimed };
};

/** Client inbox: only the caller's org, scoped server-side from the session. */
export const useMyTickets = () =>
  useQuery(
    orpcQuery.ticket.listMine.queryOptions({
      input: {},
      refetchInterval: TICKET_POLL_MS,
    }),
  );

/** Staff queue across every client org, newest first. */
export const useTicketQueue = () =>
  useQuery(
    orpcQuery.ticket.list.queryOptions({
      input: {},
      refetchInterval: TICKET_POLL_MS,
    }),
  );

/** Claim a ticket or move its status. Claiming fills only an empty owner slot. */
export const useSetTicketStatus = () => {
  const queryClient = useQueryClient();

  return useMutation(
    orpcQuery.ticket.setStatus.mutationOptions({
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: orpcQuery.ticket.list.key() });
      },
    }),
  );
};
