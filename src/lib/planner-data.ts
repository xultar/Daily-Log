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
  timeBlocks: boolean[][]; // [hour_index][minute_block_index] - 19 hours (6-24) x 5 blocks (10min each)
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
    timeBlocks: HOURS.map(() => Array(BLOCKS_PER_HOUR).fill(false)),
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
      if (block) totalMinutes += 10;
    }
  }
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
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
      return JSON.parse(stored);
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
