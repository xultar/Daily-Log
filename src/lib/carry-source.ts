import { startOfWeek, subWeeks, format } from "date-fns";
import { WeekData, loadWeek, hasStoredWeek } from "./planner-data";

/** How far back the scan will look before giving up. */
const MAX_WEEKS_BACK = 4;

export interface CarrySource {
  week: WeekData;
  /** ISO date of that week's Monday, which becomes the origin stamp. */
  monday: string;
}

/**
 * The week to carry from: the most recent one that exists in storage, scanning
 * back from the previous week.
 *
 * Four weeks is enough to cross a normal break without turning a dormant
 * planner into an archaeology tool.
 *
 * Never writes planner data. The one write it can trigger is loadWeek's
 * quarantine of an already-unreadable week, which copies the raw text to
 * daily-log-unreadable-<key> before returning an empty week. No week the user
 * can still read is modified by opening one.
 */
export function findCarrySource(currentWeekDate: Date): CarrySource | null {
  const thisMonday = startOfWeek(currentWeekDate, { weekStartsOn: 1 });
  for (let back = 1; back <= MAX_WEEKS_BACK; back++) {
    const monday = subWeeks(thisMonday, back);
    if (!hasStoredWeek(monday)) continue;
    return { week: loadWeek(monday), monday: format(monday, "yyyy-MM-dd") };
  }
  return null;
}

/**
 * Whether the viewed week is one the user could still act on.
 *
 * Navigating back to review March must not prompt to carry February forward,
 * and must not offer to write to a week the user is only reading.
 *
 * `now` is a parameter rather than read from the clock internally so tests can
 * exercise both sides of the weekStartsOn boundary without faking system time.
 */
export function isCurrentOrFutureWeek(weekDate: Date, now: Date = new Date()): boolean {
  const viewed = startOfWeek(weekDate, { weekStartsOn: 1 });
  const currentWeek = startOfWeek(now, { weekStartsOn: 1 });
  return viewed.getTime() >= currentWeek.getTime();
}
