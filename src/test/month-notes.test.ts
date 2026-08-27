import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isMonthKey,
  loadAllMonthNotes,
  loadMonthNote,
  monthKeyFromEntryKey,
  monthKeyOf,
  saveMonthNote,
} from "@/lib/month-notes";

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

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("one month's note", () => {
  it("loads back what was saved", () => {
    saveMonthNote("2026-08", "Teaching ate the month.");

    expect(loadMonthNote("2026-08")).toBe("Teaching ate the month.");
  });

  it("is an empty string when nothing was ever written", () => {
    expect(loadMonthNote("2026-08")).toBe("");
  });

  it("stores under a key of its own, not a week's", () => {
    saveMonthNote("2026-08", "Something");

    expect(localStorage.getItem("daily-log-month-2026-08")).toBe("Something");
  });

  it("removes the key when the note is emptied, rather than storing nothing", () => {
    saveMonthNote("2026-08", "Something");

    saveMonthNote("2026-08", "");

    expect(localStorage.getItem("daily-log-month-2026-08")).toBeNull();
  });

  it("treats whitespace as emptied — it is the absence of a note", () => {
    saveMonthNote("2026-08", "Something");

    saveMonthNote("2026-08", "   \n  ");

    expect(localStorage.getItem("daily-log-month-2026-08")).toBeNull();
  });

  it("keeps the whitespace inside a real note, which is the user's", () => {
    saveMonthNote("2026-08", "  Went well.\n\n  Change the Fridays.  ");

    expect(loadMonthNote("2026-08")).toBe("  Went well.\n\n  Change the Fridays.  ");
  });

  it("gives an empty note rather than throwing when storage is denied", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });

    expect(loadMonthNote("2026-08")).toBe("");
  });

  it("reports false rather than throwing when storage is full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });

    expect(saveMonthNote("2026-08", "Something")).toBe(false);
  });
});

describe("every month at once", () => {
  it("keys each note by its month, without the entry prefix", () => {
    saveMonthNote("2026-08", "August");
    saveMonthNote("2026-09", "September");

    expect(loadAllMonthNotes()).toEqual({ "2026-08": "August", "2026-09": "September" });
  });

  it("leaves out weeks and settings, which is the whole point of the prefix", () => {
    saveMonthNote("2026-08", "August");
    localStorage.setItem("planner-2026-W35", JSON.stringify({ days: [] }));
    localStorage.setItem("planner-color-labels", JSON.stringify({ 1: "Thesis" }));
    localStorage.setItem("planner-show-weekends", "false");

    expect(Object.keys(loadAllMonthNotes())).toEqual(["2026-08"]);
  });

  it("is empty rather than throwing when storage cannot be enumerated", () => {
    vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });

    expect(loadAllMonthNotes()).toEqual({});
  });
});
