import { describe, it, expect, beforeEach } from "vitest";
import { createEmptyWeek, getWeekKey, WeekData } from "@/lib/planner-data";
import { totalsByTag } from "@/lib/reporting";

/**
 * The second reader of raw stored weeks after search, so the same rule applies:
 * weeks arrive unrepaired and every field access defends itself.
 *
 * Aggregating per day rather than per week is what lets a range be arbitrary. A
 * week straddles a month boundary; a day does not.
 */

const AUG24 = new Date(2026, 7, 24); // Monday of 2026-W35
const d = (iso: string) => new Date(`${iso}T12:00:00`);

/** A stored week whose given day indexes carry (storage id, ten-minute blocks). */
function storeWeek(monday: Date, plan: Record<number, [number, number]>) {
  const week: WeekData = createEmptyWeek(monday);
  for (const [idx, [colorId, blocks]] of Object.entries(plan)) {
    const day = week.days[Number(idx)];
    let left = blocks;
    let hour = 0;
    while (left > 0) {
      for (let b = 0; b < 6 && left > 0; b++, left--) day.timeBlocks[hour][b] = colorId;
      hour++;
    }
  }
  localStorage.setItem(`planner-${getWeekKey(monday)}`, JSON.stringify(week));
}

beforeEach(() => localStorage.clear());

describe("totalsByTag", () => {
  it("totals one day", () => {
    storeWeek(AUG24, { 0: [1, 6] }); // Monday, six blocks = an hour

    expect(totalsByTag(d("2026-08-24"), d("2026-08-30"))).toEqual([{ colorId: 1, minutes: 60 }]);
  });

  it("sums a tag across days", () => {
    storeWeek(AUG24, { 0: [1, 6], 1: [1, 3] }); // 60m + 30m

    expect(totalsByTag(d("2026-08-24"), d("2026-08-30"))).toEqual([{ colorId: 1, minutes: 90 }]);
  });

  it("includes both ends of the range", () => {
    storeWeek(AUG24, { 0: [1, 6], 6: [2, 6] }); // Monday and Sunday

    const all = totalsByTag(d("2026-08-24"), d("2026-08-30"));
    expect(all.map((t) => t.colorId).sort()).toEqual([1, 2]);

    // A single-day range still includes that day.
    expect(totalsByTag(d("2026-08-24"), d("2026-08-24"))).toEqual([{ colorId: 1, minutes: 60 }]);
  });

  it("excludes a day outside the range that sits inside an included week", () => {
    // The case that only works because this aggregates per day. Both days live
    // in 2026-W35; only Monday is in range.
    storeWeek(AUG24, { 0: [1, 6], 4: [2, 6] }); // Monday and Friday

    expect(totalsByTag(d("2026-08-24"), d("2026-08-26"))).toEqual([{ colorId: 1, minutes: 60 }]);
  });

  it("orders by minutes, most first", () => {
    storeWeek(AUG24, { 0: [3, 3], 1: [1, 12], 2: [2, 6] }); // 30m, 120m, 60m

    expect(totalsByTag(d("2026-08-24"), d("2026-08-30"))).toEqual([
      { colorId: 1, minutes: 120 },
      { colorId: 2, minutes: 60 },
      { colorId: 3, minutes: 30 },
    ]);
  });

  it("omits a tag with no minutes rather than reporting a zero", () => {
    storeWeek(AUG24, { 0: [1, 6] });

    expect(totalsByTag(d("2026-08-24"), d("2026-08-30")).map((t) => t.colorId)).toEqual([1]);
  });

  it("returns nothing for a range with nothing in it", () => {
    storeWeek(AUG24, { 0: [1, 6] });

    expect(totalsByTag(d("2026-01-01"), d("2026-01-31"))).toEqual([]);
  });

  it("survives a damaged week and still totals a healthy one", () => {
    // The failure mode that broke CSV export, and the reason search defends
    // every field: these weeks never went through repairWeek.
    localStorage.setItem("planner-2026-W34", JSON.stringify({ weekGoal: "no days at all" }));
    localStorage.setItem(
      "planner-2026-W33",
      JSON.stringify({
        days: [
          // A number, deliberately. "not a grid" would be a weaker fixture than
          // it looks: a string is iterable, so `for...of` walks its characters
          // and the missing guard survives. A number throws.
          { date: "2026-08-10", timeBlocks: 42 },
          { date: "2026-08-11", timeBlocks: "not a grid" },
          { date: "2026-08-12", timeBlocks: [7, null, "x"] },
          null,
          "nope",
        ],
      })
    );
    storeWeek(AUG24, { 0: [1, 6] });

    expect(() => totalsByTag(d("2026-08-01"), d("2026-08-31"))).not.toThrow();
    expect(totalsByTag(d("2026-08-01"), d("2026-08-31"))).toEqual([{ colorId: 1, minutes: 60 }]);
  });
});
