import { describe, it, expect, beforeEach } from "vitest";
import { startOfWeek, subWeeks } from "date-fns";
import { createEmptyWeek, saveWeek, WeekData } from "@/lib/planner-data";
import { findTemplateSource } from "@/lib/week-template";

/**
 * The same backwards scan as findCarrySource, with one different question.
 * An existing-but-blank week is a perfectly good carry source and a useless
 * template, so this looks for paint rather than for existence.
 */

const NOW = new Date(2026, 7, 26); // Wed 26 Aug 2026
const thisMonday = () => startOfWeek(NOW, { weekStartsOn: 1 }); // 2026-08-24

/** A week with an hour painted on its Monday. */
function painted(monday: Date): WeekData {
  const w = createEmptyWeek(monday);
  for (let b = 0; b < 6; b++) w.days[0].timeBlocks[0][b] = 1;
  return w;
}

beforeEach(() => localStorage.clear());

describe("findTemplateSource", () => {
  it("returns the most recent week with something painted", () => {
    const one = subWeeks(thisMonday(), 1);
    saveWeek(one, painted(one));

    expect(findTemplateSource(NOW)?.monday).toBe("2026-08-17");
  });

  it("skips a week that is stored but has nothing painted", () => {
    // A blank week is not a schedule. This is the whole difference from
    // findCarrySource, which would stop at the blank one.
    const one = subWeeks(thisMonday(), 1);
    const two = subWeeks(thisMonday(), 2);
    saveWeek(one, createEmptyWeek(one));
    saveWeek(two, painted(two));

    expect(findTemplateSource(NOW)?.monday).toBe("2026-08-10");
  });

  it("gives up after four weeks rather than becoming an archaeology tool", () => {
    const five = subWeeks(thisMonday(), 5);
    saveWeek(five, painted(five));

    expect(findTemplateSource(NOW)).toBeNull();
  });

  it("returns null when nothing is stored", () => {
    expect(findTemplateSource(NOW)).toBeNull();
  });
});
