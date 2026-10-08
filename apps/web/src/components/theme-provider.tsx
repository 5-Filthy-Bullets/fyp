import { useEffect } from "react";
import type { ReactNode } from "react";
import { useThemeStore } from "@/stores/theme-store";

/**
 * Sync layer over the theme store: applies the stored choice on mount and
 * re-resolves when the OS setting changes while `theme` is "system". Renders
 * no context, so toggling the theme never re-renders the tree — only
 * components selecting `resolved`/`theme` update.
 */
export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const theme = useThemeStore((state) => state.theme);
  const refreshResolved = useThemeStore((state) => state.refreshResolved);

  useEffect(() => {
    refreshResolved();
    if (theme !== "system") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", refreshResolved);
    return () => media.removeEventListener("change", refreshResolved);
  }, [theme, refreshResolved]);

  return <>{children}</>;
}
