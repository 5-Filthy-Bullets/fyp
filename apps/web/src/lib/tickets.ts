import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "../../../api/src/router";
import { orpcQuery } from "@/query";

/** Tickets refetch on an interval: no websockets, so polling keeps queues fresh. */
export const TICKET_POLL_MS = 5_000;

/** Message threads poll a beat faster so a fresh reply appears promptly. */
export const MESSAGE_POLL_MS = 3_000;

type OrpcTicket = Awaited<ReturnType<RouterClient<AppRouter>["ticket"]["list"]>>["tickets"][number];

export type Ticket = OrpcTicket;

/** Shared /tickets search params: text query, status filter, escalated flag, tech scope tab. */
export interface TicketListSearch {
  readonly q?: string;
  readonly status?: string;
  readonly escalated?: string;
  readonly scope?: string;
}

export type TicketStatus = Ticket["status"];

export type TicketPriority = Ticket["priority"];

export type TicketMessage = Awaited<
  ReturnType<RouterClient<AppRouter>["ticket"]["listMessages"]>
>["messages"][number];

export const ticketStatuses = [
  "open",
  "in_progress",
  "resolved",
] as const satisfies readonly TicketStatus[];

export const ticketPriorities = [
  "low",
  "normal",
  "high",
  "urgent",
] as const satisfies readonly TicketPriority[];

const statusLabels: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

export const statusLabel = (status: TicketStatus): string => statusLabels[status];

const priorityLabels: Record<TicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const priorityLabel = (priority: TicketPriority): string => priorityLabels[priority];

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
  readonly escalated: number;
}

/** Counts one pass over the tickets, so every dashboard card shares the math. */
export const summarizeTickets = (tickets: readonly Ticket[]): TicketSummary => {
  let open = 0;
  let inProgress = 0;
  let resolved = 0;
  let unclaimed = 0;
  let escalated = 0;

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
    if (ticket.escalated) {
      escalated += 1;
    }
  }

  return { total: tickets.length, open, inProgress, resolved, unclaimed, escalated };
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
export const useTicketQueue = (escalatedOnly?: boolean) =>
  useQuery(
    orpcQuery.ticket.list.queryOptions({
      input: escalatedOnly === true ? { escalatedOnly: true } : {},
      refetchInterval: TICKET_POLL_MS,
    }),
  );

/**
 * Status, priority, or both in one write. Claiming still fills only an empty
 * owner slot. Invalidates the queue plus every open detail read.
 */
export const useSetTicketStatus = () => {
  const queryClient = useQueryClient();

  return useMutation(
    orpcQuery.ticket.setStatus.mutationOptions({
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: orpcQuery.ticket.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpcQuery.ticket.get.key() });
        await queryClient.invalidateQueries({ queryKey: orpcQuery.ticket.listMine.key() });
      },
    }),
  );
};

/** Hands a ticket to a chosen technician. Detail reads invalidate the same way. */
export const useAssignTicket = () => {
  const queryClient = useQueryClient();

  return useMutation(
    orpcQuery.ticket.assign.mutationOptions({
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: orpcQuery.ticket.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpcQuery.ticket.get.key() });
      },
    }),
  );
};

/** Flags a ticket for admin review with a short reason. */
export const useEscalateTicket = () => {
  const queryClient = useQueryClient();

  return useMutation(
    orpcQuery.ticket.escalate.mutationOptions({
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: orpcQuery.ticket.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpcQuery.ticket.get.key() });
      },
    }),
  );
};

/** Detail page read: ticket plus its thread, polled so replies land. */
export const useTicketDetail = (ticketId: string) =>
  useQuery(
    orpcQuery.ticket.get.queryOptions({
      input: { ticketId },
      refetchInterval: TICKET_POLL_MS,
    }),
  );

/** Message thread alone, polled faster so a fresh reply appears promptly. */
export const useTicketMessages = (ticketId: string) =>
  useQuery(
    orpcQuery.ticket.listMessages.queryOptions({
      input: { ticketId },
      refetchInterval: MESSAGE_POLL_MS,
    }),
  );

/** Posts a reply (or staff-only internal note) and refreshes the thread. */
export const usePostTicketMessage = () => {
  const queryClient = useQueryClient();

  return useMutation(
    orpcQuery.ticket.postMessage.mutationOptions({
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: orpcQuery.ticket.get.key() });
        await queryClient.invalidateQueries({
          queryKey: orpcQuery.ticket.listMessages.key(),
        });
      },
    }),
  );
};
