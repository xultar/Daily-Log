import { loadAllWeeks, mondayOfKey } from "./planner-data";
import { loadAllMonthNotes } from "./month-notes";

/** Which field a week match came from, for the label a result row shows. */
export type WeekField = "goal" | "review" | "action" | "priority" | "memo";

export type SearchField = WeekField | "month";

export interface WeekMatch {
  kind: "week";
  weekKey: string;
  /** ISO Monday of the week, which is what a click sets currentDate to. */
  monday: string;
  field: WeekField;
  /** Present only for day-level matches — a memo or a priority. */
  dayIndex?: number;
  snippet: string;
}

export interface MonthMatch {
  kind: "month";
  /** "yyyy-MM". A month note has no week and no Monday, and never will. */
  monthKey: string;
  field: "month";
  snippet: string;
}

/**
 * A discriminated union rather than one shape with optional fields.
 *
 * `tsconfig.app.json` sets `"strict": false`, so `strictNullChecks` is off and
 * an optional `monday?: string` would be no protection whatever — the compiler
 * would hand a `null` straight to `parse(monday, ...)` in the dialog. Narrowing
 * on a literal `kind` still works with `strict` off, which makes it the one
 * mechanism here that actually holds.
 */
export type SearchMatch = WeekMatch | MonthMatch;

/**
 * Below this a query matches most weeks and answers nothing.
 */
const MIN_QUERY = 2;

/** How much of the surrounding text a snippet carries either side of the match. */
const SNIPPET_PAD = 32;

const asText = (value: unknown): string => (typeof value === "string" ? value : "");

function snippetAround(text: string, at: number, length: number): string {
  const start = Math.max(0, at - SNIPPET_PAD);
  const end = Math.min(text.length, at + length + SNIPPET_PAD);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

/**
 * Every place the query appears in anything the user has written, newest week
 * first.
 *
 * **Weeks arrive unrepaired**, straight from storage, because reading five
 * strings does not justify running every stored week through `repairWeek`. So
 * every field access here defends itself: `days` may be missing, `weeklyTodos`
 * may be a string, a subject may be a number, a memo may be null. One damaged
 * week must cost its own matches and nothing else — the last thing to read
 * stored weeks raw was `exportAsCSV`, and a single bad entry took the whole
 * export down for every user.
 */
export function searchWeeks(query: string): WeekMatch[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN_QUERY) return [];

  const matches: WeekMatch[] = [];

  for (const [weekKey, week] of Object.entries(loadAllWeeks())) {
    const monday = mondayOfKey(weekKey);
    if (!monday) continue;

    const take = (value: unknown, field: WeekField, dayIndex?: number) => {
      const text = asText(value);
      const at = text.toLowerCase().indexOf(needle);
      if (at === -1) return;
      matches.push({
        kind: "week",
        weekKey,
        monday,
        field,
        ...(dayIndex === undefined ? {} : { dayIndex }),
        snippet: snippetAround(text, at, needle.length),
      });
    };

    const w = week as Record<string, unknown>;
    take(w.weekGoal, "goal");
    take(w.weekReview, "review");

    const todos = Array.isArray(w.weeklyTodos) ? w.weeklyTodos : [];
    for (const todo of todos) take((todo as { text?: unknown })?.text, "action");

    const days = Array.isArray(w.days) ? w.days : [];
    days.forEach((day, dayIndex) => {
      if (!day || typeof day !== "object") return;
      const d = day as Record<string, unknown>;
      const subjects = Array.isArray(d.subjects) ? d.subjects : [];
      for (const row of subjects) {
        take((row as { subject?: unknown })?.subject, "priority", dayIndex);
      }
      take(d.memo, "memo", dayIndex);
    });
  }

  // Newest first: what you are looking for is usually recent.
  return matches.sort((a, b) => b.monday.localeCompare(a.monday));
}

/**
 * Every place the query appears in a month's notes.
 *
 * Unlike the weeks, these arrive as strings by construction — `loadAllMonthNotes`
 * reads them through `readItem`, which returns a string or nothing — so there is
 * no unrepaired-shape problem here and no field access to defend.
 */
export function searchMonthNotes(query: string): MonthMatch[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN_QUERY) return [];

  const matches: MonthMatch[] = [];
  for (const [monthKey, text] of Object.entries(loadAllMonthNotes())) {
    const at = text.toLowerCase().indexOf(needle);
    if (at === -1) continue;
    matches.push({
      kind: "month",
      monthKey,
      field: "month",
      snippet: snippetAround(text, at, needle.length),
    });
  }
  return matches;
}

/**
 * The date a match sorts on, so that both kinds interleave by date rather than
 * a month note being appended to one end of the list.
 *
 * A month note takes the first of its month. **That `-01` is legibility, not
 * behaviour**, and no test can defend it: `"2026-08"` is a prefix of every
 * August date, and a prefix sorts first, so a bare month key orders identically
 * against every `yyyy-MM-dd` string there is. It is written this way so every
 * sort key has the same shape, and so the line stays correct if the comparison
 * ever stops being a string compare. Do not add a test claiming to pin it.
 */
const sortKey = (match: SearchMatch): string =>
  match.kind === "week" ? match.monday : `${match.monthKey}-01`;

/**
 * Everything the query matches, newest first. This is what the dialog calls.
 *
 * `searchWeeks` keeps its own sort because it stays independently exported and
 * tested, and re-sorting an already-sorted list costs nothing.
 */
export function searchAll(query: string): SearchMatch[] {
  return [...searchWeeks(query), ...searchMonthNotes(query)].sort((a, b) =>
    sortKey(b).localeCompare(sortKey(a))
  );
}
