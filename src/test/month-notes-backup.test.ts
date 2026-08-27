import { describe, it, expect, beforeEach } from "vitest";
import { createEmptyWeek, getWeekKey } from "@/lib/planner-data";
import { exportAllData, exportAsJSON, importFromJSON } from "@/lib/export-import";
import { loadMonthNote, saveMonthNote } from "@/lib/month-notes";

/**
 * Export is built on loadAllWeeks, which matches `^planner-\d{4}-W\d{2}$` — so
 * a month note is invisible to it by construction. Without these tests the note
 * is silently absent from every backup, and a backup that quietly omits
 * something the user typed is worse than no backup.
 */

const AUG = new Date(2026, 7, 26); // Wed 26 Aug 2026

const storeWeek = () =>
  localStorage.setItem(`planner-${getWeekKey(AUG)}`, JSON.stringify(createEmptyWeek(AUG)));

beforeEach(() => localStorage.clear());

describe("a backup carries the month notes", () => {
  it("includes them beside the weeks", () => {
    storeWeek();
    saveMonthNote("2026-08", "Teaching ate the month.");

    expect(exportAllData().monthNotes).toEqual({ "2026-08": "Teaching ate the month." });
  });

  it("includes the field even when no month has a note", () => {
    storeWeek();

    expect(exportAllData().monthNotes).toEqual({});
  });

  it("does not collect a note as if it were a week", () => {
    storeWeek();
    saveMonthNote("2026-08", "Teaching ate the month.");

    expect(Object.keys(exportAllData().weeks)).toEqual(["2026-W35"]);
  });

  it("stays at version 2, so an older build can still read the file", () => {
    expect(exportAllData().version).toBe(2);
  });
});

describe("a restore brings the month notes back", () => {
  it("round-trips them byte-identical alongside the weeks", () => {
    storeWeek();
    saveMonthNote("2026-08", "  Teaching ate the month.\n\n  Fix the Fridays.  ");
    const backup = exportAsJSON();
    localStorage.clear();

    const result = importFromJSON(backup);

    expect(result.success).toBe(true);
    expect(loadMonthNote("2026-08")).toBe("  Teaching ate the month.\n\n  Fix the Fridays.  ");
  });

  it("reads an older file with no monthNotes at all, and touches nothing", () => {
    saveMonthNote("2026-08", "Already here.");
    const old = JSON.stringify({
      version: 2,
      exportedAt: "2026-08-01T00:00:00.000Z",
      weeks: { "2026-W35": createEmptyWeek(AUG) },
      settings: { colorLabels: {} },
    });

    expect(importFromJSON(old).success).toBe(true);
    expect(loadMonthNote("2026-08")).toBe("Already here.");
  });

  it("leaves a stored month the file says nothing about alone", () => {
    saveMonthNote("2026-07", "July, not mentioned in the file.");
    storeWeek();
    saveMonthNote("2026-08", "August.");
    const backup = exportAsJSON();
    saveMonthNote("2026-08", "Overwrite me.");

    importFromJSON(backup);

    expect(loadMonthNote("2026-07")).toBe("July, not mentioned in the file.");
    expect(loadMonthNote("2026-08")).toBe("August.");
  });

  it("skips a note that is not text, and imports the rest", () => {
    const file = JSON.stringify({
      version: 2,
      exportedAt: "2026-08-01T00:00:00.000Z",
      weeks: { "2026-W35": createEmptyWeek(AUG) },
      monthNotes: { "2026-08": 42, "2026-09": "September survived." },
      settings: { colorLabels: {} },
    });

    expect(importFromJSON(file).success).toBe(true);
    expect(loadMonthNote("2026-08")).toBe("");
    expect(loadMonthNote("2026-09")).toBe("September survived.");
  });

  it("skips a key that is not a month, which must never become a storage key", () => {
    const file = JSON.stringify({
      version: 2,
      exportedAt: "2026-08-01T00:00:00.000Z",
      weeks: { "2026-W35": createEmptyWeek(AUG) },
      monthNotes: { "2026-13": "There is no thirteenth month.", "2026-09": "Fine." },
      settings: { colorLabels: {} },
    });

    importFromJSON(file);

    expect(localStorage.getItem("daily-log-month-2026-13")).toBeNull();
    expect(loadMonthNote("2026-09")).toBe("Fine.");
  });
});
