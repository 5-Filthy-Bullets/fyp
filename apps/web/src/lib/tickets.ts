import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
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

export type TechnicianPick = Awaited<
  ReturnType<RouterClient<AppRouter>["ticket"]["listTechnicians"]>
>["technicians"][number];

/** Assignee picker: every active technician, name-sorted. */
export const useTechnicians = () =>
  useQuery(orpcQuery.ticket.listTechnicians.queryOptions({ input: {} }));

/** Cache shapes mirror the router outputs, so optimistic patches stay typed. */
interface TicketListCache {
  readonly tickets: Ticket[];
}

interface TicketDetailCache {
  readonly ticket: Ticket;
  readonly messages: TicketMessage[];
}

interface MessageListCache {
  readonly messages: TicketMessage[];
}

type TicketCacheSnapshot = readonly (readonly [QueryKey, unknown])[];

/**
 * Counts writes per ticket so a stale settle never paints over a newer
 * guess. Rapid flips queue behind each other (see the per-ticket scope
 * below), so only the newest write may touch the cache on the way out.
 */
const ticketWriteEpoch = new Map<string, number>();

const nextTicketEpoch = (ticketId: string): number => {
  const epoch = (ticketWriteEpoch.get(ticketId) ?? 0) + 1;
  ticketWriteEpoch.set(ticketId, epoch);
  return epoch;
};

const isLatestTicketWrite = (ticketId: string, epoch: number): boolean =>
  ticketWriteEpoch.get(ticketId) === epoch;

/** Snapshots every ticket cache before a guess, for rollback on failure. */
const snapshotTicketCaches = (queryClient: QueryClient): TicketCacheSnapshot => [
  ...queryClient.getQueriesData({ queryKey: orpcQuery.ticket.list.key() }),
  ...queryClient.getQueriesData({ queryKey: orpcQuery.ticket.listMine.key() }),
  ...queryClient.getQueriesData({ queryKey: orpcQuery.ticket.get.key() }),
];

const restoreSnapshot = (queryClient: QueryClient, snapshot: TicketCacheSnapshot): void => {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data);
  }
};

/** Applies a field guess to one ticket in every list and detail cache. */
const patchTicketCaches = (
  queryClient: QueryClient,
  ticketId: string,
  patch: Partial<Ticket>,
): void => {
  const patchList = (old: TicketListCache | undefined): TicketListCache | undefined =>
    old === undefined
      ? old
      : {
          tickets: old.tickets.map((item) => (item.id === ticketId ? { ...item, ...patch } : item)),
        };
  queryClient.setQueriesData<TicketListCache>({ queryKey: orpcQuery.ticket.list.key() }, patchList);
  queryClient.setQueriesData<TicketListCache>(
    { queryKey: orpcQuery.ticket.listMine.key() },
    patchList,
  );
  queryClient.setQueriesData<TicketDetailCache>({ queryKey: orpcQuery.ticket.get.key() }, (old) =>
    old === undefined || old.ticket.id !== ticketId
      ? old
      : { ...old, ticket: { ...old.ticket, ...patch } },
  );
};

/** Replaces one ticket with the server truth once the write lands. */
const writeTicketCaches = (queryClient: QueryClient, ticket: Ticket): void => {
  const writeList = (old: TicketListCache | undefined): TicketListCache | undefined =>
    old === undefined
      ? old
      : { tickets: old.tickets.map((item) => (item.id === ticket.id ? ticket : item)) };
  queryClient.setQueriesData<TicketListCache>({ queryKey: orpcQuery.ticket.list.key() }, writeList);
  queryClient.setQueriesData<TicketListCache>(
    { queryKey: orpcQuery.ticket.listMine.key() },
    writeList,
  );
  queryClient.setQueriesData<TicketDetailCache>({ queryKey: orpcQuery.ticket.get.key() }, (old) =>
    old === undefined || old.ticket.id !== ticket.id ? old : { ...old, ticket },
  );
};

/** Exact cache keys for one ticket's thread, so guesses never leak sideways. */
const threadKeyFor = (ticketId: string): QueryKey =>
  orpcQuery.ticket.listMessages.queryOptions({ input: { ticketId } }).queryKey;

const detailKeyFor = (ticketId: string): QueryKey =>
  orpcQuery.ticket.get.queryOptions({ input: { ticketId } }).queryKey;

/**
 * Status, priority, or both in one write. Claiming still fills only an empty
 * owner slot. Applies the guess to every ticket cache at once, rolls it back
 * when the write fails, then converges on the server truth. Writes for one
 * ticket run serially in call order behind a per-ticket scope, so a panicked
 * re-toggle never waits and the last intent always wins.
 */
export const useSetTicketStatus = (ticketId: string) => {
  const queryClient = useQueryClient();

  return useMutation(
    orpcQuery.ticket.setStatus.mutationOptions({
      scope: { id: `ticket:${ticketId}` },
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: orpcQuery.ticket.list.key() });
        await queryClient.cancelQueries({ queryKey: orpcQuery.ticket.listMine.key() });
        await queryClient.cancelQueries({ queryKey: orpcQuery.ticket.get.key() });
        const previous = snapshotTicketCaches(queryClient);
        const epoch = nextTicketEpoch(input.ticketId);
        patchTicketCaches(queryClient, input.ticketId, {
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.priority === undefined ? {} : { priority: input.priority }),
        });
        return { previous, epoch };
      },
      onError: (_error, input, context) => {
        if (context !== undefined && isLatestTicketWrite(input.ticketId, context.epoch)) {
          restoreSnapshot(queryClient, context.previous);
        }
      },
      onSuccess: (result, input, context) => {
        if (context === undefined || isLatestTicketWrite(input.ticketId, context.epoch)) {
          writeTicketCaches(queryClient, result.ticket);
        }
      },
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: orpcQuery.ticket.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpcQuery.ticket.get.key() });
        await queryClient.invalidateQueries({ queryKey: orpcQuery.ticket.listMine.key() });
      },
    }),
  );
};

