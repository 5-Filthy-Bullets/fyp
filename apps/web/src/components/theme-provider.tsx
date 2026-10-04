import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  THEME_STORAGE_KEY,
  ThemeContext,
  applyTheme,
  readStoredTheme,
  resolveTheme,
} from "@/lib/theme";
import type { ResolvedTheme, Theme } from "@/lib/theme";

/**
 * Light/dark/system theming on top of the vendored `.dark` tokens. Persists
 * in localStorage and flips the `dark` class, so the toggle applies instantly.
 */
export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readStoredTheme()));

  useEffect(() => {
    const update = () => {
      const next = resolveTheme(theme);
      applyTheme(next);
      setResolved(next);
    };
    update();
    if (theme !== "system") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);

  const setTheme = (next: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing can block storage; the theme still applies in memory.
    }
    setThemeState(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>
  );
}
