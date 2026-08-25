import { startOfWeek, addDays, format, parse, isValid, getISOWeek, getYear } from "date-fns";

export interface TodoItem {
  text: string;
  checked: boolean;
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

export function getWeekKey(date: Date): string {
  const week = getISOWeek(date);
  const year = getYear(startOfWeek(date, { weekStartsOn: 1 }));
  return `${year}-W${String(week).padStart(2, "0")}`;
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
  return { text: asText(raw.text), checked: raw.checked === true };
}

function repairDay(value: unknown, fallbackDate: Date): DayData {
  const raw = asRecord(value);
  // Both day views feed this straight to date-fns parse() and then format(),
  // which throws a RangeError on an unparseable date and unmounts the app.
  const storedDate = asText(raw.date);
  const usable =
    ISO_DATE.test(storedDate) && isValid(parse(storedDate, "yyyy-MM-dd", new Date()));
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
  return {
    weekGoal: asText(raw.weekGoal),
    weekReview: asText(raw.weekReview),
    weeklyTodos: repairList(raw.weeklyTodos, WEEKLY_TODO_ROWS, repairTodo),
    days: getWeekDates(date).map((d, i) => repairDay(storedDays[i], d)),
  };
}

export function loadWeek(date: Date): WeekData {
  const key = getWeekKey(date);
  const stored = localStorage.getItem(`planner-${key}`);
  if (!stored) return createEmptyWeek(date);
  try {
    return repairWeek(JSON.parse(stored), date);
  } catch {
    // Not JSON at all. Keep the raw text before returning the empty week that
    // the autosave will eventually write over this key.
    try {
      localStorage.setItem(`${UNREADABLE_PREFIX}${key}`, stored);
    } catch {
      // Storage is full or unavailable; the empty week is still better than a throw.
    }
    return createEmptyWeek(date);
  }
}

export function saveWeek(date: Date, data: WeekData): void {
  const key = getWeekKey(date);
  localStorage.setItem(`planner-${key}`, JSON.stringify(data));
}

export const HOUR_LABELS = HOURS;
export const MINUTE_LABELS = [10, 20, 30, 40, 50, 60];

/**
 * Block color palette. A stored block value is this array's 1-based index, so
 * entries may only be APPENDED — never reordered or removed, or every saved
 * week that used a moved color is silently repainted.
 * To change how the palette is presented, edit COLOR_IDS_IN_DISPLAY_ORDER instead.
 * Index 0 = empty.
 */
export const BLOCK_COLORS: readonly BlockColor[] = [
  { id: 1, label: "Blue",     hsl: "213 60% 80%",  hslDark: "213 50% 40%" },
  { id: 2, label: "Pink",     hsl: "340 55% 82%",  hslDark: "340 45% 42%" },
  { id: 3, label: "Green",    hsl: "140 35% 75%",  hslDark: "140 30% 38%" },
  { id: 4, label: "Lavender", hsl: "270 40% 80%",  hslDark: "270 35% 42%" },
  { id: 5, label: "Orange",   hsl: "25 65% 78%",   hslDark: "25 55% 40%" },
  { id: 6, label: "Gray",     hsl: "0 0% 78%",     hslDark: "0 0% 42%" },
  { id: 7, label: "Yellow",   hsl: "50 70% 76%",   hslDark: "50 55% 38%" },
  { id: 8, label: "Teal",     hsl: "178 40% 74%",  hslDark: "178 35% 36%" },
  { id: 9, label: "Magenta",  hsl: "305 40% 80%",  hslDark: "305 35% 42%" },
];

/** Row wash opacity. Spec-fixed at 16%, tuned to stay legible across 42 weekly rows. */
const ROW_TINT_ALPHA = 0.16;

/** Resolve a storage id to its bare HSL triple. 0, undefined and out-of-range yield null. */
function blockHsl(value: number | undefined, isDark: boolean): string | null {
  if (!value) return null;
  const color = BLOCK_COLORS[value - 1];
  if (!color) return null;
  return isDark ? color.hslDark : color.hsl;
}

export function getBlockColor(value: number | undefined, isDark: boolean): string | null {
  const hsl = blockHsl(value, isDark);
  return hsl ? `hsl(${hsl})` : null;
}

/**
 * The faint background wash for a tagged row. Same storage-id contract as
 * getBlockColor: index 0 and out-of-range values yield null.
 */
export function getBlockTint(value: number | undefined, isDark: boolean): string | null {
  const hsl = blockHsl(value, isDark);
  return hsl ? `hsl(${hsl} / ${ROW_TINT_ALPHA})` : null;
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

const COLOR_LABELS_KEY = "planner-color-labels";

export function loadColorLabels(): Record<number, string> {
  try {
    const stored = localStorage.getItem(COLOR_LABELS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function saveColorLabels(labels: Record<number, string>): void {
  localStorage.setItem(COLOR_LABELS_KEY, JSON.stringify(labels));
}
