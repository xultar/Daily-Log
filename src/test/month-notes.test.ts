import { describe, it, expect } from "vitest";
import { isMonthKey, monthKeyFromEntryKey, monthKeyOf } from "@/lib/month-notes";

/**
 * A month note is the first thing this app stores that is not a week, so the
 * key format is the whole risk. Weeks and settings already share the `planner-`
 * prefix, and that overlap is what made exportAsCSV collect two settings as
 * weeks and die on `week.days is not iterable` — for every user, on every run.
 */

describe("the month key", () => {
  it("is the calendar month of a date", () => {
    expect(monthKeyOf(new Date(2026, 7, 26))).toBe("2026-08");
  });

  it("reads back out of a storage entry name", () => {
    expect(monthKeyFromEntryKey("daily-log-month-2026-08")).toBe("2026-08");
  });

  it("is not a week entry, whatever the prefix looks like", () => {
    expect(monthKeyFromEntryKey("planner-2026-W35")).toBeNull();
    expect(monthKeyFromEntryKey("planner-color-labels")).toBeNull();
    expect(monthKeyFromEntryKey("daily-log-unreadable-2026-W35")).toBeNull();
  });

  it("rejects twelve-plus and zero, which look like months and are not", () => {
    expect(monthKeyFromEntryKey("daily-log-month-2026-13")).toBeNull();
    expect(monthKeyFromEntryKey("daily-log-month-2026-00")).toBeNull();
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-08")).toBe(true);
  });
});
