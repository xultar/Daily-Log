import { format, isValid, parse } from "date-fns";
import { listKeys, readItem, removeItem, writeItem } from "./storage";

/**
 * Notes on a month.
 *
 * This is the first thing this app stores that is not a week, and the two
 * decisions that follow from that are both about damage.
 *
 * **The prefix is not `planner-`.** Weeks and settings already share that
 * prefix, and the overlap is what made `exportAsCSV` collect two settings as
 * weeks and die on `week.days is not iterable` — for every user, on every run.
 * A new shape stays clear of it rather than relying on a shape match to sort it
 * out afterwards.
 *
 * **The text is stored raw, not as JSON.** `readItem` returns a string or null,
 * so `?? ""` is the entire repair path: a stored note cannot be malformed, only
 * absent. Every other reader of storage here has to assume damage because every
 * other reader parses something. This one does not parse.
 */

const PREFIX = "daily-log-month-";

// A calendar month, not merely four digits and two more: 2026-13 is not a month
// and must never become a key. Written once and used three ways so that "what a
// month key is" has one definition.
const MONTH = "\\d{4}-(?:0[1-9]|1[0-2])";
const MONTH_ENTRY = new RegExp(`^${PREFIX}(${MONTH})$`);
const MONTH_KEY = new RegExp(`^${MONTH}$`);

export function monthKeyOf(date: Date): string {
  return format(date, "yyyy-MM");
}

/** Whether a string is a month key. For validating what arrives in a backup. */
export function isMonthKey(value: string): boolean {
  return MONTH_KEY.test(value);
}

/**
 * The month key inside a storage entry name, or null when the entry is not a
 * month note. The mirror of `weekKeyFromEntryKey`, and the only place the entry
 * format is known.
 */
export function monthKeyFromEntryKey(entryKey: string): string | null {
  return entryKey.match(MONTH_ENTRY)?.[1] ?? null;
}

/** "August 2026", for a field label and a search result row. */
export function monthLabel(monthKey: string): string {
  const date = parse(monthKey, "yyyy-MM", new Date());
  return isValid(date) ? format(date, "MMMM yyyy") : monthKey;
}

/** The stored note, or "" when there is none. This is the whole repair path. */
export function loadMonthNote(monthKey: string): string {
  return readItem(PREFIX + monthKey) ?? "";
}

/**
 * Store the note, or remove it when there is nothing left of it.
 *
 * The two tests are deliberately not the same. All-whitespace is the *absence*
 * of a note, and keeping `"   "` would be a third state meaning what the other
 * two already mean. But once there is a note, its leading and trailing
 * whitespace belongs to the user — prose has blank lines in it, and a save that
 * quietly reformatted what was typed would be the worse bug.
 *
 * Returns whether the write landed, as `saveWeek` does. That return value is
 * what stops a storage failure being silent.
 */
export function saveMonthNote(monthKey: string, text: string): boolean {
  const entryKey = PREFIX + monthKey;
  return text.trim() === "" ? removeItem(entryKey) : writeItem(entryKey, text);
}

/**
 * Every stored month note, keyed by month.
 *
 * Mirrors `loadAllWeeks`, and exists for the same reason: so that export does
 * not reimplement the scan. Entries are matched by shape rather than by prefix
 * scanning, which is the rule that loop was rewritten to enforce.
 */
export function loadAllMonthNotes(): Record<string, string> {
  const notes: Record<string, string> = {};
  for (const entryKey of listKeys()) {
    const monthKey = monthKeyFromEntryKey(entryKey);
    if (!monthKey) continue;
    const text = readItem(entryKey);
    // An empty entry should not exist — saveMonthNote removes rather than
    // stores one — but a hand-edited store can hold anything, and shipping "" in
    // a backup would put back a state this module deliberately has no name for.
    if (text === null || text === "") continue;
    notes[monthKey] = text;
  }
  return notes;
}
