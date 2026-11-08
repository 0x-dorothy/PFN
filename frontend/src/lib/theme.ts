import { useSyncExternalStore } from "react";

import { storageKey } from "./branding";

export type Theme = "light" | "dark" | "system";
export type Accent = "blue" | "violet" | "green" | "amber" | "rose" | "graphite";

const STORAGE_KEY = storageKey("theme");
const ACCENT_KEY = storageKey("accent");
// Kept in sync by hand with index.css's --surface-0 light/dark values —
// same pair the anti-FOUC script in public/theme-init.js uses.
const SURFACE_0 = { light: "#f9f9f7", dark: "#0d0d0d" };

/** The preset list, in picker order. Keep in sync with index.css's
 * [data-accent="..."] blocks. */
export const ACCENTS: readonly Accent[] = ["blue", "violet", "green", "amber", "rose", "graphite"];

/** Swatch colours for the picker only. The app itself never reads these — it
 * reads the CSS tokens — so a mismatch here would be cosmetic, not functional. */
export const ACCENT_SWATCH: Record<Accent, string> = {
  blue: "#2a72cc",
  violet: "#6c4bd1",
  green: "#17794a",
  amber: "#a8620a",
  rose: "#c02c6b",
  graphite: "#3f3f46",
};

function readInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

function readInitialAccent(): Accent {
  const stored = localStorage.getItem(ACCENT_KEY);
  return ACCENTS.includes(stored as Accent) ? (stored as Accent) : "blue";
}

/** Mirrors what public/theme-init.js does on first load — called again on every
 * setTheme() so switching "system" while the OS is (say) dark takes effect
 * immediately instead of waiting for the next reload. */
function applyTheme(theme: Theme): void {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }

  const isDark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark ? SURFACE_0.dark : SURFACE_0.light);
}

function applyAccent(accent: Accent): void {
  document.documentElement.setAttribute("data-accent", accent);
}

let currentTheme: Theme = readInitialTheme();
let currentAccent: Accent = readInitialAccent();
const listeners = new Set<() => void>();

// The system-preference case needs no listener of its own — index.css's
// `@media (prefers-color-scheme: dark)` re-evaluates live on its own. This
// only exists to keep the <meta name="theme-color"> in step while the user
// has "system" selected and their OS theme changes mid-session.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (currentTheme === "system") applyTheme(currentTheme);
});

applyAccent(currentAccent);

export function getTheme(): Theme {
  return currentTheme;
}

export function setTheme(theme: Theme): void {
  if (theme === currentTheme) return;
  currentTheme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
  listeners.forEach((listener) => listener());
}

export function getAccent(): Accent {
  return currentAccent;
}

export function setAccent(accent: Accent): void {
  if (accent === currentAccent) return;
  currentAccent = accent;
  localStorage.setItem(ACCENT_KEY, accent);
  applyAccent(accent);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => currentTheme);
  return { theme, setTheme };
}

export function useAccent() {
  const accent = useSyncExternalStore(subscribe, () => currentAccent);
  return { accent, setAccent };
}
