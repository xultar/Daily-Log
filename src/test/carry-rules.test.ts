import { describe, it, expect } from "vitest";
import { carriedWeeks } from "@/lib/planner-data";

describe("carriedWeeks", () => {
  it("is zero when the item originated in this week", () => {
    expect(carriedWeeks("2026-08-24", "2026-08-24")).toBe(0);
  });

  it("is zero when there is no origin at all", () => {
    expect(carriedWeeks(undefined, "2026-08-24")).toBe(0);
  });

  it("counts one week for an item carried once", () => {
    expect(carriedWeeks("2026-08-17", "2026-08-24")).toBe(1);
  });

  it("counts elapsed weeks, not carry events, across a skipped week", () => {
    // The point of storing a date rather than a counter: a gap reports the
    // truth without anything having incremented during the gap.
    expect(carriedWeeks("2026-08-10", "2026-08-24")).toBe(2);
  });

  it("counts across a year boundary", () => {
    // Exactly 7 days apart, same as the single-carry case above: this is
    // plain calendar-day arithmetic with no ISO-year involvement, so it kills
    // no mutant that the single-carry test doesn't already kill. Kept anyway
    // because getISOWeek/getISOWeekYear are already imported into
    // planner-data.ts, where getWeekKey uses them,
    // so a future reimplementation reaching for ISO-week arithmetic is a live
    // hazard, and this is the test that would catch it.
    expect(carriedWeeks("2025-12-29", "2026-01-05")).toBe(1);
  });

  it("is zero rather than negative for an origin in the future", () => {
    expect(carriedWeeks("2026-09-07", "2026-08-24")).toBe(0);
  });

  it("is zero for an unparseable origin", () => {
    expect(carriedWeeks("not a date", "2026-08-24")).toBe(0);
  });

  it("is zero for a date-shaped value that is not a real date", () => {
    expect(carriedWeeks("2026-02-31", "2026-08-24")).toBe(0);
  });

  it("is zero when the viewed week is not a usable date", () => {
    expect(carriedWeeks("2026-08-10", "not a date")).toBe(0);
  });

  it("counts from the Monday of the week, not from Sunday", () => {
    // Only observable with a non-Monday operand: with two Mondays an exact
    // multiple of 7 days apart, every weekStartsOn value cancels out. Under
    // date-fns' Sunday default this is 0.
    expect(carriedWeeks("2026-08-23", "2026-08-24")).toBe(1);
  });
});
