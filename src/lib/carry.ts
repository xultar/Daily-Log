import { parse, isValid, differenceInCalendarWeeks } from "date-fns";
import {
  WeekData,
  isUsableIsoDate,
  loadWeek,
  saveWeek,
  hasStoredWeek,
} from "./planner-data";

/**
 * Carrying work forward, and the three ways a Bullet Journal review of an open
 * task can end: migrate it, schedule it, or strike it out.
 *
 * Split out of planner-data.ts on 2026-08-28. The dependency runs one way —
 * this module reads and writes weeks through planner-data, and nothing in
 * planner-data calls anything here. Keep it that way; a cycle would be found
 * late and painfully.
 *
 * Two functions here write a week that is **not** the one on screen, which
 * nothing else in the app does. Their own comments say why that is safe.
 */

/**
 * How many weeks an item has been slipping: the gap between the week it was
 * first written in and the week being viewed. Both arguments are ISO dates.
 * Weeks are Monday-based, so a non-Monday operand is counted from the Monday
 * of its week.
 *
 * weekStartsOn is stated rather than left to the default of Sunday. This
 * planner is Monday-based everywhere else, and an implicit Sunday boundary
 * here would be a quiet inconsistency waiting for the first caller that
 * passes a non-Monday — which is reachable: repairTodo/repairSubject accept
 * any valid ISO date from storage, so a hand-edited or imported file can
 * carry a Sunday origin.
 *
 * Anything unusable — an absent, unparseable, or future origin, or an
 * unusable viewed week — reports 0, so a damaged item renders as ordinary
 * rather than as a broken marker.
 */
export function carriedWeeks(origin: string | undefined, mondayISO: string): number {
  if (!isUsableIsoDate(origin) || !isUsableIsoDate(mondayISO)) return 0;
  const from = parse(origin, "yyyy-MM-dd", new Date());
  const to = parse(mondayISO, "yyyy-MM-dd", new Date());
  return Math.max(0, differenceInCalendarWeeks(to, from, { weekStartsOn: 1 }));
}

export interface CarryCandidate {
  text: string;
  /** ISO Monday of the week this item was first written in. */
  origin: string;
}

/**
 * The unfinished work in a week: unchecked Weekly Actions, plus unchecked
 * daily rows the user explicitly flagged as priorities.
 *
 * Unflagged daily rows are excluded on purpose. Forty-two rows a week are
 * partly a log of what happened, and carrying a log forward is noise; the flag
 * is the user saying "this one is a commitment".
 *
 * Blank rows never carry — a default week is 8 empty todos and 42 empty
 * subject rows.
 *
 * `week` must already have been through `repairWeek` — this does not guard
 * against missing arrays or non-string text.
 */
/**
 * Whether an item is the kind of unfinished work that carries: not ticked, not
 * struck out, not blank.
 *
 * Shared by collectCarryForward and markMigrated so the marker cannot stamp
 * something the bar would never have offered. The `flagged` requirement is not
 * here on purpose — it applies to daily rows and not to weekly actions, so it
 * stays with each caller.
 */
export function carriesForward(text: string, checked: boolean, struck: boolean | undefined): boolean {
  return !checked && struck !== true && text.trim() !== "";
}

export function collectCarryForward(week: WeekData, sourceMonday: string): CarryCandidate[] {
  const out: CarryCandidate[] = [];
  // Deduped here, not only at landing. The same text can arrive twice — once as
  // a weekly action, once as a flagged daily row — and applyCarryForward would
  // still land only one. But the bar counts what it is given, so without this
  // it lists the item twice and offers to "Bring 2 forward" while bringing one.
  // No data was ever at risk; the count was simply lying to the user.
  const seen = new Set<string>();
  // `struck` is the user having decided the item no longer matters, which is a
  // review outcome in its own right — the bar must stop offering it, or its
  // count reads as boxes unticked rather than decisions outstanding.
  const take = (text: string, checked: boolean, struck: boolean | undefined, origin: string | undefined) => {
    const trimmed = text.trim();
    if (!carriesForward(text, checked, struck) || seen.has(trimmed)) return;
    seen.add(trimmed);
    // An existing origin wins, so carrying twice reports two weeks rather than
    // resetting to one. This is what makes a repeated carry idempotent.
    out.push({ text: trimmed, origin: origin ?? sourceMonday });
  };
  for (const todo of week.weeklyTodos) {
    take(todo.text, todo.checked, todo.struck, todo.origin);
  }
  for (const day of week.days) {
    for (const row of day.subjects) {
      if (row.flagged === true) take(row.subject, row.checked, row.struck, row.origin);
    }
  }
  return out;
}

/**
 * Copy chosen candidates into a week's Weekly Actions, returning a new week.
 *
 * The source week is never touched: last week genuinely ended with these items
 * unfinished, and ticking one off here must leave that record true.
 *
 * A flagged daily row lands as a weekly action rather than on a day. A row that
 * failed to happen on Tuesday no longer belongs to a day, and re-pinning it to
 * one would be a guess. Its colorId does not survive — TodoItem has no colour.
 *
 * `chosen` is expected to come from an earlier week — `findCarrySource` only
 * ever scans backwards, so each candidate's `origin` is a strictly earlier
 * Monday — but this function has no way to enforce that itself.
 *
 * `target` must already have been through `repairWeek` — this does not guard
 * against a missing `weeklyTodos` array.
 */
