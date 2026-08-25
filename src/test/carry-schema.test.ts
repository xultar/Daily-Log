import { describe, it, expect, beforeEach } from "vitest";
import { saveWeek, loadWeek, createEmptyWeek, repairWeek } from "@/lib/planner-data";

const MONDAY = new Date(2026, 7, 24); // 2026-08-24, a Monday

beforeEach(() => localStorage.clear());

describe("origin survives a save and load", () => {
  it("keeps origin on a weekly todo", () => {
    const week = createEmptyWeek(MONDAY);
    week.weeklyTodos[0] = { text: "Book viva slot", checked: false, origin: "2026-08-10" };
    saveWeek(MONDAY, week);
    expect(loadWeek(MONDAY).weeklyTodos[0].origin).toBe("2026-08-10");
  });

  it("keeps origin, flagged and colorId together on a subject row", () => {
    // The combination, not each in isolation: repairSubject rebuilds a row from
    // a fixed list of fields, so a field missing from that list is dropped with
    // no type error and no failing test unless one names it.
    const week = createEmptyWeek(MONDAY);
    week.days[0].subjects[0] = {
      subject: "Lab report", checked: false, colorId: 3, flagged: true, origin: "2026-08-17",
    };
    saveWeek(MONDAY, week);
    const row = loadWeek(MONDAY).days[0].subjects[0];
    expect(row).toEqual({
      subject: "Lab report", checked: false, colorId: 3, flagged: true, origin: "2026-08-17",
    });
  });

  it("drops an origin that is not a valid ISO date, and still loads the item", () => {
    const repaired = repairWeek(
      { weeklyTodos: [{ text: "Keep me", checked: false, origin: "last tuesday" }] },
      MONDAY
    );
    expect(repaired.weeklyTodos[0].text).toBe("Keep me");
    expect(repaired.weeklyTodos[0].origin).toBeUndefined();
  });

  it("drops a date-shaped value that is not a real date", () => {
    // ISO_DATE is a shape check: 2026-02-31 matches it. Handing that to
    // date-fns format() throws RangeError and unmounts the app, which is why
    // parseability is checked too.
    const repaired = repairWeek(
      { weeklyTodos: [{ text: "Keep me", checked: false, origin: "2026-02-31" }] },
      MONDAY
    );
    expect(repaired.weeklyTodos[0].text).toBe("Keep me");
    expect(repaired.weeklyTodos[0].origin).toBeUndefined();
  });

  it("leaves origin off the object entirely when there is none", () => {
    const repaired = repairWeek({ weeklyTodos: [{ text: "Fresh", checked: false }] }, MONDAY);
    expect("origin" in repaired.weeklyTodos[0]).toBe(false);
  });
});

describe("carryResolved survives a save and load", () => {
  it("round-trips when true", () => {
    const week = createEmptyWeek(MONDAY);
    week.carryResolved = true;
    saveWeek(MONDAY, week);
    expect(loadWeek(MONDAY).carryResolved).toBe(true);
  });

  it("stays absent rather than false when unset", () => {
    // Same convention as flagged: a week written before the field existed and a
    // week whose bar was never resolved must be identical on disk.
    const week = createEmptyWeek(MONDAY);
    saveWeek(MONDAY, week);
    expect("carryResolved" in loadWeek(MONDAY)).toBe(false);
  });

  it("ignores a non-boolean carryResolved", () => {
    expect(repairWeek({ carryResolved: "yes" }, MONDAY).carryResolved).toBeUndefined();
  });
});
