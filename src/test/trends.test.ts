import { describe, it, expect, beforeEach } from "vitest";
import { startOfWeek, format } from "date-fns";
import { createEmptyWeek, getWeekKey, WeekData } from "@/lib/planner-data";
import { trendsByMonth } from "@/lib/reporting";

/**
 * The third reader of raw stored weeks, so the same rule applies: weeks arrive
 * unrepaired and every field access defends itself.
 *
 * One pass buckets by month rather than twelve totalsByTag calls, each of which
 * would walk every stored week.
 */

const AUG26 = new Date(2026, 7, 26); // Wed 26 Aug 2026

/**
 * Paint `blocks` ten-minute blocks of `colorId` on a specific date, creating or
 * extending whatever week contains it. Written by date rather than by day index
 * because a week straddles a month boundary and this is about months.
 */
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

beforeEach(() => localStorage.clear());

describe("trendsByMonth", () => {
  it("returns the months oldest first, ending on the one given", () => {
    const { months } = trendsByMonth(AUG26, 12);

    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-09");
    expect(months[11]).toBe("2026-08");
  });

  it("puts a day's minutes in that day's month", () => {
    paintOn(new Date(2026, 7, 10), 1, 6); // 10 Aug 2026, an hour

    const { tags } = trendsByMonth(AUG26, 12);

    expect(tags[0].colorId).toBe(1);
    expect(tags[0].months[11]).toBe(60); // August is the last column
  });

  it("reports a month with no time as zero rather than leaving a gap", () => {
    // Every row must be as long as `months` or the renderer has to handle
    // holes, and a hole is indistinguishable from a month nobody worked.
    paintOn(new Date(2026, 7, 10), 1, 6);

    const { tags } = trendsByMonth(AUG26, 12);

    expect(tags[0].months).toHaveLength(12);
    expect(tags[0].months.filter((m) => m > 0)).toEqual([60]);
  });

  it("excludes a day outside the span", () => {
    // Thirteen months back, one month past the window's edge.
    paintOn(new Date(2025, 7, 10), 1, 6);

    expect(trendsByMonth(AUG26, 12).tags).toEqual([]);
  });

  it("gives no row to a tag with no time in the span", () => {
    paintOn(new Date(2026, 6, 10), 1, 6);

    expect(trendsByMonth(AUG26, 12).tags.map((t) => t.colorId)).toEqual([1]);
  });

  it("sorts rows by total, busiest first", () => {
    paintOn(new Date(2026, 6, 10), 1, 3); // 30m
    paintOn(new Date(2026, 6, 11), 2, 12); // 120m

    expect(trendsByMonth(AUG26, 12).tags.map((t) => t.colorId)).toEqual([2, 1]);
  });

  it("totals a row across its months", () => {
    paintOn(new Date(2026, 6, 10), 1, 6); // July, 60m
    paintOn(new Date(2026, 7, 10), 1, 3); // August, 30m

    const row = trendsByMonth(AUG26, 12).tags[0];

    expect(row.months[10]).toBe(60);
    expect(row.months[11]).toBe(30);
    expect(row.total).toBe(90);
  });

  it("survives a week damaged in every way at once, beside a healthy one", () => {
    // days missing, a day that is a string, timeBlocks that is not a grid.
    localStorage.setItem("planner-2026-W29", JSON.stringify({ weekGoal: 42, days: "not an array" }));
    localStorage.setItem(
      "planner-2026-W30",
      JSON.stringify({ days: [{ date: "2026-07-20", timeBlocks: "not a grid" }, "not a day", null] })
    );
    paintOn(new Date(2026, 7, 10), 1, 6);

    expect(() => trendsByMonth(AUG26, 12)).not.toThrow();
    expect(trendsByMonth(AUG26, 12).tags[0].total).toBe(60);
  });
});