export function applyCarryForward(target: WeekData, chosen: CarryCandidate[]): WeekData {
  const todos = target.weeklyTodos.map((t) => ({ ...t }));
  const present = new Set(todos.map((t) => t.text.trim()).filter((t) => t !== ""));
  for (const c of chosen) {
    const text = c.text.trim();
    if (text === "" || present.has(text)) continue;
    present.add(text);
    const landed = { text, checked: false, origin: c.origin };
    // Fill a blank row before appending: a fresh week starts with 8 empty rows
    // and appending past them would leave the list front-loaded with blanks.
    const blank = todos.findIndex((t) => t.text.trim() === "");
    if (blank === -1) todos.push(landed);
    else todos[blank] = landed;
  }
  return { ...target, weeklyTodos: todos };
}


/**
 * Record on the source week that chosen items were migrated out of it — the
 * Bullet Journal `>`.
 *
 * **This writes a week other than the one on screen**, which nothing else here
 * does, so two things are deliberate. It takes the source Monday rather than a
 * week object: there is no snapshot to hold, so it cannot write back a
 * minutes-old copy over edits made since the carry bar was built. And it must
 * never be routed through `setWeekData`, which writes the week being viewed —
 * that confusion is the `bringForward` bug, which once put one week's contents
 * under another week's key with the whole suite green.
 *
 * Safe as a direct write only because the source key can never be the viewed
 * week: the bar renders on current-or-future weeks and `findCarrySource` scans
 * strictly backwards. If either changes, this races the autosave debounce.
 *
 * Matching is by text, and self-verifying: only an item that *currently* reads
 * that way is stamped, so a concurrent edit cannot redirect the mark. One
 * commitment held as both a weekly action and a flagged row is stamped in both
 * places, because both moved on.
 *
 * Returns whether a write landed, so the caller can warn. A refused write must
 * not roll back the migration itself — they are separate writes.
 */
export function markMigrated(
  sourceMonday: string,
  destinationMonday: string,
  chosen: CarryCandidate[]
): boolean {
  const wanted = new Set(chosen.map((c) => c.text.trim()).filter((t) => t !== ""));
  if (wanted.size === 0) return false;
  const sourceDate = parse(sourceMonday, "yyyy-MM-dd", new Date());
  if (!isValid(sourceDate) || !hasStoredWeek(sourceDate)) return false;

  const week = loadWeek(sourceDate);
  let changed = false;
  const stampable = (text: string, checked: boolean, struck: boolean | undefined) =>
    wanted.has(text.trim()) && carriesForward(text, checked, struck);

  const marked: WeekData = {
    ...week,
    weeklyTodos: week.weeklyTodos.map((t) => {
      if (!stampable(t.text, t.checked, t.struck)) return t;
      changed = true;
      return { ...t, migratedTo: destinationMonday };
    }),
    days: week.days.map((d) => ({
      ...d,
      subjects: d.subjects.map((row) => {
        if (row.flagged !== true || !stampable(row.subject, row.checked, row.struck)) return row;
        changed = true;
        return { ...row, migratedTo: destinationMonday };
      }),
    })),
  };

  if (!changed) return false;
  return saveWeek(sourceDate, marked);
}

/**
 * Put an item into a chosen later week's Weekly Actions — the Bullet Journal
 * `<`. Creates that week if it does not exist yet.
 *
 * **This is the first thing that brings a week into existence without the user
 * visiting it.** A `planner-` entry no longer implies someone opened that week,
 * which matters to anything that reads storage to ask which weeks have been
 * used.
 *
 * The item lands with **no `origin`**, and that is not an oversight. `origin`
 * means slippage and drives the age marker, so an item deliberately placed four
 * weeks out would otherwise arrive claiming it had been carried four times. It
 * is new work in that week; if it then goes unfinished, collectCarryForward
 * stamps an origin from the week it actually failed in.
 *
 * Writes the destination and nothing else. The origin week is the one on screen,
 * so its marker is an ordinary edit through the component's own onChange —
 * deliberately not markMigrated, which matches by text and marks only *flagged*
 * daily rows because it serves a bulk carry where the rows are unknown.
 *
 * Returns whether the write landed, so the caller can mark the origin only if
 * the item really arrived.
 */
export function scheduleToWeek(destinationMonday: string, text: string): boolean {
  const wanted = text.trim();
  if (wanted === "") return false;
  const destination = parse(destinationMonday, "yyyy-MM-dd", new Date());
  if (!isValid(destination)) return false;

  // loadWeek already returns a repaired empty week when nothing is stored, so
  // there is no absent case to branch on. A hasStoredWeek guard here looked
  // reasonable and was dead code — a mutation removing it changed nothing.
  const week = loadWeek(destination);
  const todos = week.weeklyTodos.map((t) => ({ ...t }));
  if (todos.some((t) => t.text.trim() === wanted)) return true;

  // The first empty slot, or a new row when the week is full — the same shape
  // applyCarryForward lands into, so a scheduled item is indistinguishable from
  // any other weekly action once it arrives.
  const blank = todos.findIndex((t) => t.text.trim() === "");
  const landed = { text: wanted, checked: false };
  if (blank === -1) todos.push(landed);
  else todos[blank] = landed;

  return saveWeek(destination, { ...week, weeklyTodos: todos });
}

