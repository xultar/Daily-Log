import { loadAllWeeks, mondayOfKey } from "./planner-data";

/** Which field a match came from, for the label a result row shows. */
export type SearchField = "goal" | "review" | "action" | "priority" | "memo";

export interface SearchMatch {
  weekKey: string;
  /** ISO Monday of the week, which is what a click sets currentDate to. */
  monday: string;
  field: SearchField;
  /** Present only for day-level matches — a memo or a priority. */
  dayIndex?: number;
  snippet: string;
}

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
export function searchWeeks(query: string): SearchMatch[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN_QUERY) return [];

  const matches: SearchMatch[] = [];

  for (const [weekKey, week] of Object.entries(loadAllWeeks())) {
    const monday = mondayOfKey(weekKey);
    if (!monday) continue;

    const take = (value: unknown, field: SearchField, dayIndex?: number) => {
      const text = asText(value);
      const at = text.toLowerCase().indexOf(needle);
      if (at === -1) return;
      matches.push({
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
