import { create } from "zustand";
import type { SortingState } from "@tanstack/react-table";
import type { TicketPriority } from "@/lib/tickets";

export const TICKET_LIST_PAGE_SIZE = 10;
export const ALL_PRIORITIES = "all";

export type TicketPriorityFilter = TicketPriority | typeof ALL_PRIORITIES;

interface TicketPagination {
  readonly pageIndex: number;
  readonly pageSize: number;
}

interface TicketListState {
  /** Local-only priority filter. Not in the URL by design (see below). */
  readonly priority: TicketPriorityFilter;
  readonly sorting: SortingState;
  readonly pagination: TicketPagination;
  readonly setPriority: (priority: TicketPriorityFilter) => void;
  readonly setSorting: (sorting: SortingState) => void;
  readonly setPagination: (pagination: TicketPagination) => void;
  /** Filter changes can strand the table past the last page. */
  readonly resetPage: () => void;
  /** Test seam: restore the shipped defaults. */
  readonly resetTicketList: () => void;
}

const initialTicketList = {
  priority: ALL_PRIORITIES as TicketPriorityFilter,
  sorting: [{ desc: true, id: "createdAt" }] as SortingState,
  pagination: { pageIndex: 0, pageSize: TICKET_LIST_PAGE_SIZE } as TicketPagination,
};

/**
 * Ephemeral ticket-table UI. Deliberately NOT persisted and NOT synced to
 * the URL: `q`, `status`, and `scope` live in the router because shared
 * links must reproduce them, while priority/sort/page are per-session view
 * tweaks. Server data itself stays in TanStack Query; this store only holds
 * the knobs that were scattering useState (and full-list re-renders) across
 * the page. Consumers must select narrowly, e.g.
 * `useTicketListStore((s) => s.priority)`.
 */
export const useTicketListStore = create<TicketListState>()((set) => ({
  ...initialTicketList,
  setPriority: (priority) =>
    set((state) => ({
      priority,
      pagination: { ...state.pagination, pageIndex: 0 },
    })),
  setSorting: (sorting) => set({ sorting }),
  setPagination: (pagination) => set({ pagination }),
  resetPage: () =>
    set((state) =>
      state.pagination.pageIndex === 0
        ? state
        : { pagination: { ...state.pagination, pageIndex: 0 } },
    ),
  resetTicketList: () => set({ ...initialTicketList }),
}));
