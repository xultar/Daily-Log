import { format, parse, isValid } from "date-fns";
import { loadAllWeeks, mondayOfKey } from "./planner-data";

/** Ten minutes per block, as everywhere else that counts painted time. */
const MINUTES_PER_BLOCK = 10;

export interface TagTotal {
  /** Storage id, never a display position. */
  colorId: number;
  minutes: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A stored day, with the key of the week it was found under. */
interface StoredDay {
  /** The entry key's week key. Where a navigation target comes from. */
  weekKey: string;
  /** The day's own ISO date, or "" when it does not carry a readable one. */
  date: string;
  /** The ten-minute grid, or [] when the day does not carry one. */
  grid: unknown[];
  /** The day's priority rows, or [] when absent. */
  subjects: unknown[];
}

/**
 * Every day in every stored week, with the shape-defending already done.
 *
 * **Weeks arrive unrepaired**, straight from `loadAllWeeks`, so this is where
 * the defending lives rather than in each caller: `days` may be missing, a day
 * may be a string, `timeBlocks` may not be a grid, `subjects` may be absent.
 * One damaged week costs its own days and nothing else. The last thing to read
 * stored weeks raw was `exportAsCSV`, and a single bad entry took the whole
 * export down for every user.
 *
 * It exists because `totalsByTag` and `tagHistory` are the same walk keeping
 * different bookkeeping, and a third hand-written copy of this loop is exactly
 * what `exportAllData` was rewritten onto `loadAllWeeks` to avoid.
 */
function* eachStoredDay(): Generator<StoredDay> {
  for (const [weekKey, week] of Object.entries(loadAllWeeks())) {
    const days = Array.isArray((week as { days?: unknown })?.days)
      ? (week as { days: unknown[] }).days
      : [];

    for (const day of days) {
      if (!day || typeof day !== "object") continue;
      const d = day as Record<string, unknown>;

      const raw = typeof d.date === "string" ? d.date : "";
      const dated = ISO_DATE.test(raw) && isValid(parse(raw, "yyyy-MM-dd", new Date()));

      yield {
        weekKey,
        date: dated ? raw : "",
        grid: Array.isArray(d.timeBlocks) ? d.timeBlocks : [],
        subjects: Array.isArray(d.subjects) ? d.subjects : [],
      };
    }
  }
}

/**
 * Minutes per tag between two dates, both ends included, most minutes first.
 * Tags with nothing in range are absent rather than zero.
 *
 * **Aggregated day by day, not week by week.** A week straddles a month
 * boundary and a day does not, which is the only reason an arbitrary range
 * works at all. A day is in range when its own `date` field says so — the date
 * is the fact, the week key is only where it happens to be filed.
 *
 * Weeks arrive unrepaired, and `eachStoredDay` is where that is defended
 * against — see its comment. One damaged week costs its own minutes and
 * nothing else.
 *
 * The range is a parameter rather than a month so that which span to show stays
 * the caller's decision. The month view passes the month it is displaying;
 * anything else is a different pair of arguments, not a rewrite.
 */
export function totalsByTag(from: Date, to: Date): TagTotal[] {
  const start = format(from, "yyyy-MM-dd");
  const end = format(to, "yyyy-MM-dd");
  const minutes: Record<number, number> = {};

  for (const { date, grid } of eachStoredDay()) {
    // A day with no readable date cannot be placed in a range.
    if (!date) continue;
    // ISO dates compare correctly as strings, which avoids building a Date
    // per day and avoids any timezone question about what "in range" means.
    if (date < start || date > end) continue;

    for (const hour of grid) {
      if (!Array.isArray(hour)) continue;
      for (const block of hour) {
        if (typeof block === "number" && block > 0) {
          minutes[block] = (minutes[block] ?? 0) + MINUTES_PER_BLOCK;
        }
      }
    }
  }

  return Object.entries(minutes)
    .map(([colorId, mins]) => ({ colorId: Number(colorId), minutes: mins }))
    .sort((a, b) => b.minutes - a.minutes);
}

/** One day on which a tag was used. */
export interface TagUse {
  /** The week key the day was found under. Its identity, with the date. */
  weekKey: string;
  /** The day's own date. The fact, and what the row displays. */
  date: string;
  /** ISO Monday from the entry key. Where a click goes, and nothing else. */
  monday: string;
  /** Minutes painted against this tag that day. 0 when priority-only. */
  minutes: number;
  /** A priority row that day carries this tag. */
  onPriorities: boolean;
}

/**
 * Every day a tag was used, newest first, so the first row answers "when did I
 * last work on this".
 *
 * A day counts when time was painted against the tag or when one of its
 * priority rows carries it. Both are the goal being touched; only one of them
 * is time, which is why they are reported in separate fields and never added.
 *
 * **The unit is a day within a stored week, not a calendar date.** Two stored
 * weeks can carry the same date — that is the mis-filing `mondayOfKey` exists
 * to survive — and merging them would add minutes from two different weeks and
 * then have to pick one of the two to navigate to.
 *
 * **`date` comes from the day and `monday` from the key**, which are opposite
 * rules and both correct. The date is the fact, so it is what the row shows.
 * The key is what `loadWeek` is addressed by, so it is the only Monday that
 * opens the week the row came from.
 */
export function tagHistory(colorId: number): TagUse[] {
  if (!Number.isInteger(colorId) || colorId <= 0) return [];

  const uses: TagUse[] = [];

  for (const { weekKey, date, grid, subjects } of eachStoredDay()) {
    // The answer is a date; a day that cannot state one has nothing to show.
    if (!date) continue;
    const monday = mondayOfKey(weekKey);
    if (!monday) continue;

    let minutes = 0;
    for (const hour of grid) {
      if (!Array.isArray(hour)) continue;
      // Strict equality: a block stored as "1" is damage, not this tag.
      for (const block of hour) if (block === colorId) minutes += MINUTES_PER_BLOCK;
    }

    const onPriorities = subjects.some((row) => {
      if (!row || typeof row !== "object") return false;
      // colorId is optional: rows saved before the field existed load unflagged.
      return (row as Record<string, unknown>).colorId === colorId;
    });

    if (minutes === 0 && !onPriorities) continue;
    uses.push({ weekKey, date, monday, minutes, onPriorities });
  }

  // Newest first. Rows sharing a date are ordered by key, so two weeks holding
  // the same day come back in a stable order rather than storage order.
  return uses.sort(
    (a, b) => b.date.localeCompare(a.date) || b.weekKey.localeCompare(a.weekKey)
  );
}
