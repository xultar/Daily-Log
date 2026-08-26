import { describe, it, expect, beforeEach } from "vitest";
import { loadWeek, getWeekKey, getWeekDates, createEmptyWeek, BLOCK_COLORS } from "@/lib/planner-data";
import { format } from "date-fns";

/**
 * A stored week is the only copy of the user's data, so a damaged one must be
 * repaired rather than discarded. Before this suite, any shape problem sent
 * loadWeek down its catch-all and returned an empty week, and the autosave then
 * wrote that empty week back over the original.
 */

const DATE = new Date(2026, 7, 26); // Wed 26 Aug 2026
const KEY = `planner-${getWeekKey(DATE)}`;

/**
 * A well-formed week carrying real user content, for tests to then damage.
 * The return type is deliberately loose: every caller goes on to write a shape
 * that WeekData forbids, which is the whole point of the fixture.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function storedWeek(): any {
  const week: any = createEmptyWeek(DATE);
  week.weekGoal = "Ship the thesis chapter";
  week.days[0].subjects[0] = { subject: "Chapter 3 rewrite", checked: true, colorId: 4 };
  week.days[0].timeBlocks[0] = [1, 1, 2, 0, 0, 0];
  week.days[0].memo = "library until 4";
  return week;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function store(week: unknown) {
  localStorage.setItem(KEY, JSON.stringify(week));
}

beforeEach(() => localStorage.clear());

describe("loadWeek repairs damage instead of discarding the week", () => {
  it("keeps the surrounding week when one day has lost its timeBlocks", () => {
    const week = storedWeek();
    delete week.days[2].timeBlocks;
    store(week);

    const loaded = loadWeek(DATE);

    expect(loaded.weekGoal).toBe("Ship the thesis chapter");
    expect(loaded.days[0].subjects[0].subject).toBe("Chapter 3 rewrite");
    expect(loaded.days[0].timeBlocks[0]).toEqual([1, 1, 2, 0, 0, 0]);
  });

  it("rebuilds a day that lost its timeBlocks as an empty grid", () => {
    const week = storedWeek();
    delete week.days[2].timeBlocks;
    store(week);

    const { timeBlocks } = loadWeek(DATE).days[2];

    expect(timeBlocks).toHaveLength(19);
    expect(timeBlocks.every((row) => row.length === 6)).toBe(true);
    expect(timeBlocks.flat().every((v) => v === 0)).toBe(true);
  });

  it("pads a short week back to seven days with the right dates", () => {
    const week = storedWeek();
    week.days = week.days.slice(0, 5);
    store(week);

    const loaded = loadWeek(DATE);

    expect(loaded.days).toHaveLength(7);
    expect(loaded.days.map((d) => d.date)).toEqual(
      getWeekDates(DATE).map((d) => format(d, "yyyy-MM-dd"))
    );
  });

  it("drops days beyond the seventh", () => {
    const week = storedWeek();
    week.days.push(week.days[0], week.days[1]);
    store(week);

    expect(loadWeek(DATE).days).toHaveLength(7);
  });

  it("pads a short hour grid without moving the blocks already painted", () => {
    const week = storedWeek();
    week.days[0].timeBlocks = [[1, 1, 2, 0, 0, 0], [0, 0, 0, 3, 0, 0]];
    store(week);

    const { timeBlocks } = loadWeek(DATE).days[0];

    expect(timeBlocks).toHaveLength(19);
    expect(timeBlocks[0]).toEqual([1, 1, 2, 0, 0, 0]);
    expect(timeBlocks[1]).toEqual([0, 0, 0, 3, 0, 0]);
    expect(timeBlocks[18]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("pads a short hour row to six blocks", () => {
    const week = storedWeek();
    week.days[0].timeBlocks[0] = [1, 1];
    store(week);

    expect(loadWeek(DATE).days[0].timeBlocks[0]).toEqual([1, 1, 0, 0, 0, 0]);
  });

  it("clears block values that are not a real colour", () => {
    const week = storedWeek();
    // null is the documented failure mode of a missing colorIdForDisplayPosition
    // guard; "3" and NaN come from hand-edited or third-party-written JSON.
    //
    // The out-of-range value is computed, not literal. This line used to say
    // 10, which stopped being damage the moment the palette grew past nine —
    // widening a palette changes what counts as corruption, and the test then
    // failed for a reason that had nothing to do with repair. One past the end
    // is the boundary worth testing anyway.
    week.days[0].timeBlocks[0] = [null, BLOCK_COLORS.length + 1, -1, "3", NaN, 2];
    store(week);

    expect(loadWeek(DATE).days[0].timeBlocks[0]).toEqual([0, 0, 0, 0, 0, 2]);
  });

  it("still migrates the legacy boolean grid", () => {
    const week = storedWeek();
    week.days[0].timeBlocks[0] = [true, false, true, false, false, false];
    store(week);

    expect(loadWeek(DATE).days[0].timeBlocks[0]).toEqual([1, 0, 1, 0, 0, 0]);
  });

  it("rebuilds a day that lost its subjects", () => {
    const week = storedWeek();
    delete week.days[3].subjects;
    store(week);

    const { subjects } = loadWeek(DATE).days[3];

    expect(subjects).toHaveLength(6);
    expect(subjects.every((s) => s.subject === "" && s.checked === false)).toBe(true);
  });

  it("keeps a subject row's colour tag through the repair", () => {
    const week = storedWeek();
    delete week.days[2].timeBlocks; // damage elsewhere in the week
    store(week);

    expect(loadWeek(DATE).days[0].subjects[0].colorId).toBe(4);
  });

  it("replaces text fields that are not text", () => {
    const week = storedWeek();
    week.weekGoal = { not: "a string" };
    week.days[0].memo = 42;
    store(week);

    const loaded = loadWeek(DATE);

    expect(loaded.weekGoal).toBe("");
    expect(loaded.days[0].memo).toBe("");
  });

  it("rebuilds the weekly todo list when it is missing", () => {
    const week = storedWeek();
    delete week.weeklyTodos;
    store(week);

    const { weeklyTodos } = loadWeek(DATE);

    expect(weeklyTodos).toHaveLength(8);
    expect(weeklyTodos.every((t) => t.text === "" && t.checked === false)).toBe(true);
  });

  it("gives back an empty week when the entry is not an object at all", () => {
    localStorage.setItem(KEY, JSON.stringify("nonsense"));

    expect(loadWeek(DATE).days).toHaveLength(7);
  });


  it("replaces a day date that is not a real date", () => {
    const week = storedWeek();
    week.days[1].date = "not-a-date";
    week.days[4].date = undefined;
    store(week);

    const loaded = loadWeek(DATE);
    const expected = getWeekDates(DATE).map((d) => format(d, "yyyy-MM-dd"));

    // Both day views run this through date-fns parse() and then format(), which
    // throws a RangeError on an unparseable date and takes the whole app down.
    expect(loaded.days[1].date).toBe(expected[1]);
    expect(loaded.days[4].date).toBe(expected[4]);
  });

  // Characterisation test, not a new requirement: DailyView lets a user delete
  // priority rows down to one. Padding every short list back up to six would
  // resurrect rows they deliberately removed, so repair must only rebuild a
  // subjects list that is missing outright.
  it("does not resurrect priority rows the user deleted", () => {
    const week = storedWeek();
    week.days[0].subjects = week.days[0].subjects.slice(0, 2);
    store(week);

    expect(loadWeek(DATE).days[0].subjects).toHaveLength(2);
  });
});

describe("loadWeek keeps a copy of anything it cannot read", () => {
  it("sets the unreadable entry aside instead of letting it be overwritten", () => {
    localStorage.setItem(KEY, "{ this is not json");

    loadWeek(DATE);

    expect(localStorage.getItem(`daily-log-unreadable-${getWeekKey(DATE)}`)).toBe(
      "{ this is not json"
    );
  });

  it("does not park the backup under the planner- prefix", () => {
    // Anything starting with planner- is picked up by the exporter as if it were
    // a week, which is a separate open bug; the backup must not feed it.
    localStorage.setItem(KEY, "{ this is not json");

    loadWeek(DATE);

    const plannerKeys = Object.keys(localStorage).filter((k) => k.startsWith("planner-"));
    expect(plannerKeys).toEqual([KEY]);
  });

  it("still returns a usable empty week", () => {
    localStorage.setItem(KEY, "{ this is not json");

    expect(loadWeek(DATE).days).toHaveLength(7);
  });
});
