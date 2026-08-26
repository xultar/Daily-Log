import { describe, it, expect, beforeEach } from "vitest";
import { saveWeek, createEmptyWeek } from "@/lib/planner-data";
import { findCarrySource, isCurrentOrFutureWeek } from "@/lib/carry-source";
import { subWeeks, startOfWeek } from "date-fns";

const MONDAY = new Date(2026, 7, 24); // 2026-08-24

beforeEach(() => localStorage.clear());

describe("findCarrySource", () => {
  it("returns null when nothing is stored behind this week", () => {
    expect(findCarrySource(MONDAY)).toBeNull();
  });

  it("finds the immediately preceding week", () => {
    saveWeek(subWeeks(MONDAY, 1), createEmptyWeek(subWeeks(MONDAY, 1)));
    expect(findCarrySource(MONDAY)!.monday).toBe("2026-08-17");
  });

  it("crosses a gap to the most recent stored week", () => {
    // A holiday must not strand everything behind it.
    saveWeek(subWeeks(MONDAY, 3), createEmptyWeek(subWeeks(MONDAY, 3)));
    expect(findCarrySource(MONDAY)!.monday).toBe("2026-08-03");
  });

  it("stops after four weeks rather than becoming an archaeology tool", () => {
    saveWeek(subWeeks(MONDAY, 5), createEmptyWeek(subWeeks(MONDAY, 5)));
    expect(findCarrySource(MONDAY)).toBeNull();
  });

  it("prefers the nearest stored week when several exist", () => {
    saveWeek(subWeeks(MONDAY, 3), createEmptyWeek(subWeeks(MONDAY, 3)));
    saveWeek(subWeeks(MONDAY, 1), createEmptyWeek(subWeeks(MONDAY, 1)));
    expect(findCarrySource(MONDAY)!.monday).toBe("2026-08-17");
  });

  it("stops at a stored week even when it holds nothing unfinished", () => {
    // An existing week means the user was there. If they left nothing
    // unfinished, nothing carries — scanning past it would resurrect older
    // items they had already moved on from.
    saveWeek(subWeeks(MONDAY, 1), createEmptyWeek(subWeeks(MONDAY, 1)));
    saveWeek(subWeeks(MONDAY, 2), createEmptyWeek(subWeeks(MONDAY, 2)));
    expect(findCarrySource(MONDAY)!.monday).toBe("2026-08-17");
  });

  it("returns the week's data, not just its date", () => {
    const last = subWeeks(MONDAY, 1);
    const w = createEmptyWeek(last);
    w.weeklyTodos[0] = { text: "Book viva slot", checked: false };
    saveWeek(last, w);
    expect(findCarrySource(MONDAY)!.week.weeklyTodos[0].text).toBe("Book viva slot");
  });

  it("works when called with a mid-week date rather than a Monday", () => {
    // StudyPlanner holds a Monday, but nothing in the signature enforces it.
    saveWeek(subWeeks(MONDAY, 1), createEmptyWeek(subWeeks(MONDAY, 1)));
    expect(findCarrySource(new Date(2026, 7, 27))!.monday).toBe("2026-08-17");
  });

  it("never returns the week being viewed, only earlier ones", () => {
    // The current week is almost always stored — the user is editing it — so a
    // scan starting at back=0 would offer to carry a week's own items into
    // itself.
    const w = createEmptyWeek(MONDAY);
    w.weeklyTodos[0] = { text: "This week's own work", checked: false };
    saveWeek(MONDAY, w);
    expect(findCarrySource(MONDAY)).toBeNull();
  });

  it("still reaches a week exactly four back", () => {
    saveWeek(subWeeks(MONDAY, 4), createEmptyWeek(subWeeks(MONDAY, 4)));
    expect(findCarrySource(MONDAY)!.monday).toBe("2026-07-27");
  });
});

describe("isCurrentOrFutureWeek", () => {
  it("accepts this week", () => {
    expect(isCurrentOrFutureWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))).toBe(true);
  });

  it("accepts a mid-week day of this week", () => {
    expect(isCurrentOrFutureWeek(new Date())).toBe(true);
  });

  it("rejects a past week, so reviewing March never offers to carry February", () => {
    expect(isCurrentOrFutureWeek(new Date(2020, 0, 6))).toBe(false);
  });

  it("accepts a future week", () => {
    expect(isCurrentOrFutureWeek(new Date(2099, 0, 5))).toBe(true);
  });

  it("puts the Sunday before a Monday in the previous week, not the current one", () => {
    // Sunday is the only day where Monday-based and Sunday-based week starts
    // disagree, so it is the only day that can observe weekStartsOn here.
    expect(isCurrentOrFutureWeek(new Date(2026, 7, 23), new Date(2026, 7, 25))).toBe(false);
    expect(isCurrentOrFutureWeek(new Date(2026, 7, 24), new Date(2026, 7, 25))).toBe(true);
  });

  it("treats the current week as current when today is a Sunday", () => {
    // Kills the mutant that drops weekStartsOn from the `now` side only.
    expect(isCurrentOrFutureWeek(new Date(2026, 7, 24), new Date(2026, 7, 30))).toBe(true);
  });
});
