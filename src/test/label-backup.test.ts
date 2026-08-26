import { describe, it, expect, beforeEach } from "vitest";
import { exportAllData, exportAsJSON, importFromJSON } from "@/lib/export-import";
import { createEmptyWeek, getWeekKey, loadColorLabels } from "@/lib/planner-data";

/**
 * The labels are the only user-typed content that does not live inside a week,
 * so they fell through the week-shaped filter the exporter grew when settings
 * were once exported as weeks and broke exportAsCSV.
 *
 * Restoring a backup used to hand back every week and none of the tag names.
 */

const WEEK = new Date(2026, 7, 26); // Wed 26 Aug 2026
const WEEK_KEY = getWeekKey(WEEK); // 2026-W35

const storeWeek = () =>
  localStorage.setItem(`planner-${WEEK_KEY}`, JSON.stringify(createEmptyWeek(WEEK)));

const setLabels = (labels: Record<string, unknown>) =>
  localStorage.setItem("planner-color-labels", JSON.stringify(labels));

/** A file as some other version of this app would have written it. */
const fileWith = (version: number, settings?: unknown) =>
  JSON.stringify({
    version,
    exportedAt: "2026-01-01T00:00:00.000Z",
    weeks: { [WEEK_KEY]: createEmptyWeek(WEEK) },
    ...(settings === undefined ? {} : { settings }),
  });

beforeEach(() => localStorage.clear());

describe("colour labels travel with a backup", () => {
  it("exports the labels that are set", () => {
    storeWeek();
    setLabels({ 1: "Thesis", 10: "Admin" });

    expect(exportAllData().settings).toEqual({ colorLabels: { 1: "Thesis", 10: "Admin" } });
  });

  it("still exports no settings entry as a week", () => {
    // The original bug, which this change must not reintroduce: the labels are
    // carried in their own section, never as an entry in weeks.
    storeWeek();
    setLabels({ 1: "Thesis" });
    localStorage.setItem("planner-show-weekends", "false");

    expect(Object.keys(exportAllData().weeks)).toEqual([WEEK_KEY]);
  });

  it("carries the labels through a full round trip", () => {
    storeWeek();
    setLabels({ 3: "Teaching" });
    const backup = exportAsJSON();

    localStorage.clear();
    const result = importFromJSON(backup);

    expect(result.success).toBe(true);
    expect(loadColorLabels()).toEqual({ 3: "Teaching" });
  });

  it("still restores a file written before labels travelled", () => {
    // A version 1 backup. It must import, and the absence of labels in the file
    // must not read as an instruction to delete the ones already here.
    setLabels({ 1: "Kept" });

    const result = importFromJSON(fileWith(1));

    expect(result.success).toBe(true);
    expect(loadColorLabels()).toEqual({ 1: "Kept" });
  });

  it("accepts a version 2 file that carries no settings at all", () => {
    // Nothing was labelled when the backup was taken. That is not an error.
    expect(importFromJSON(fileWith(2)).success).toBe(true);
  });

  it("merges by id instead of replacing the whole set", () => {
    // Exactly what importing weeks already does: what the file names is
    // overwritten, what it does not name is left alone.
    setLabels({ 1: "Local one", 2: "Local two" });

    importFromJSON(fileWith(2, { colorLabels: { 2: "From file", 5: "New" } }));

    expect(loadColorLabels()).toEqual({ 1: "Local one", 2: "From file", 5: "New" });
  });

  it("drops anything that is not a string keyed by a real colour", () => {
    // The file is untrusted, and loadColorLabels does no shape checking of its
    // own — it hands whatever JSON.parse produced straight to the legend.
    const result = importFromJSON(
      fileWith(2, { colorLabels: { 1: "Good", 99: "Past the palette", 2: 42, x: "Not a number" } })
    );

    expect(result.success).toBe(true);
    expect(loadColorLabels()).toEqual({ 1: "Good" });
  });

  it("survives a settings section that is not an object", () => {
    expect(importFromJSON(fileWith(2, "nonsense")).success).toBe(true);
    expect(loadColorLabels()).toEqual({});
  });

  it("refuses a version it does not know", () => {
    const result = importFromJSON(fileWith(3));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unsupported version/i);
  });
});
