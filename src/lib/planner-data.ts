import { startOfWeek, addDays, format, parse, getISOWeek, getYear } from "date-fns";

export interface TodoItem {
  text: string;
  checked: boolean;
}

export interface SubjectRow {
  subject: string;
  checked: boolean;
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

const HOURS = Array.from({ length: 19 }, (_, i) => i + 6); // 6 to 24
const BLOCKS_PER_HOUR = 6; // 10-min blocks (60 min per hour)

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
      if (block) totalMinutes += 10; // any non-zero value counts as filled
    }
  }
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/** Migrate legacy boolean[][] timeBlocks to number[][] */
export function migrateTimeBlocks(blocks: (boolean | number)[][]): number[][] {
  return blocks.map((row) =>
    row.map((v) => (v === true ? 1 : v === false ? 0 : (v as number)))
  );
}

export function calcWeekTotal(week: WeekData): { hours: number; minutes: number } {
  let totalMinutes = 0;
  for (const day of week.days) {
    const { hours, minutes } = calcDayTotal(day);
    totalMinutes += hours * 60 + minutes;
  }
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

export function loadWeek(date: Date): WeekData {
  const key = getWeekKey(date);
  const stored = localStorage.getItem(`planner-${key}`);
  if (stored) {
    try {
      const data: WeekData = JSON.parse(stored);
      // Migrate legacy boolean[][] timeBlocks to number[][]
      for (const day of data.days) {
        day.timeBlocks = migrateTimeBlocks(day.timeBlocks);
      }
      return data;
    } catch {
      return createEmptyWeek(date);
    }
  }
  return createEmptyWeek(date);
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
 * To change how the palette is presented, edit PALETTE_ORDER instead.
 * Index 0 = empty.
 */
export const BLOCK_COLORS = [
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

export function getBlockColor(value: number, isDark: boolean): string | null {
  if (value === 0) return null;
  const color = BLOCK_COLORS[value - 1];
  if (!color) return null;
  return `hsl(${isDark ? color.hslDark : color.hsl})`;
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
