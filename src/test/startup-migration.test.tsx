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
  // This is the only test that dynamically imports the app root, so React, the
  // router and every component are transformed inside the timed body; a static
  // import would have been paid during collection, which no timeout governs. It
  // has to stay dynamic — main.tsx runs the migration at module scope, so a
  // static import would fire before beforeEach seeds the week, and the test
  // would assert nothing.
  //
  // Measured on an 8-core dev machine: 1.3s cold and alone, 0.9s cold inside
  // the full suite. It carried its own 20s timeout for a while, on the theory
  // that it was the only test near the ceiling. It was not — today.test.tsx
  // sits at 3.2s — so the ceiling moved to vitest.config.ts and this override
  // came off rather than sitting there as a second knob doing the same job.
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
