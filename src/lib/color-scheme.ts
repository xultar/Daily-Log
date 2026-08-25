import { readItem, writeItem } from "./storage";

export type ColorScheme = "light" | "dark" | "system";

const KEY = "planner-color-scheme";
const VALUES: ColorScheme[] = ["light", "dark", "system"];

/**
 * The user's colour-scheme setting.
 *
 * A setting, so it shares the planner- prefix with the weeks. That overlap is
 * why a stored entry is identified by shape rather than by prefix —
 * weekKeyFromEntryKey matches planner-YYYY-Www and returns null for this key,
 * so exportAllData and migrateWeekKeys already skip it. Nothing here needs
 * adding to either. Matching the prefix instead is what once made the CSV
 * exporter treat two settings as weeks and die on week.days.
 *
 * Anything unrecognised degrades to "system" rather than throwing: reads can
 * fail outright in a sandboxed frame, and readItem already returns null there.
 */
export function readColorScheme(): ColorScheme {
  const stored = readItem(KEY);
  return VALUES.includes(stored as ColorScheme) ? (stored as ColorScheme) : "system";
}

export function writeColorScheme(scheme: ColorScheme): boolean {
  return writeItem(KEY, scheme);
}

/** Whether the app should be dark, given the setting and what the OS prefers. */
export function resolveScheme(scheme: ColorScheme, prefersDark: boolean): boolean {
  if (scheme === "system") return prefersDark;
  return scheme === "dark";
}

/** What the OS currently prefers. */
export function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Apply or remove the .dark class. tailwind.config.ts sets darkMode: ["class"],
 * so this class is the switch for every .dark rule — in index.css and in the
 * generated stylesheet alike. Nothing added it before, which is why the .dark
 * block sat dead while the tag palette flipped with the OS.
 */
export function applySchemeClass(isDark: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", isDark);
}
