import { setISOWeek, startOfISOWeek, format, isValid } from "date-fns";
import { loadAllWeeks } from "./planner-data";

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

/**
 * The Monday to send a click to, derived from the entry key.
 *
 * Note that this is the opposite of `weekKeyForStoredWeek`, which decides where
 * a week *belongs* from the dates it carries, on the grounds that a key can be
 * wrong. That rule is about filing. This is about navigation, and the question
 * is different: the match was found in the entry stored at this key, and
 * `loadWeek` is key-addressed, so this is the only Monday that opens the week
 * the user just matched. Deriving it from the dates inside would, for a week
 * whose key and contents disagree, land them on a different week than the one
 * their search hit.
 *
 * It also means a week too damaged to state its own dates is still searchable,
 * which is when finding your text matters most.
 */
function mondayOfKey(weekKey: string): string | null {
  const m = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  // Jan 4th is always in ISO week 1, so it is a safe anchor to count from.
  const anchor = setISOWeek(new Date(Number(m[1]), 0, 4), Number(m[2]));
  if (!isValid(anchor)) return null;
  return format(startOfISOWeek(anchor), "yyyy-MM-dd");
}

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
