import { describe, it, expect, beforeEach } from "vitest";
import { createEmptyWeek } from "@/lib/planner-data";
import { searchWeeks } from "@/lib/search";

/**
 * Search is the first feature to read every stored week without repairing it,
 * so the field access is the whole risk. The last thing to read stored weeks
 * raw was exportAsCSV, and it died on `week.days is not iterable`.
 */

const AUG = new Date(2026, 7, 26); // Wed 26 Aug 2026, week 2026-W35
const JUL = new Date(2026, 6, 15); // Wed 15 Jul 2026, week 2026-W29

const store = (key: string, week: unknown) =>
  localStorage.setItem(`planner-${key}`, JSON.stringify(week));

/** A week with something written in every searchable field. */
function fullWeek(date: Date) {
  const week = createEmptyWeek(date);
  week.weekGoal = "Finish the goal chapter";
  week.weekReview = "The review went well";
  week.weeklyTodos[0] = { text: "Book the viva", checked: false };
  week.days[2].subjects[0] = { subject: "Rewrite the methods", checked: false };
  week.days[4].memo = "Library until four";
  return week;
}

beforeEach(() => localStorage.clear());

describe("searchWeeks", () => {
  it("finds a match in each of the five fields the user types into", () => {
    store("2026-W35", fullWeek(AUG));

    expect(searchWeeks("goal chapter").map((m) => m.field)).toEqual(["goal"]);
    expect(searchWeeks("went well").map((m) => m.field)).toEqual(["review"]);
    expect(searchWeeks("viva").map((m) => m.field)).toEqual(["action"]);
    expect(searchWeeks("methods").map((m) => m.field)).toEqual(["priority"]);
    expect(searchWeeks("Library").map((m) => m.field)).toEqual(["memo"]);
  });

  it("ignores case in both directions", () => {
    store("2026-W35", fullWeek(AUG));

    expect(searchWeeks("LIBRARY")).toHaveLength(1);
    expect(searchWeeks("library")).toHaveLength(1);
  });

  it("says nothing until the query is two characters", () => {
    // One letter matches most weeks and answers nothing.
    store("2026-W35", fullWeek(AUG));

    expect(searchWeeks("L")).toEqual([]);
    expect(searchWeeks("Li")).toHaveLength(1);
  });

  it("puts the newest week first", () => {
    store("2026-W29", fullWeek(JUL));
    store("2026-W35", fullWeek(AUG));

    expect(searchWeeks("viva").map((m) => m.weekKey)).toEqual(["2026-W35", "2026-W29"]);
  });

  it("carries the day for a day-level match, and none for a week-level one", () => {
    // The click lands on the week, where a memo is truncated to a line, so the
    // result has to say which day to look at.
    store("2026-W35", fullWeek(AUG));

    expect(searchWeeks("Library")[0].dayIndex).toBe(4);
    expect(searchWeeks("methods")[0].dayIndex).toBe(2);
    expect(searchWeeks("goal chapter")[0].dayIndex).toBeUndefined();
  });

  it("reports the Monday the week belongs to, so a result can be jumped to", () => {
    store("2026-W35", fullWeek(AUG));

    expect(searchWeeks("viva")[0].monday).toBe("2026-08-24");
  });

  it("returns a snippet containing the match", () => {
    store("2026-W35", fullWeek(AUG));

    expect(searchWeeks("until")[0].snippet).toContain("until");
  });

  it("survives a week that is damaged in every way at once", () => {
    // The failure mode that broke CSV export, and then some: days missing,
    // weeklyTodos a string, a subject that is a number, a memo that is null.
    store("2026-W29", {
      weekGoal: 42,
      weeklyTodos: "not an array",
    });
    store("2026-W34", {
      weekGoal: "findme in a week with broken days",
      days: [{ subjects: [7, null], memo: null }, "not a day", null],
    });
    store("2026-W35", fullWeek(AUG));

    expect(() => searchWeeks("findme")).not.toThrow();
    expect(searchWeeks("findme")).toHaveLength(1);
    // The healthy week beside them still works.
    expect(searchWeeks("viva")).toHaveLength(1);
  });

  it("does not search colour labels", () => {
    // They are settings, they live outside any week, and a result would have
    // nowhere to jump to.
    store("2026-W35", createEmptyWeek(AUG));
    localStorage.setItem("planner-color-labels", JSON.stringify({ 1: "Thesis" }));

    expect(searchWeeks("Thesis")).toEqual([]);
  });

  it("finds every occurrence, rather than the first per week", () => {
    const week = createEmptyWeek(AUG);
    week.weekGoal = "repeat";
    week.days[0].memo = "repeat";
    week.days[1].memo = "repeat";
    store("2026-W35", week);

    expect(searchWeeks("repeat")).toHaveLength(3);
  });
});
