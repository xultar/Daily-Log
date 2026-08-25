import { startOfWeek, addDays, format, parse, isValid, getISOWeek, getISOWeekYear, differenceInCalendarWeeks } from "date-fns";
import { readItem, writeItem, removeItem, listKeys } from "./storage";

export interface TodoItem {
  text: string;
  checked: boolean;
  /**
   * ISO date of the Monday of the week this item was first written in.
   * Absent means it originated in the week it is sitting in, so its age is
   * zero. Age is derived from this and never stored: a counter could be
   * double-incremented by a re-run or inflated by an import, with no way to
   * detect it was wrong. A date can only be right or absent.
   */
  origin?: string;
}

export interface SubjectRow {
  subject: string;
  checked: boolean;
  /**
   * Storage id of this row's colour tag — the same contract as timeBlocks,
   * never a display position. Optional: rows saved before this field existed
   * load as undefined and render untagged, so no load-time migration is needed.
   * Code that rebuilds a row must spread the existing row rather than list
   * fields: strict is off and the field is optional, so the compiler will not
   * catch a dropped tag.
   */
  colorId?: number;
  /**
   * Whether this row is flagged as a priority. Optional on the same terms as
   * colorId: rows saved before the field existed load unflagged, so there is no
   * migration. repairSubject has to carry it explicitly — it rebuilds a row from
   * a fixed list of fields, and anything missing from that list is dropped on
   * load without a type error, because strict is off and the field is optional.
   */
  flagged?: boolean;
  /** As TodoItem.origin. Optional on the same terms as colorId and flagged. */
  origin?: string;
}

export interface DayData {
  date: string; // ISO date string
  subjects: SubjectRow[];
  timeBlocks: number[][]; // [hour_index][minute_block_index] - 0=empty, else BLOCK_COLORS index
  memo: string;
}

export interface WeekData {
  weekGoal: string;
  weekReview: string;
  weeklyTodos: TodoItem[];
  days: DayData[];
  /**
   * Whether the carry-forward bar has been answered for this week, either by
   * bringing items forward or by dismissing it. Stored only when true, so a
   * week written before the field existed is identical to an unresolved one.
   */
  carryResolved?: boolean;
}

export interface BlockColor {
  id: number;
  label: string;
  hsl: string;
  hslDark: string;
}

const HOURS = Array.from({ length: 19 }, (_, i) => i + 6); // 6 to 24
const BLOCKS_PER_HOUR = 6; // 10-min blocks (60 min per hour)
const MINUTES_PER_BLOCK = 60 / BLOCKS_PER_HOUR;

/**
 * The storage key for a week: its ISO week number paired with the ISO week-year
 * that number belongs to. The two must come from the same calendar or they
 * disagree — pairing the week number with the Monday's *calendar* year, as this
 * once did, filed every December week that is ISO week 1 under the current
 * year's W01, which is the key that year's own first week already used. Nine
 * weeks between 2015 and 2040 collided that way; migrateWeekKeys refiles them.
 */
export function getWeekKey(date: Date): string {
  const week = getISOWeek(date);
  return `${getISOWeekYear(date)}-W${String(week).padStart(2, "0")}`;
}

