import { describe, it, expect } from "vitest";
import {
  createEmptyDay,
  dominantTag,
  tintAlpha,
  WASH_FLOOR,
  WASH_CEILING_DARK,
  WASH_CEILING_LIGHT,
  DayData,
} from "@/lib/planner-data";

const DATE = new Date(2026, 7, 26);

/** Paint `count` ten-minute blocks with a storage id, from the top of the grid. */
function painted(...runs: [colorId: number, count: number][]): DayData {
  const day = createEmptyDay(DATE);
  let hour = 0;
  for (const [colorId, count] of runs) {
    for (let i = 0; i < count; i++) {
      day.timeBlocks[hour][i % 6] = colorId;
      if (i % 6 === 5) hour++;
    }
    hour++;
  }
  return day;
}

describe("dominantTag", () => {
  it("returns the tag with the most minutes", () => {
    expect(dominantTag(painted([1, 6], [2, 3]))).toBe(1);
    expect(dominantTag(painted([1, 3], [2, 6]))).toBe(2);
  });

  it("breaks a tie by display position, not by storage id", () => {
    // Gray is storage id 6 and display position 9. Magenta is storage id 9 and
    // display position 8. Comparing ids would pick gray; comparing what the
    // user actually sees picks magenta. This pair exists precisely so the two
    // rules disagree.
    expect(dominantTag(painted([6, 6], [9, 6]))).toBe(9);
  });

  it("returns null for a day with nothing painted", () => {
    expect(dominantTag(createEmptyDay(DATE))).toBeNull();
  });

  it("returns the only tag when there is only one", () => {
    expect(dominantTag(painted([11, 2]))).toBe(11);
  });

  it("returns null for a day whose timeBlocks are damaged, rather than throwing", () => {
    // The month view reads repaired weeks, so this should not arise there. It
    // costs one guard to make the function safe for a caller that does not.
    const day = createEmptyDay(DATE);
    // @ts-expect-error deliberately malformed
    day.timeBlocks = "not a grid";

    expect(() => dominantTag(day)).not.toThrow();
    expect(dominantTag(day)).toBeNull();
  });
});

describe("tintAlpha", () => {
  // Tested here rather than through the view: jsdom drops
  // `hsl(var(--tag-N) / 0.45)` as modern colour syntax, so a style assertion
  // against the rendered cell reads empty whatever the component did.

  it("starts at the floor whatever the ceiling", () => {
    expect(tintAlpha(0, WASH_CEILING_DARK)).toBeCloseTo(WASH_FLOOR, 5);
    expect(tintAlpha(0, WASH_CEILING_LIGHT)).toBeCloseTo(WASH_FLOOR, 5);
  });

  it("gets stronger with more time", () => {
    expect(tintAlpha(60, WASH_CEILING_DARK)).toBeGreaterThan(tintAlpha(10, WASH_CEILING_DARK));
    expect(tintAlpha(180, WASH_CEILING_DARK)).toBeGreaterThan(tintAlpha(60, WASH_CEILING_DARK));
  });

  it("treats four hours as a full day and does not go past it", () => {
    expect(tintAlpha(240, WASH_CEILING_DARK)).toBeCloseTo(WASH_CEILING_DARK, 5);
    expect(tintAlpha(600, WASH_CEILING_DARK)).toBeCloseTo(WASH_CEILING_DARK, 5);
  });

  it("washes light mode harder than dark, at every level above the floor", () => {
    // Dark caps at 0.45 because the tags are lighter than the page and drag a
    // washed cell toward the colour of its own text. Light clears WCAG AA at
    // full opacity, so it is free to be bolder. Same twelve colours, opposite
    // constraint.
    expect(WASH_CEILING_LIGHT).toBeGreaterThan(WASH_CEILING_DARK);
    for (const mins of [60, 120, 240]) {
      expect(tintAlpha(mins, WASH_CEILING_LIGHT)).toBeGreaterThan(
        tintAlpha(mins, WASH_CEILING_DARK)
      );
    }
  });

  it("does not go below the floor for a nonsense total", () => {
    expect(tintAlpha(-30, WASH_CEILING_DARK)).toBeCloseTo(WASH_FLOOR, 5);
  });
});
