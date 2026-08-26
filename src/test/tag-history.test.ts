import { describe, it, expect, beforeEach } from "vitest";
import { createEmptyWeek, WeekData } from "@/lib/planner-data";
import { tagHistory } from "@/lib/reporting";

/**
 * The third reader of raw stored weeks, so the same rule applies: weeks arrive
 * unrepaired and every field access defends itself.
 *
 * The load-bearing case here is that a row displays the day's own date but
 * navigates by the entry key. They are different questions and this is the
 * first caller that asks both at once.
 */

const AUG24 = new Date(2026, 7, 24); // Monday of 2026-W35
const AUG17 = new Date(2026, 7, 17); // Monday of 2026-W34

/** Paint `blocks` ten-minute blocks of `colorId` into a day, from midnight. */
function paint(week: WeekData, dayIndex: number, colorId: number, blocks: number) {
  const day = week.days[dayIndex];
  let left = blocks;
  let hour = 0;
  while (left > 0) {
    for (let b = 0; b < 6 && left > 0; b++, left--) day.timeBlocks[hour][b] = colorId;
    hour++;
  }
}

const store = (key: string, week: unknown) =>
  localStorage.setItem(`planner-${key}`, JSON.stringify(week));

beforeEach(() => localStorage.clear());

describe("tagHistory", () => {
  it("returns the days a tag was painted, newest first", () => {
    const older = createEmptyWeek(AUG17);
    paint(older, 0, 1, 6); // Mon 17 Aug, an hour
    store("2026-W34", older);

    const newer = createEmptyWeek(AUG24);
    paint(newer, 0, 1, 3); // Mon 24 Aug, half an hour
    store("2026-W35", newer);

    expect(tagHistory(1).map((u) => u.date)).toEqual(["2026-08-24", "2026-08-17"]);
    expect(tagHistory(1).map((u) => u.minutes)).toEqual([30, 60]);
  });

  it("ignores days painted with a different tag", () => {
    const week = createEmptyWeek(AUG24);
    paint(week, 0, 1, 6);
    paint(week, 1, 2, 6);
    store("2026-W35", week);

    expect(tagHistory(2).map((u) => u.date)).toEqual(["2026-08-25"]);
  });

  it("counts a day where the tag is only on a priority row", () => {
    // No time was blocked, but the goal was on the day. 0m would be a lie
    // about the minutes; absence would be a lie about the day.
    const week = createEmptyWeek(AUG24);
    week.days[0].subjects[0] = { subject: "Thesis chapter 3", checked: false, colorId: 1 };
    store("2026-W35", week);

    expect(tagHistory(1)).toEqual([
      { weekKey: "2026-W35", date: "2026-08-24", monday: "2026-08-24", minutes: 0, onPriorities: true },
    ]);
  });

  it("gives one row for a day that is both painted and on a priority row", () => {
    // The day is the unit. The tag was used that day, once.
    const week = createEmptyWeek(AUG24);
    paint(week, 0, 1, 6);
    week.days[0].subjects[0] = { subject: "Thesis chapter 3", checked: false, colorId: 1 };
    store("2026-W35", week);

    expect(tagHistory(1)).toHaveLength(1);
    expect(tagHistory(1)[0].minutes).toBe(60);
    expect(tagHistory(1)[0].onPriorities).toBe(true);
  });

  it("survives a priority row saved before colorId existed", () => {
    // Rows load unflagged, and a damaged one may not be an object at all.
    const week = createEmptyWeek(AUG24);
    paint(week, 0, 1, 6);
    store("2026-W35", week);
    store("2026-W34", {
      days: [{ date: "2026-08-17", subjects: [{ subject: "no colorId" }, 7, null, "x"], timeBlocks: [] }],
    });

    expect(() => tagHistory(1)).not.toThrow();
    expect(tagHistory(1).map((u) => u.date)).toEqual(["2026-08-24"]);
  });

  it("skips a day with no readable date", () => {
    // The answer here is a date. A day that cannot state one has nothing to
    // put in the column, which is the deliberate divergence from search.
    store("2026-W35", {
      days: [
        { date: "not a date", subjects: [], timeBlocks: [[1, 1, 1, 1, 1, 1]] },
        { subjects: [], timeBlocks: [[1, 1, 1, 1, 1, 1]] },
      ],
    });

    expect(tagHistory(1)).toEqual([]);
  });

  it("survives a week damaged in every way at once, beside a healthy one", () => {
    // The failure mode that broke CSV export: days missing, a day that is a
    // string, timeBlocks that is not a grid, subjects that is not an array.
    store("2026-W29", { weekGoal: 42, days: "not an array" });
    store("2026-W34", {
      days: [{ date: "2026-08-17", timeBlocks: "not a grid", subjects: 9 }, "not a day", null],
    });
    const healthy = createEmptyWeek(AUG24);
    paint(healthy, 0, 1, 6);
    store("2026-W35", healthy);

    expect(() => tagHistory(1)).not.toThrow();
    expect(tagHistory(1).map((u) => u.date)).toEqual(["2026-08-24"]);
  });

  it("navigates by the entry key even when the key and the day dates disagree", () => {
    // The load-bearing case. This week is filed under W29 but carries August
    // dates. The row must SAY 24 August, because that is the day, and must GO
    // to 13 July, because that is the only Monday that opens the week the row
    // came from. Deriving the target from the dates would send the user to a
    // week that does not contain what they clicked.
    const misfiled = createEmptyWeek(AUG24);
    paint(misfiled, 0, 1, 6);
    store("2026-W29", misfiled);

    expect(tagHistory(1)).toEqual([
      { weekKey: "2026-W29", date: "2026-08-24", monday: "2026-07-13", minutes: 60, onPriorities: false },
    ]);
  });

  it("gives two rows when two stored weeks carry the same date", () => {
    // Merging them would add minutes belonging to two different weeks and then
    // have to pick one of the two to navigate to. Ordered by week key
    // descending, so the order is stable rather than incidental.
    const a = createEmptyWeek(AUG24);
    paint(a, 0, 1, 6);
    store("2026-W35", a);

    const b = createEmptyWeek(AUG24);
    paint(b, 0, 1, 3);
    store("2026-W29", b);

    expect(tagHistory(1).map((u) => u.weekKey)).toEqual(["2026-W35", "2026-W29"]);
    expect(tagHistory(1).map((u) => u.monday)).toEqual(["2026-08-24", "2026-07-13"]);
  });

  it("answers an unknown tag with an empty list rather than throwing", () => {
    // A question with no uses, not an error.
    const week = createEmptyWeek(AUG24);
    paint(week, 0, 1, 6);
    store("2026-W35", week);

    expect(tagHistory(0)).toEqual([]);
    expect(tagHistory(-1)).toEqual([]);
    expect(tagHistory(99)).toEqual([]);
  });
});
