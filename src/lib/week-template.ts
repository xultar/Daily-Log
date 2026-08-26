import { startOfWeek, subWeeks, format } from "date-fns";
import { DayData, WeekData, hasStoredWeek, loadWeek } from "./planner-data";

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

/** What applying would do, computed without doing it. */
export interface TemplatePreview {
  /** Empty here, painted there. */
  blocksToFill: number;
  /** Painted here and there — the user's paint wins. */
  blocksKept: number;
  /** Source rows that will land. */
  rowsToFill: number;
  /** Source rows that will not: duplicate text, or no blank row left. */
  rowsDropped: number;
}

/** A filled day, and what filling it did. */
interface DayFill extends TemplatePreview {
  day: DayData;
}

/**
 * Fill one day's empty slots from another day, reporting what it did.
 *
 * **The counts come from the same pass that does the work**, so the preview
 * shown in the dialog cannot disagree with the result. Two implementations of
 * these rules would be free to drift, and a preview that lies is worse than no
 * preview at all.
 *
 * Both days must already have been through `repairWeek` — this does not guard
 * against a missing grid.
 */
function fillDay(target: DayData, source: DayData): DayFill {
  let blocksToFill = 0;
  let blocksKept = 0;

  const timeBlocks = target.timeBlocks.map((hour, h) =>
    hour.map((block, b) => {
      const from = source.timeBlocks[h]?.[b] ?? 0;
      if (from <= 0) return block;
      if (block === 0) {
        blocksToFill++;
        return from;
      }
      blocksKept++;
      return block;
    })
  );

  let rowsToFill = 0;
  let rowsDropped = 0;

  const subjects = target.subjects.map((r) => ({ ...r }));
  // Seeded from the target's own rows, then added to as rows land, so text
  // listed twice in the source arrives once.
  const present = new Set(subjects.map((r) => r.subject.trim()).filter((t) => t !== ""));

  for (const from of source.subjects) {
    const text = from.subject.trim();
    if (text === "") continue;
    if (present.has(text)) {
      rowsDropped++;
      continue;
    }
    const blank = subjects.findIndex((r) => r.subject.trim() === "");
    // Counted rather than broken out of, so the number is right for every
    // remaining row instead of only the first one that could not land.
    if (blank === -1) {
      rowsDropped++;
      continue;
    }
    present.add(text);
    rowsToFill++;
    // colorId is optional. Writing the key as undefined is exactly what
    // repairSubject exists to prevent, so the field is omitted instead.
    subjects[blank] =
      from.colorId === undefined
        ? { subject: text, checked: false }
        : { subject: text, checked: false, colorId: from.colorId };
  }

  return {
    day: { ...target, timeBlocks, subjects },
    blocksToFill,
    blocksKept,
    rowsToFill,
    rowsDropped,
  };
}

/**
 * Copy a week's shape into another week, returning a new week.
 *
 * Only empty slots are filled, so nothing the user has written can be lost —
 * which is what lets the dialog be a preview rather than a warning.
 *
 * Days map by index. The template's Monday is this week's Monday; matching on
 * the date would copy nothing, because the two weeks carry different dates by
 * definition.
 *
 * Applying twice is a no-op, and falls out of the rules rather than being
 * enforced: after the first pass there are no empty slots left to fill.
 *
 * `memo`, `weekGoal`, `weekReview`, `weeklyTodos` and `carryResolved` are the
 * target's own. Those record a particular week rather than a repeating shape.
 */
export function applyTemplate(target: WeekData, source: WeekData): WeekData {
  return {
    ...target,
    days: target.days.map((day, i) => {
      const from = source.days[i];
      return from ? fillDay(day, from).day : day;
    }),
  };
}
