import { format, isValid, parse } from "date-fns";

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
