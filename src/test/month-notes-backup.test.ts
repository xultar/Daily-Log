import { describe, it, expect, beforeEach } from "vitest";
import { createEmptyWeek, getWeekKey } from "@/lib/planner-data";
import { exportAllData } from "@/lib/export-import";
import { saveMonthNote } from "@/lib/month-notes";

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
