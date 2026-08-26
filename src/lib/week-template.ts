import { startOfWeek, subWeeks, format } from "date-fns";
import { WeekData, hasStoredWeek, loadWeek } from "./planner-data";

/** How far back the scan will look before giving up. */
const MAX_WEEKS_BACK = 4;

export interface TemplateSource {
  /** Repaired, via loadWeek. */
  week: WeekData;
  /** ISO Monday of that week, for the dialog's label. */
  monday: string;
}

/** Whether a week is a schedule rather than merely an entry in storage. */
function hasPaintedBlock(week: WeekData): boolean {
  return week.days.some((day) => day.timeBlocks.some((hour) => hour.some((b) => b > 0)));
}

/**
 * The week to copy a shape from: the most recent stored week with something
 * painted in it, scanning back from the previous week.
 *
 * This is `findCarrySource`'s loop asking a different question. That one stops
 * at the most recent week that *exists*, because an empty week can still be
 * carried from — there is simply nothing in it. Here an empty week is useless:
 * a template with no paint copies nothing.
 *
 * Four weeks is enough to cross a normal break without turning a dormant
 * planner into an archaeology tool.
 *
 * Never writes planner data.
 */
export function findTemplateSource(currentWeekDate: Date): TemplateSource | null {
  const thisMonday = startOfWeek(currentWeekDate, { weekStartsOn: 1 });
  for (let back = 1; back <= MAX_WEEKS_BACK; back++) {
    const monday = subWeeks(thisMonday, back);
    if (!hasStoredWeek(monday)) continue;
    const week = loadWeek(monday);
    if (!hasPaintedBlock(week)) continue;
    return { week, monday: format(monday, "yyyy-MM-dd") };
  }
  return null;
}
