import { describe, it, expect, beforeEach } from "vitest";
import { importFromJSON } from "@/lib/export-import";
import { createEmptyWeek, getWeekKey, loadWeek } from "@/lib/planner-data";

/**
 * Import writes straight into the only copy of the user's data, so a file has
 * to be checked before any of it lands. It used to write whatever the file
 * contained: a `weeks` entry that was not a week at all overwrote a real week,
 * which loadWeek then repaired into an empty one.
 *
 * A week is importable only when its own days say which week it is. That is the
 * same rule the storage key already follows, and it doubles as the shape check
 * — junk carries no readable date, so it cannot displace anything.
 */

const WEEK = new Date(2026, 7, 26);
const KEY = `planner-${getWeekKey(WEEK)}`; // planner-2026-W35

function validWeek(goal = "Ship the thesis chapter") {
  const week = createEmptyWeek(WEEK);
  week.weekGoal = goal;
  return week;
}

const file = (weeks: unknown, version: unknown = 1) =>
  JSON.stringify({ version, exportedAt: "2026-08-25T00:00:00.000Z", weeks });

/** A real week already in storage, which a bad import must not destroy. */
function existingWork() {
  const week = validWeek("Work already here");
  localStorage.setItem(KEY, JSON.stringify(week));
  return week;
}

beforeEach(() => localStorage.clear());

describe("a file that cannot be trusted is refused whole", () => {
  it("refuses text that is not JSON", () => {
    const result = importFromJSON("{ this is not json");

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("refuses a file of the wrong version", () => {
    const result = importFromJSON(file({ "2026-W35": validWeek() }, 2));

    expect(result.success).toBe(false);
  });

  it("refuses a file with no weeks object", () => {
    expect(importFromJSON(file(undefined)).success).toBe(false);
    expect(importFromJSON(file("not an object")).success).toBe(false);
    expect(importFromJSON(file(42)).success).toBe(false);
  });

  it("refuses a file whose entries are not weeks", () => {
    const result = importFromJSON(file({ "2026-W35": "hello", "2026-W36": { days: [1, 2, 3] } }));

    expect(result.success).toBe(false);
    expect(result.weeksImported).toBe(0);
  });

  it("leaves existing work untouched when it refuses a file", () => {
    const before = existingWork();

    importFromJSON(file({ "2026-W35": "hello" }));

    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(before);
    expect(loadWeek(WEEK).weekGoal).toBe("Work already here");
  });

  it("writes nothing at all when only some entries are unusable", () => {
    // Validation happens before the first write, so a file that fails partway
    // cannot leave storage half replaced.
    existingWork();

    importFromJSON(file({ "2026-W35": "hello" }));

    expect(JSON.parse(localStorage.getItem(KEY)!).weekGoal).toBe("Work already here");
  });
});

describe("a file with usable weeks is imported", () => {
  it("imports a week and reports it", () => {
    const result = importFromJSON(file({ "2026-W35": validWeek() }));

    expect(result.success).toBe(true);
    expect(result.weeksImported).toBe(1);
    expect(JSON.parse(localStorage.getItem(KEY)!).weekGoal).toBe("Ship the thesis chapter");
  });

  it("files each week by its own dates, not by the key in the file", () => {
    // A backup written before the week-key fix carries the old, colliding key.
    const december = createEmptyWeek(new Date(2024, 11, 30));
    december.weekGoal = "Finish before term starts";

    importFromJSON(file({ "2024-W01": december }));

    expect(localStorage.getItem("planner-2024-W01")).toBeNull();
    expect(JSON.parse(localStorage.getItem("planner-2025-W01")!).weekGoal).toBe(
      "Finish before term starts"
    );
  });

  it("keeps the usable weeks and reports the ones it skipped", () => {
    const result = importFromJSON(file({ "2026-W35": validWeek(), junk: { days: [] } }));

    expect(result.success).toBe(true);
    expect(result.weeksImported).toBe(1);
    expect(result.weeksSkipped).toBe(1);
    expect(JSON.parse(localStorage.getItem(KEY)!).weekGoal).toBe("Ship the thesis chapter");
  });

  it("reports nothing skipped for a clean file", () => {
    expect(importFromJSON(file({ "2026-W35": validWeek() })).weeksSkipped).toBe(0);
  });
});
