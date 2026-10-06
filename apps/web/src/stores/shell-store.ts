import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface ShellState {
  /** Desktop sidebar width. Persisted: a reload keeps the user's layout. */
  readonly collapsed: boolean;
  /** Mobile drawer. Ephemeral: never survives a reload. */
  readonly mobileOpen: boolean;
  readonly toggleCollapsed: () => void;
  readonly setMobileOpen: (open: boolean) => void;
  /** Test seam: restore the shipped defaults. */
  readonly resetShell: () => void;
}

const initialShell = {
  collapsed: false,
  mobileOpen: false,
} as const;

/**
 * App-shell chrome state. Lifting `collapsed`/`mobileOpen` out of AppShell
 * lets the toggle buttons and the sidebar subscribe narrowly instead of
 * re-rendering the whole shell (and every page inside it) on each toggle.
 */
export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      ...initialShell,
      toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
      setMobileOpen: (mobileOpen) => set({ mobileOpen }),
      resetShell: () => set({ ...initialShell }),
    }),
    {
      name: "fyp-shell",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // The drawer is a per-session transient; persisting it would reopen
      // the overlay on top of a fresh page load.
      partialize: (state) => ({ collapsed: state.collapsed }) as ShellState,
    },
  ),
);
