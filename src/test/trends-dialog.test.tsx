import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { startOfWeek, format } from "date-fns";
import TrendsDialog from "@/components/planner/TrendsDialog";
import { createEmptyWeek, getWeekKey, WeekData } from "@/lib/planner-data";

const NOW = new Date(2026, 7, 26); // Wed 26 Aug 2026

/** Paint `blocks` ten-minute blocks of `colorId` on a specific date. */
function paintOn(date: Date, colorId: number, blocks: number) {
  const monday = startOfWeek(date, { weekStartsOn: 1 });
  const key = getWeekKey(monday);
  const raw = localStorage.getItem(`planner-${key}`);
  const week: WeekData = raw ? JSON.parse(raw) : createEmptyWeek(monday);
  const iso = format(date, "yyyy-MM-dd");
  const day = week.days.find((d) => d.date === iso);
  if (!day) throw new Error(`no day ${iso} in week ${key}`);
  let left = blocks;
  let hour = 0;
  while (left > 0) {
    for (let b = 0; b < 6 && left > 0; b++, left--) day.timeBlocks[hour][b] = colorId;
    hour++;
  }
  localStorage.setItem(`planner-${key}`, JSON.stringify(week));
}

/**
 * Thesis peaks in July, Admin peaks in August, and Admin is ten times the size.
 * Both halves matter: same-month peaks or similar sizes would let a global
 * scale pass the scaling test.
 */
function seedTwoTags() {
  paintOn(new Date(2026, 6, 10), 1, 6); // Thesis, July, 60m  ← its peak
  paintOn(new Date(2026, 7, 10), 1, 3); // Thesis, August, 30m
  paintOn(new Date(2026, 6, 13), 2, 30); // Admin, July, 300m
  paintOn(new Date(2026, 7, 13), 2, 60); // Admin, August, 600m ← its peak
  localStorage.setItem("planner-color-labels", JSON.stringify({ 1: "Thesis", 2: "Admin" }));
}

const open = () => {
  render(<TrendsDialog />);
  fireEvent.click(screen.getByRole("button", { name: /time across months/i }));
};

/** The bar heights of a row, month columns only, null where no bar is drawn. */
const barHeights = (rowName: RegExp) =>
  within(screen.getByRole("row", { name: rowName }))
    .getAllByRole("cell")
    .slice(0, 12)
    .map((cell) => (cell.querySelector("span span") as HTMLElement | null)?.style.height ?? null);

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the trends dialog", () => {
  it("names the span it covers", () => {
    seedTwoTags();
    open();

    expect(screen.getByText(/Sep 2025/)).toBeInTheDocument();
    expect(screen.getByText(/Aug 2026/)).toBeInTheDocument();
  });

  it("gives each used tag a row, under its name", () => {
    seedTwoTags();
    open();

    expect(screen.getByRole("rowheader", { name: /Thesis/ })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /Admin/ })).toBeInTheDocument();
  });

  it("prints each row's total for the span", () => {
    seedTwoTags();
    open();

    // Thesis: 60m + 30m. Admin: 300m + 600m.
    expect(screen.getByText("1h 30m")).toBeInTheDocument();
    expect(screen.getByText("15h")).toBeInTheDocument();
  });

  it("draws a bar only where there is time", () => {
    // A zero-height bar still carries its border and rounding, so twelve of
    // them read as a row of marks that mean nothing.
    seedTwoTags();
    open();

    const heights = barHeights(/Thesis/);
    expect(heights[10]).not.toBeNull(); // July
    expect(heights[11]).not.toBeNull(); // August
    expect(heights.slice(0, 10).every((h) => h === null)).toBe(true);
  });

  it("scales each row to its own busiest month, not to the busiest tag", () => {
    // The load-bearing assertion. Thesis peaks in July at 60m and Admin peaks
    // in August at 600m; both peaks must read as full height. Under one global
    // scale Thesis's July would be 10% and its August 5%, and every other test
    // in this file would still pass.
    seedTwoTags();
    open();

    expect(barHeights(/Thesis/).slice(10)).toEqual(["100%", "50%"]);
    expect(barHeights(/Admin/).slice(10)).toEqual(["50%", "100%"]);
  });

  it("says so when nothing is blocked in the span, rather than drawing an empty table", () => {
    // TimeByTag's rule: a frame with no bars reads as something failing to load.
    open();

    expect(screen.getByText(/no time blocked in the last twelve months/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