/** Hands a ticket to a chosen technician, queued in the same per-ticket lane. */
export const useAssignTicket = (ticketId: string) => {
  const queryClient = useQueryClient();

  return useMutation(
    orpcQuery.ticket.assign.mutationOptions({
      scope: { id: `ticket:${ticketId}` },
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: orpcQuery.ticket.list.key() });
        await queryClient.cancelQueries({ queryKey: orpcQuery.ticket.listMine.key() });
        await queryClient.cancelQueries({ queryKey: orpcQuery.ticket.get.key() });
        const previous = snapshotTicketCaches(queryClient);
        const epoch = nextTicketEpoch(input.ticketId);
        patchTicketCaches(queryClient, input.ticketId, { assignedTo: input.assigneeId });
        return { previous, epoch };
      },
      onError: (_error, input, context) => {
        if (context !== undefined && isLatestTicketWrite(input.ticketId, context.epoch)) {
          restoreSnapshot(queryClient, context.previous);
        }
      },
      onSuccess: (result, input, context) => {
        if (context === undefined || isLatestTicketWrite(input.ticketId, context.epoch)) {
          writeTicketCaches(queryClient, result.ticket);
        }
      },
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: orpcQuery.ticket.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpcQuery.ticket.get.key() });
      },
    }),
  );
};

/** Flags a ticket for admin review, queued in the same per-ticket lane. */
export const useEscalateTicket = (ticketId: string) => {
  const queryClient = useQueryClient();

  return useMutation(
    orpcQuery.ticket.escalate.mutationOptions({
      scope: { id: `ticket:${ticketId}` },
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: orpcQuery.ticket.list.key() });
        await queryClient.cancelQueries({ queryKey: orpcQuery.ticket.listMine.key() });
        await queryClient.cancelQueries({ queryKey: orpcQuery.ticket.get.key() });
        const previous = snapshotTicketCaches(queryClient);
        const epoch = nextTicketEpoch(input.ticketId);
        patchTicketCaches(queryClient, input.ticketId, {
          escalated: true,
          escalatedReason: input.reason,
        });
        return { previous, epoch };
      },
      onError: (_error, input, context) => {
        if (context !== undefined && isLatestTicketWrite(input.ticketId, context.epoch)) {
          restoreSnapshot(queryClient, context.previous);
        }
      },
      onSuccess: (result, input, context) => {
        if (context === undefined || isLatestTicketWrite(input.ticketId, context.epoch)) {
          writeTicketCaches(queryClient, result.ticket);
        }
      },
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

/** Posts a reply (or staff-only internal note) with the message guessed up front. */
export const usePostTicketMessage = (ticketId: string) => {
  const queryClient = useQueryClient();

  return useMutation(
    orpcQuery.ticket.postMessage.mutationOptions({
      scope: { id: `ticket:${ticketId}` },
      onMutate: async (input) => {
        const threadKey = threadKeyFor(input.ticketId);
        const detailKey = detailKeyFor(input.ticketId);
        await queryClient.cancelQueries({ queryKey: threadKey });
        await queryClient.cancelQueries({ queryKey: detailKey });
        const previousThread = queryClient.getQueryData<MessageListCache>(threadKey);
        const previousDetail = queryClient.getQueryData<TicketDetailCache>(detailKey);
        const optimistic: TicketMessage = {
          id: crypto.randomUUID(),
          authorId: null,
          content: input.content,
          visibility: input.visibility ?? "public",
          createdAt: new Date().toISOString(),
        };
        queryClient.setQueryData<MessageListCache>(threadKey, (old) =>
          old === undefined ? old : { messages: [...old.messages, optimistic] },
        );
        queryClient.setQueryData<TicketDetailCache>(detailKey, (old) =>
          old === undefined ? old : { ...old, messages: [...old.messages, optimistic] },
        );
        return {
          previousThread,
          previousDetail,
          threadKey,
          detailKey,
          optimisticId: optimistic.id,
        };
      },
      onError: (_error, _input, context) => {
        if (context === undefined) {
          return;
        }
        queryClient.setQueryData(context.threadKey, context.previousThread);
        queryClient.setQueryData(context.detailKey, context.previousDetail);
      },
      onSuccess: (result, _input, context) => {
        if (context === undefined) {
          return;
        }
        const swap = (messages: TicketMessage[]): TicketMessage[] => [
          ...messages.filter((message) => message.id !== context.optimisticId),
          result.message,
        ];
        queryClient.setQueryData<MessageListCache>(context.threadKey, (old) =>
          old === undefined ? old : { messages: swap(old.messages) },
        );
        queryClient.setQueryData<TicketDetailCache>(context.detailKey, (old) =>
          old === undefined ? old : { ...old, messages: swap(old.messages) },
        );
      },
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: orpcQuery.ticket.get.key() });
        await queryClient.invalidateQueries({
          queryKey: orpcQuery.ticket.listMessages.key(),
        });
      },
    }),
  );
};
