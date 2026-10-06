import { z } from "zod";

export const themeSchema = z.enum(["light", "dark", "system"]);

export type Theme = z.infer<typeof themeSchema>;
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "fyp-theme";

export const readStoredTheme = (): Theme => {
  try {
    const parsed = themeSchema.safeParse(localStorage.getItem(THEME_STORAGE_KEY));
    return parsed.success ? parsed.data : "system";
  } catch {
    return "system";
  }
};

export const resolveTheme = (theme: Theme): ResolvedTheme => {
  if (theme !== "system") {
    return theme;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export const applyTheme = (resolved: ResolvedTheme) => {
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
};
