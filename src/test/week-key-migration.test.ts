import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { startOfWeek, addWeeks, format } from "date-fns";
import { getWeekKey, createEmptyWeek, loadWeek, migrateWeekKeys } from "@/lib/planner-data";
import { importFromJSON } from "@/lib/export-import";

/**
 * getWeekKey used to pair an ISO week *number* with a calendar year, which
 * disagree whenever a December Monday belongs to ISO week 1 of the next year.
 * Nine weeks between 2015 and 2040 were affected, and each one landed on the
 * key of that year's own first week — so opening it showed January's plan and
 * editing it overwrote January.
 */

const DEC_WEEK = new Date(2024, 11, 30); // Mon 30 Dec 2024, ISO week 1 of 2025
const JAN_WEEK = new Date(2024, 0, 1); // Mon 1 Jan 2024, ISO week 1 of 2024
const LEGACY_KEY = "planner-2024-W01"; // what BOTH used to key to

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("getWeekKey names a week after the ISO year its week number belongs to", () => {
  it("keys a December week that is ISO week 1 to the following year", () => {
    expect(getWeekKey(DEC_WEEK)).toBe("2025-W01");
  });

  it("still keys the first week of the year to that year", () => {
    expect(getWeekKey(JAN_WEEK)).toBe("2024-W01");
  });

  it("leaves an ordinary mid-year week alone", () => {
    expect(getWeekKey(new Date(2026, 7, 26))).toBe("2026-W35");
  });

  it("gives every week from 2015 to 2040 a key of its own", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    let monday = startOfWeek(new Date(2015, 0, 5), { weekStartsOn: 1 });
    while (monday < new Date(2040, 0, 1)) {
      const key = getWeekKey(monday);
      const iso = format(monday, "yyyy-MM-dd");
      if (seen.has(key)) clashes.push(`${key}: ${seen.get(key)} and ${iso}`);
      else seen.set(key, iso);
      monday = addWeeks(monday, 1);
    }
    expect(clashes).toEqual([]);
  });
});

describe("migrateWeekKeys refiles weeks the old key function misplaced", () => {
  /** A December week as it would have been written under the old key. */
  function storeLegacyDecemberWeek() {
    const week = createEmptyWeek(DEC_WEEK);
    week.weekGoal = "Finish before term starts";
    week.days[0].subjects[0] = { subject: "Chapter 3 rewrite", checked: true, colorId: 4 };
    week.days[0].timeBlocks[0] = [1, 1, 2, 0, 0, 0];
    localStorage.setItem(LEGACY_KEY, JSON.stringify(week));
    return week;
  }

  it("moves the week to the key its own dates imply", () => {
    storeLegacyDecemberWeek();

    const result = migrateWeekKeys();

    expect(result.moved).toBe(1);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(localStorage.getItem("planner-2025-W01")).not.toBeNull();
  });

  it("carries the content across untouched", () => {
    const before = storeLegacyDecemberWeek();

    migrateWeekKeys();

    expect(JSON.parse(localStorage.getItem("planner-2025-W01")!)).toEqual(before);
  });

  it("makes the misfiled week reachable again from its own date", () => {
    storeLegacyDecemberWeek();

    migrateWeekKeys();

    expect(loadWeek(DEC_WEEK).weekGoal).toBe("Finish before term starts");
  });

  it("leaves a correctly filed week where it is", () => {
    const week = createEmptyWeek(JAN_WEEK);
    week.weekGoal = "January plan";
    localStorage.setItem(LEGACY_KEY, JSON.stringify(week));

    const result = migrateWeekKeys();

    expect(result.moved).toBe(0);
    expect(JSON.parse(localStorage.getItem(LEGACY_KEY)!).weekGoal).toBe("January plan");
  });

  it("does nothing the second time it runs", () => {
    storeLegacyDecemberWeek();

    migrateWeekKeys();
    const result = migrateWeekKeys();

    expect(result.moved).toBe(0);
    expect(localStorage.getItem("planner-2025-W01")).not.toBeNull();
  });

  it("leaves a week alone when its days carry no readable date", () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ weekGoal: "x", days: [{ date: "junk" }] }));

    const result = migrateWeekKeys();

    expect(result.moved).toBe(0);
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });

  it("refuses to overwrite a key that is already occupied", () => {
    storeLegacyDecemberWeek();
    const occupant = createEmptyWeek(DEC_WEEK);
    occupant.weekGoal = "already here";
    localStorage.setItem("planner-2025-W01", JSON.stringify(occupant));

    const result = migrateWeekKeys();

    expect(result.moved).toBe(0);
    expect(result.conflicts).toEqual(["2024-W01"]);
    expect(JSON.parse(localStorage.getItem("planner-2025-W01")!).weekGoal).toBe("already here");
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });

  it("ignores settings and non-week entries", () => {
    localStorage.setItem("planner-show-weekends", "false");
    localStorage.setItem("planner-color-labels", JSON.stringify({ 1: "Deep work" }));
    localStorage.setItem("planner-theme", "sakura-pink");
    localStorage.setItem("daily-log-unreadable-2024-W01", "{ broken");

    const result = migrateWeekKeys();

    expect(result.moved).toBe(0);
    expect(localStorage.getItem("planner-show-weekends")).toBe("false");
    expect(localStorage.getItem("planner-theme")).toBe("sakura-pink");
    expect(localStorage.getItem("daily-log-unreadable-2024-W01")).toBe("{ broken");
  });

  it("never throws when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });

    expect(() => migrateWeekKeys()).not.toThrow();
  });
});

describe("importing a backup written before the fix", () => {
  it("files each week under the key its own dates imply", () => {
    const week = createEmptyWeek(DEC_WEEK);
    week.weekGoal = "Finish before term starts";
    const backup = { version: 1, exportedAt: "2025-01-02T00:00:00.000Z", weeks: { "2024-W01": week } };

    const result = importFromJSON(JSON.stringify(backup));

    expect(result.success).toBe(true);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem("planner-2025-W01")!).weekGoal).toBe(
      "Finish before term starts"
    );
  });

  it("still honours the file's key when the week carries no usable date", () => {
    const backup = { version: 1, exportedAt: "x", weeks: { "2026-W35": { days: [] } } };

    importFromJSON(JSON.stringify(backup));

    expect(localStorage.getItem("planner-2026-W35")).not.toBeNull();
  });
});
