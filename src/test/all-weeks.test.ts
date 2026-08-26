import { describe, it, expect, beforeEach } from "vitest";
import { loadAllWeeks, createEmptyWeek } from "@/lib/planner-data";

/**
 * Enumerating every stored week has been written by hand three times now:
 * exportAllData, migrateWeekKeys, and search. The first of those matched on the
 * `planner-` prefix rather than the entry shape, exported two settings as
 * weeks, and killed exportAsCSV on `week.days is not iterable` — for every
 * user, on every run, until it was fixed.
 *
 * This is that loop, once.
 */

const WEEK = new Date(2026, 7, 26); // Wed 26 Aug 2026

beforeEach(() => localStorage.clear());

describe("loadAllWeeks", () => {
  it("keys each week without the entry prefix", () => {
    localStorage.setItem("planner-2026-W35", JSON.stringify(createEmptyWeek(WEEK)));

    expect(Object.keys(loadAllWeeks())).toEqual(["2026-W35"]);
  });

  it("leaves out the settings that share the planner- prefix", () => {
    localStorage.setItem("planner-2026-W35", JSON.stringify(createEmptyWeek(WEEK)));
    localStorage.setItem("planner-show-weekends", "false");
    localStorage.setItem("planner-color-labels", JSON.stringify({ 1: "Thesis" }));
    localStorage.setItem("planner-theme", "sakura-pink");

    expect(Object.keys(loadAllWeeks())).toEqual(["2026-W35"]);
  });

  it("leaves out a quarantined unreadable entry", () => {
    localStorage.setItem("daily-log-unreadable-2020-W05", "{ broken");

    expect(loadAllWeeks()).toEqual({});
  });

  it("skips an entry that is not valid JSON rather than throwing", () => {
    localStorage.setItem("planner-2026-W34", "{ not json");
    localStorage.setItem("planner-2026-W35", JSON.stringify(createEmptyWeek(WEEK)));

    expect(Object.keys(loadAllWeeks())).toEqual(["2026-W35"]);
  });

  it("returns what was stored, without repairing it", () => {
    // Callers read a few fields; running every week through repairWeek to do
    // that would be a great deal of work for no benefit. The cost is that a
    // caller must defend its own field access, which is why search does.
    localStorage.setItem("planner-2026-W35", JSON.stringify({ weekGoal: "kept" }));

    expect(loadAllWeeks()["2026-W35"]).toEqual({ weekGoal: "kept" });
  });
});