export function getWeekDates(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function createEmptyDay(date: Date): DayData {
  return {
    date: format(date, "yyyy-MM-dd"),
    subjects: Array.from({ length: 6 }, () => ({ subject: "", checked: false })),
    timeBlocks: HOURS.map(() => Array(BLOCKS_PER_HOUR).fill(0)),
    memo: "",
  };
}

export function createEmptyWeek(date: Date): WeekData {
  const dates = getWeekDates(date);
  return {
    weekGoal: "",
    weekReview: "",
    weeklyTodos: Array.from({ length: 8 }, () => ({ text: "", checked: false })),
    days: dates.map((d) => createEmptyDay(d)),
  };
}

export function calcDayTotal(day: DayData): { hours: number; minutes: number } {
  let totalMinutes = 0;
  for (const hourBlocks of day.timeBlocks) {
    for (const block of hourBlocks) {
      if (block) totalMinutes += MINUTES_PER_BLOCK; // any non-zero value counts as filled
    }
  }
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/** Minutes spent on each color in one day, keyed by storage id. */
export function calcDayColorMinutes(day: DayData): Record<number, number> {
  const minutes: Record<number, number> = {};
  for (const hourBlocks of day.timeBlocks) {
    for (const block of hourBlocks) {
      if (block) minutes[block] = (minutes[block] ?? 0) + MINUTES_PER_BLOCK;
    }
  }
  return minutes;
}

/** Minutes spent on each color across a whole week, keyed by storage id. */
export function calcWeekColorMinutes(week: WeekData): Record<number, number> {
  const minutes: Record<number, number> = {};
  for (const day of week.days) {
    for (const [id, mins] of Object.entries(calcDayColorMinutes(day))) {
      const storageId = Number(id);
      minutes[storageId] = (minutes[storageId] ?? 0) + mins;
    }
  }
  return minutes;
}

/** Render a duration as "40m", "2h" or "2h 30m". */
export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function calcWeekTotal(week: WeekData): { hours: number; minutes: number } {
  let totalMinutes = 0;
  for (const day of week.days) {
    const { hours, minutes } = calcDayTotal(day);
    totalMinutes += hours * 60 + minutes;
  }
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/**
 * Where an unreadable entry is parked. Deliberately NOT under the `planner-`
 * prefix: the exporter treats every `planner-*` key as a week, so a backup
 * stored there would be scanned as one.
 */
const UNREADABLE_PREFIX = "daily-log-unreadable-";

const DEFAULT_SUBJECT_ROWS = 6;
const WEEKLY_TODO_ROWS = 8;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const asText = (value: unknown): string => (typeof value === "string" ? value : "");

/** Shape and parseability: `2026-02-31` has the shape but is not a date. */
const isUsableIsoDate = (value: unknown): value is string =>
  typeof value === "string" &&
  ISO_DATE.test(value) &&
  isValid(parse(value, "yyyy-MM-dd", new Date()));

/**
 * An origin survives only if it is a real, parseable date; anything else
 * degrades the item to age zero rather than rendering a broken marker.
 */
const asOrigin = (value: unknown): string | undefined =>
  isUsableIsoDate(value) ? value : undefined;

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
export function collectCarryForward(week: WeekData, sourceMonday: string): CarryCandidate[] {
  const out: CarryCandidate[] = [];
  const take = (text: string, checked: boolean, origin: string | undefined) => {
    const trimmed = text.trim();
    if (checked || trimmed === "") return;
    // An existing origin wins, so carrying twice reports two weeks rather than
    // resetting to one. This is what makes a repeated carry idempotent.
    out.push({ text: trimmed, origin: origin ?? sourceMonday });
  };
  for (const todo of week.weeklyTodos) {
    take(todo.text, todo.checked, todo.origin);
  }
  for (const day of week.days) {
    for (const row of day.subjects) {
      if (row.flagged === true) take(row.subject, row.checked, row.origin);
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

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

/**
 * A stored block value is a storage id, or 0 for empty. Legacy grids hold
 * booleans. Everything else — null from a missing colorIdForDisplayPosition
 * guard, an id past the end of the palette, a stringified number out of
 * hand-edited JSON — is damage and clears to empty.
 */
function repairBlockValue(value: unknown): number {
  if (value === true) return 1;
  if (typeof value !== "number" || !Number.isInteger(value)) return 0;
  return value >= 1 && value <= BLOCK_COLORS.length ? value : 0;
}

/** Always HOURS x BLOCKS_PER_HOUR, so painting can index without a guard. */
function repairTimeBlocks(value: unknown): number[][] {
  const rows = Array.isArray(value) ? value : [];
  return HOURS.map((_, hourIdx) => {
    const row = Array.isArray(rows[hourIdx]) ? rows[hourIdx] : [];
    return Array.from({ length: BLOCKS_PER_HOUR }, (_, blockIdx) =>
      repairBlockValue(row[blockIdx])
    );
  });
}

function repairSubject(value: unknown): SubjectRow {
  const raw = asRecord(value);
  const row: SubjectRow = { subject: asText(raw.subject), checked: raw.checked === true };
  // A tag survives only if it names a real palette entry; repairBlockValue
  // applies the same storage-id contract used for timeBlocks.
  const colorId = repairBlockValue(raw.colorId);
  if (colorId !== 0) row.colorId = colorId;
  // Only a real true survives; an unflagged row stays absent rather than
  // storing false, which keeps rows written before the field existed identical
  // to rows whose flag has been cleared.
  if (raw.flagged === true) row.flagged = true;
  const origin = asOrigin(raw.origin);
  if (origin) row.origin = origin;
  return row;
}

/**
 * Rebuild only a list that is missing outright. Both views let a user delete
 * rows down to one, so padding a short-but-real list would resurrect rows they
 * removed on purpose.
 */
function repairList<T>(value: unknown, rebuiltLength: number, repairItem: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length === 0) {
    return Array.from({ length: rebuiltLength }, () => repairItem(undefined));
  }
  return value.map(repairItem);
}

function repairTodo(value: unknown): TodoItem {
  const raw = asRecord(value);
  const todo: TodoItem = { text: asText(raw.text), checked: raw.checked === true };
  // Assigned only when present, so a fresh item stays free of the field.
  const origin = asOrigin(raw.origin);
  if (origin) todo.origin = origin;
  return todo;
}

function repairDay(value: unknown, fallbackDate: Date): DayData {
  const raw = asRecord(value);
  // Both day views feed this straight to date-fns parse() and then format(),
  // which throws a RangeError on an unparseable date and unmounts the app.
  const storedDate = asText(raw.date);
  const usable = isUsableIsoDate(storedDate);
  return {
    date: usable ? storedDate : format(fallbackDate, "yyyy-MM-dd"),
    subjects: repairList(raw.subjects, DEFAULT_SUBJECT_ROWS, repairSubject),
    timeBlocks: repairTimeBlocks(raw.timeBlocks),
    memo: asText(raw.memo),
  };
}

/**
 * Coerce anything that came out of storage into a WeekData the app can render
 * and write to. A stored week is the user's only copy, so damage is repaired
 * around the surviving content rather than swapped for an empty week.
 */
export function repairWeek(value: unknown, date: Date): WeekData {
  const raw = asRecord(value);
  const storedDays = Array.isArray(raw.days) ? raw.days : [];
  // Mapping the week's real dates both pads a short week and drops any extras.
  const week: WeekData = {
    weekGoal: asText(raw.weekGoal),
    weekReview: asText(raw.weekReview),
    weeklyTodos: repairList(raw.weeklyTodos, WEEKLY_TODO_ROWS, repairTodo),
    days: getWeekDates(date).map((d, i) => repairDay(storedDays[i], d)),
  };
  if (raw.carryResolved === true) week.carryResolved = true;
  return week;
}

export function loadWeek(date: Date): WeekData {
  const key = getWeekKey(date);
  const stored = readItem(`planner-${key}`);
  if (!stored) return createEmptyWeek(date);
  try {
    return repairWeek(JSON.parse(stored), date);
  } catch {
    // Not JSON at all. Keep the raw text before returning the empty week that
    // the autosave will eventually write over this key.
    writeItem(`${UNREADABLE_PREFIX}${key}`, stored);
    return createEmptyWeek(date);
  }
}

/**
 * Whether a week has ever been written. loadWeek cannot answer this — it
 * returns an empty week for a missing key — and the carry scan needs the
 * difference: a stored-but-empty week still means the user was there, and
 * scanning past it would resurrect older items they had moved on from.
 */
export function hasStoredWeek(date: Date): boolean {
  return readItem(`planner-${getWeekKey(date)}`) !== null;
}

/** Entries that hold a week, as opposed to a setting. */
const WEEK_ENTRY = /^planner-(\d{4}-W\d{2})$/;

/**
 * The week key inside a storage entry name, or null when the entry is not a
 * week at all. Settings live under the same `planner-` prefix, so matching the
 * prefix alone sweeps them up as if they were weeks.
 */
export function weekKeyFromEntryKey(entryKey: string): string | null {
  return entryKey.match(WEEK_ENTRY)?.[1] ?? null;
}

/**
 * The key a stored week belongs under, decided by the dates it carries rather
 * than by the key it was found at. Returns null when no day carries a readable
 * date, in which case the caller has nothing better to go on and should leave
 * the existing key alone.
 */
export function weekKeyForStoredWeek(week: unknown): string | null {
  const days = asRecord(week).days;
  if (!Array.isArray(days)) return null;
  for (const day of days) {
    const stored = asText(asRecord(day).date);
    // isUsableIsoDate has already parsed this and found it valid, so the parse
    // below is only to get the Date that getWeekKey needs — not a second check.
    if (!isUsableIsoDate(stored)) continue;
    return getWeekKey(parse(stored, "yyyy-MM-dd", new Date()));
  }
  return null;
}

/**
 * Refile any week the old getWeekKey misplaced. Safe to run repeatedly: a week
 * already sitting under the key its own dates imply is left alone, so a second
 * pass moves nothing.
 *
 * Nothing is ever overwritten. If the destination is occupied the week stays
 * put and is reported as a conflict — that cannot arise from the old key
 * function, which never produced the destination key, but it can from a
 * hand-edited store.
 */
export function migrateWeekKeys(): { moved: number; conflicts: string[] } {
  const conflicts: string[] = [];
  let moved = 0;
  // Snapshot first: the loop below adds and removes entries as it goes.
  const entries = listKeys().filter((key) => WEEK_ENTRY.test(key));

  for (const entry of entries) {
    const raw = readItem(entry);
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue; // Unreadable; loadWeek deals with it, and guessing here would be worse.
    }
    const current = weekKeyFromEntryKey(entry)!;
    const belongs = weekKeyForStoredWeek(parsed);
    if (!belongs || belongs === current) continue;

    if (readItem(`planner-${belongs}`) !== null) {
      conflicts.push(current);
      continue;
    }
    // Drop the original only once the copy is safely in place.
    if (!writeItem(`planner-${belongs}`, raw)) continue;
    removeItem(entry);
    moved++;
  }
  return { moved, conflicts };
}

/**
 * Store a week. Returns whether the write landed, so a caller can warn rather
 * than let the user go on typing into a planner that stopped saving.
 */
export function saveWeek(date: Date, data: WeekData): boolean {
  const key = getWeekKey(date);
  return writeItem(`planner-${key}`, JSON.stringify(data));
}

export const HOUR_LABELS = HOURS;

/**
 * How an hour is shown beside its row. The grid's last row runs from 24:00 to
 * 25:00 — midnight to 1am — and 24 is not an hour that appears on a clock, so
 * it reads as 00. Presentation only: HOURS still runs 6..24 because those
 * values size timeBlocks and drive repairTimeBlocks.
 */
export function formatHourLabel(hour: number): string {
  return hour === 24 ? "00" : String(hour);
}
export const MINUTE_LABELS = [10, 20, 30, 40, 50, 60];

/**
 * Block color palette. A stored block value is this array's 1-based index, so
 * entries may only be APPENDED — never reordered or removed, or every saved
 * week that used a moved color is silently repainted.
 * To change how the palette is presented, edit COLOR_IDS_IN_DISPLAY_ORDER instead.
 * Index 0 = empty.
 */
export const BLOCK_COLORS: readonly BlockColor[] = [
  { id: 1, label: "Blue",     hsl: "213 60% 80%",  hslDark: "213 60% 52%" },
  { id: 2, label: "Pink",     hsl: "340 55% 82%",  hslDark: "340 55% 60%" },
  { id: 3, label: "Green",    hsl: "140 35% 75%",  hslDark: "140 40% 42%" },
  { id: 4, label: "Lavender", hsl: "270 40% 80%",  hslDark: "270 45% 64%" },
  { id: 5, label: "Orange",   hsl: "25 65% 78%",   hslDark: "25 70% 50%" },
  { id: 6, label: "Gray",     hsl: "0 0% 78%",     hslDark: "0 0% 46%" },
  { id: 7, label: "Yellow",   hsl: "50 70% 76%",   hslDark: "50 70% 58%" },
  { id: 8, label: "Teal",     hsl: "178 40% 74%",  hslDark: "178 45% 38%" },
  { id: 9, label: "Magenta",  hsl: "305 40% 80%",  hslDark: "305 45% 56%" },
];

/** Row wash opacity. Spec-fixed at 16%, tuned to stay legible across 42 weekly rows. */
const ROW_TINT_ALPHA = 0.16;

/** Resolve a storage id to its CSS variable reference. 0, undefined and out-of-range yield null. */
function blockVar(value: number | undefined): string | null {
  if (!value) return null;
  const color = BLOCK_COLORS[value - 1];
  if (!color) return null;
  return `var(--tag-${color.id})`;
}

/**
 * The block's paint colour, as a variable reference rather than a literal.
 *
 * The caller no longer says which scheme it wants, because the cascade decides:
 * :root is light, .dark is dark, and @media print restores light. That is what
 * stopped an OS-dark machine from sending dark values to the printer — this
 * function used to take an isDark argument, and printing never changed it.
 *
 * The variable is keyed by storage id, because that is what a painted block
 * holds. See tag-palette.ts for where the values come from.
 */
export function getBlockColor(value: number | undefined): string | null {
  const ref = blockVar(value);
  return ref ? `hsl(${ref})` : null;
}

/**
 * The faint background wash for a tagged row. Same storage-id contract as
 * getBlockColor: index 0 and out-of-range values yield null.
 */
export function getBlockTint(value: number | undefined): string | null {
  const ref = blockVar(value);
  return ref ? `hsl(${ref} / ${ROW_TINT_ALPHA})` : null;
}

/**
 * Presentation order for the palette, listed by storage id.
 * Storage ids are positions in BLOCK_COLORS and must never move; reorder this
 * list instead. Gray sits last here while keeping storage id 6.
 */
export const COLOR_IDS_IN_DISPLAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 7, 8, 9, 6];

/** The palette in the order it should be shown to the user. */
export function getPaletteInDisplayOrder(): BlockColor[] {
  return COLOR_IDS_IN_DISPLAY_ORDER.map((id) => BLOCK_COLORS[id - 1]);
}

/**
 * Translate a 1-based display position (what the user sees and types) into the
 * storage id written to timeBlocks. Position 0, non-integers, and anything
 * outside the palette all miss the array and yield null. Callers must check
 * for null themselves: strictNullChecks is off in this project, so nothing
 * stops a caller from assigning the result straight to a number and writing
 * that null into timeBlocks, which persists to localStorage.
 */
export function colorIdForDisplayPosition(position: number): number | null {
  return COLOR_IDS_IN_DISPLAY_ORDER[position - 1] ?? null;
}

/**
 * The number to show the user for a storage id — the inverse of
 * colorIdForDisplayPosition, and the other half of the same translation.
 *
 * Printing the storage id instead would label a block 6 that the legend calls
 * 9, for the four colours where the two differ.
 */
export function displayPositionForColorId(id: number): number | null {
  const index = COLOR_IDS_IN_DISPLAY_ORDER.indexOf(id);
  return index === -1 ? null : index + 1;
}

/**
 * Whether this block begins an unbroken run of one tag within its hour row.
 *
 * Only the first block of a run prints its number, so a full hour of one tag
 * prints one digit rather than six. Runs do not cross hour rows, because each
 * row is rendered separately — a two-hour block prints one digit per hour,
 * which reads correctly on the sheet.
 */
export function isTagRunStart(hourBlocks: number[] | undefined, blockIdx: number): boolean {
  const value = hourBlocks?.[blockIdx] ?? 0;
  if (!value) return false;
  const previous = blockIdx === 0 ? 0 : hourBlocks?.[blockIdx - 1] ?? 0;
  return value !== previous;
}

const COLOR_LABELS_KEY = "planner-color-labels";

export function loadColorLabels(): Record<number, string> {
  const stored = readItem(COLOR_LABELS_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

export function saveColorLabels(labels: Record<number, string>): boolean {
  return writeItem(COLOR_LABELS_KEY, JSON.stringify(labels));
}
