import { describe, it, expect, beforeEach } from "vitest";
import { createEmptyWeek } from "@/lib/planner-data";

/**
 * The migration has to run before anything reads a week, so it belongs at the
 * composition root rather than inside a component that renders after loadWeek
 * has already been called.
 */

const DEC_WEEK = new Date(2024, 11, 30); // Mon 30 Dec 2024, ISO week 1 of 2025

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
});

describe("application startup", () => {
  it("refiles a misplaced week before the app reads one", async () => {
    const week = createEmptyWeek(DEC_WEEK);
    week.weekGoal = "Finish before term starts";
    localStorage.setItem("planner-2024-W01", JSON.stringify(week));

    await import("@/main");

    expect(localStorage.getItem("planner-2024-W01")).toBeNull();
    expect(JSON.parse(localStorage.getItem("planner-2025-W01")!).weekGoal).toBe(
      "Finish before term starts"
    );
  });
});
