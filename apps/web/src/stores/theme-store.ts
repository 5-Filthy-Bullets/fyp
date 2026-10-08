import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  readStoredTheme,
  resolveTheme,
  themeSchema,
} from "@/lib/theme";
import type { ResolvedTheme, Theme } from "@/lib/theme";

interface ThemeState {
  /** User preference: explicit light/dark, or follow the OS. */
  readonly theme: Theme;
  /** Concrete light/dark value after resolving "system". */
  readonly resolved: ResolvedTheme;
  readonly setTheme: (theme: Theme) => void;
  /** Re-resolve against the OS setting (system-theme listener calls this). */
  readonly refreshResolved: () => void;
  /** Test seam: restore the shipped defaults. */
  readonly resetTheme: () => void;
}

const initialTheme = readStoredTheme();
const initialResolved = resolveTheme(initialTheme);

// Apply before the first paint-effect runs so a persisted choice never
// flashes the wrong tokens. The provider re-applies on every change too.
applyTheme(initialResolved);

/**
 * Shared theme state. Replaces the ThemeContext provider: no context means
 * no whole-tree re-render when the toggle flips, and only `theme` persists
 * so a stale `resolved` value can never shadow the OS setting.
 *
 * Server state (React Query) and route state (the router) stay where they
 * are; this store owns client UI state only.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: initialTheme,
      resolved: initialResolved,
      setTheme: (theme) => {
        try {
          localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch {
          // Private browsing can block storage; the theme still applies in memory.
        }
        const resolved = resolveTheme(theme);
        applyTheme(resolved);
        set({ theme, resolved });
      },
      refreshResolved: () => {
        const resolved = resolveTheme(useThemeStore.getState().theme);
        applyTheme(resolved);
        set({ resolved });
      },
      resetTheme: () => {
        const theme: Theme = "system";
        const resolved = resolveTheme(theme);
        applyTheme(resolved);
        set({ theme, resolved });
      },
    }),
    {
      name: THEME_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Persist the preference, never the derived value or the actions.
      partialize: (state) => ({ theme: state.theme }) as ThemeState,
      // createJSONStorage skips validation, so reject corrupt/tampered
      // payloads instead of casting them into the store.
      merge: (persisted, current) => {
        const parsed = themeSchema.safeParse((persisted as { theme?: unknown } | null)?.theme);
        if (!parsed.success) {
          return current;
        }
        const resolved = resolveTheme(parsed.data);
        applyTheme(resolved);
        return { ...current, theme: parsed.data, resolved };
      },
    },
  ),
);
