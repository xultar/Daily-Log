import { describe, it, expect, beforeEach } from "vitest";
import { exportAllData, exportAsCSV, exportAsJSON, importFromJSON } from "@/lib/export-import";
import { createEmptyWeek, getWeekKey, saveColorLabels } from "@/lib/planner-data";

/**
 * exportAllData used to treat every `planner-*` entry as a week. Two settings
 * live under that prefix — `planner-show-weekends`, written on every mount, and
 * `planner-color-labels` — so they were exported as if they were weeks and then
 * killed exportAsCSV on `week.days is not iterable`. CSV export therefore failed
 * for every user, always, rather than in some edge case.
 */

const WEEK = new Date(2026, 7, 26); // Wed 26 Aug 2026
const WEEK_KEY = getWeekKey(WEEK); // 2026-W35

/** A week with one named subject and 30 minutes painted on its Monday. */
function storeWeek(memo = "library until 4") {
  const week = createEmptyWeek(WEEK);
  week.days[0].subjects[0] = { subject: "Chapter 3 rewrite", checked: true };
  week.days[0].timeBlocks[0] = [1, 1, 2, 0, 0, 0];
  week.days[0].memo = memo;
  localStorage.setItem(`planner-${WEEK_KEY}`, JSON.stringify(week));
  return week;
}

/** The settings the app writes under the same prefix as weeks. */
function storeSettings() {
  localStorage.setItem("planner-show-weekends", "false");
  localStorage.setItem("planner-color-labels", JSON.stringify({ 1: "Deep work" }));
  localStorage.setItem("planner-theme", "sakura-pink");
  localStorage.setItem("daily-log-unreadable-2020-W05", "{ broken");
}

const lines = (csv: string) => csv.trim().split("\n");

beforeEach(() => localStorage.clear());

describe("exportAllData collects weeks and nothing else", () => {
  it("keys each week without the entry prefix", () => {
    storeWeek();

    expect(Object.keys(exportAllData().weeks)).toEqual([WEEK_KEY]);
  });

  it("leaves the settings that share the planner- prefix out", () => {
    storeWeek();
    storeSettings();

    expect(Object.keys(exportAllData().weeks)).toEqual([WEEK_KEY]);
  });

  it("leaves entries that are not weeks out even when they parse as JSON", () => {
    localStorage.setItem("planner-color-labels", JSON.stringify({ 1: "Deep work" }));

    expect(exportAllData().weeks).toEqual({});
  });

  it("skips a week entry that is not valid JSON", () => {
    storeWeek();
    localStorage.setItem("planner-2020-W05", "{ this is not json");

    expect(Object.keys(exportAllData().weeks)).toEqual([WEEK_KEY]);
  });
});

describe("exportAsCSV", () => {
  it("does not throw with the settings the app always writes", () => {
    storeWeek();
    storeSettings();

    expect(() => exportAsCSV()).not.toThrow();
  });

  it("starts with the header row", () => {
    storeWeek();

    expect(lines(exportAsCSV())[0]).toBe("Week,Day,Date,Subject,Checked,StudyMinutes,Memo");
  });

  it("writes a row per named subject carrying the week, date, minutes and memo", () => {
    storeWeek();
    storeSettings();

    const row = lines(exportAsCSV()).find((l) => l.includes("Chapter 3 rewrite"))!;

    expect(row).toContain(`"${WEEK_KEY}"`);
    expect(row).toContain('"2026-08-24"');
    expect(row).toContain("true"); // checked
    expect(row).toContain(",30,"); // three 10-minute blocks
    expect(row).toContain('"library until 4"');
  });

  it("writes one row for a day that has no named subject", () => {
    storeWeek();

    // Seven days, six of them empty, plus the header.
    expect(lines(exportAsCSV())).toHaveLength(8);
  });

  it("doubles quotes inside a subject or memo", () => {
    const week = createEmptyWeek(WEEK);
    week.days[0].subjects[0] = { subject: 'read "Dune"', checked: false };
    week.days[0].memo = 'he said "hello"';
    localStorage.setItem(`planner-${WEEK_KEY}`, JSON.stringify(week));

    const row = lines(exportAsCSV()).find((l) => l.includes("Dune"))!;

    expect(row).toContain('"read ""Dune"""');
    expect(row).toContain('"he said ""hello"""');
  });

  it("survives a week whose day lost its fields", () => {
    const week: Record<string, unknown> = createEmptyWeek(WEEK);
    const days = week.days as Record<string, unknown>[];
    delete days[2].timeBlocks;
    delete days[3].subjects;
    delete days[4].memo;
    localStorage.setItem(`planner-${WEEK_KEY}`, JSON.stringify(week));

    expect(() => exportAsCSV()).not.toThrow();
    expect(lines(exportAsCSV())).toHaveLength(8);
  });
});

describe("exportAsJSON", () => {
  it("carries only weeks, so a restore cannot reintroduce settings as weeks", () => {
    storeWeek();
    storeSettings();

    expect(Object.keys(JSON.parse(exportAsJSON()).weeks)).toEqual([WEEK_KEY]);
  });

  it("round-trips a week through import", () => {
    const before = storeWeek();
    const json = exportAsJSON();
    localStorage.clear();

    const result = importFromJSON(json);

    expect(result.success).toBe(true);
    expect(JSON.parse(localStorage.getItem(`planner-${WEEK_KEY}`)!)).toEqual(before);
  });
});

/**
 * A characterisation test, not a new requirement.
 *
 * `settings` carries the colour labels and nothing else, and leaving
 * `planner-show-weekends` and `planner-theme` out of it is a decision rather
 * than an oversight — reviewed again on 2026-08-27 and kept. Colour labels earn
 * their place because losing them loses what the colours *stand for*, which is
 * the only thing that makes the stored numbers mean anything. Weekend
 * visibility and the theme cost one click and carry no information, and a
 * restore that silently repaints the app is a surprise in an operation someone
 * ran to get their data back.
 *
 * This is asserted rather than left to the comment on `ExportSettings` because
 * the 2026-08-27 shakedown filed the absence as a defect, which is the second
 * time a deliberate decision in this file has been re-raised as a bug. An
 * equality assertion on the whole object also means a future setting cannot be
 * added here without someone deciding to.
 */
describe("what travels besides the weeks", () => {
  it("carries the colour labels, and no device preferences", () => {
    storeWeek();
    localStorage.setItem("planner-show-weekends", "false");
    localStorage.setItem("planner-theme", "sakura-pink");
    saveColorLabels({ 1: "Thesis" });

    expect(exportAllData().settings).toEqual({ colorLabels: { 1: "Thesis" } });
  });
});
