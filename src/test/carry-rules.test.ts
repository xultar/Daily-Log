import { describe, it, expect } from "vitest";
import { carriedWeeks, collectCarryForward, applyCarryForward, createEmptyWeek, WeekData } from "@/lib/planner-data";

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

const MONDAY = new Date(2026, 7, 24);
const SOURCE_MONDAY = "2026-08-17";

function sourceWeek(): WeekData {
  const w = createEmptyWeek(new Date(2026, 7, 17));
  w.weeklyTodos[0] = { text: "Book viva slot", checked: false };
  w.weeklyTodos[1] = { text: "Return library books", checked: true };
  w.weeklyTodos[2] = { text: "   ", checked: false };
  w.days[1].subjects[0] = { subject: "Draft methods", checked: false, flagged: true, colorId: 3 };
  w.days[1].subjects[1] = { subject: "Read chapter 7", checked: false };
  w.days[2].subjects[0] = { subject: "Already done", checked: true, flagged: true };
  return w;
}

describe("collectCarryForward", () => {
  it("takes unchecked, non-empty weekly actions", () => {
    const got = collectCarryForward(sourceWeek(), SOURCE_MONDAY).map((c) => c.text);
    expect(got).toContain("Book viva slot");
    expect(got).not.toContain("Return library books"); // checked
    expect(got.some((t) => t.trim() === "")).toBe(false); // blank
  });

  it("takes flagged daily rows and leaves unflagged ones", () => {
    const got = collectCarryForward(sourceWeek(), SOURCE_MONDAY).map((c) => c.text);
    expect(got).toContain("Draft methods");
    expect(got).not.toContain("Read chapter 7"); // unflagged: a log, not a commitment
    expect(got).not.toContain("Already done"); // flagged but checked
  });

  it("stamps the source week's Monday as origin when the item has none", () => {
    const got = collectCarryForward(sourceWeek(), SOURCE_MONDAY);
    expect(got.every((c) => c.origin === SOURCE_MONDAY)).toBe(true);
  });

  it("preserves an existing origin, so carrying twice does not reset the age", () => {
    const w = sourceWeek();
    w.weeklyTodos[0] = { text: "Book viva slot", checked: false, origin: "2026-07-27" };
    const got = collectCarryForward(w, SOURCE_MONDAY);
    expect(got.find((c) => c.text === "Book viva slot")!.origin).toBe("2026-07-27");
  });

  it("returns nothing for an empty week", () => {
    expect(collectCarryForward(createEmptyWeek(MONDAY), SOURCE_MONDAY)).toEqual([]);
  });
});

describe("applyCarryForward", () => {
  it("fills blank rows before appending", () => {
    const target = createEmptyWeek(MONDAY); // 8 blank todos
    const out = applyCarryForward(target, collectCarryForward(sourceWeek(), SOURCE_MONDAY));
    expect(out.weeklyTodos).toHaveLength(8);
    expect(out.weeklyTodos[0].text).toBe("Book viva slot");
    expect(out.weeklyTodos[1].text).toBe("Draft methods");
  });

  it("appends once the blanks run out", () => {
    const target = createEmptyWeek(MONDAY);
    target.weeklyTodos = [{ text: "Existing", checked: false }];
    const out = applyCarryForward(target, collectCarryForward(sourceWeek(), SOURCE_MONDAY));
    expect(out.weeklyTodos).toHaveLength(3);
    expect(out.weeklyTodos[0].text).toBe("Existing");
  });

  it("carries the origin onto the landed item", () => {
    const out = applyCarryForward(createEmptyWeek(MONDAY), collectCarryForward(sourceWeek(), SOURCE_MONDAY));
    expect(out.weeklyTodos[0].origin).toBe(SOURCE_MONDAY);
  });

  it("lands carried items unchecked", () => {
    const out = applyCarryForward(createEmptyWeek(MONDAY), collectCarryForward(sourceWeek(), SOURCE_MONDAY));
    expect(out.weeklyTodos[0].checked).toBe(false);
  });

  it("skips a candidate whose text already exists in the target", () => {
    const target = createEmptyWeek(MONDAY);
    target.weeklyTodos[0] = { text: "  Book viva slot  ", checked: false };
    const out = applyCarryForward(target, collectCarryForward(sourceWeek(), SOURCE_MONDAY));
    expect(out.weeklyTodos.filter((t) => t.text.trim() === "Book viva slot")).toHaveLength(1);
  });

  it("does not mutate the target week", () => {
    // Carrying copies. The source week is a record of what happened and the
    // target must be replaced, not edited in place, or React sees no change.
    const target = createEmptyWeek(MONDAY);
    const before = JSON.stringify(target);
    applyCarryForward(target, collectCarryForward(sourceWeek(), SOURCE_MONDAY));
    expect(JSON.stringify(target)).toBe(before);
  });

  it("leaves the days untouched", () => {
    const out = applyCarryForward(createEmptyWeek(MONDAY), collectCarryForward(sourceWeek(), SOURCE_MONDAY));
    expect(out.days).toHaveLength(7);
    expect(out.days[0].subjects.every((s) => s.subject === "")).toBe(true);
  });
});
