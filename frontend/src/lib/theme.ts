/**
 * Theme Management
 * Handles dark/light mode switching with localStorage persistence
 */

export type Theme = "light" | "dark";

const THEME_KEY = "app.theme";

export function getTheme(): Theme {
  // Check localStorage first
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light") {
    return stored;
  }

  // Check system preference
  if (typeof window !== "undefined" && window.matchMedia) {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  }

  return "light";
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme);

  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export function toggleTheme(): Theme {
  const current = getTheme();
  const next = current === "light" ? "dark" : "light";
  setTheme(next);
  return next;
}

export function initTheme(): void {
  const theme = getTheme();
  setTheme(theme);
}
