import { describe, it, expect } from "vitest";
import { startOfWeek, subWeeks } from "date-fns";
import { createEmptyWeek, WeekData } from "@/lib/planner-data";
import { applyTemplate } from "@/lib/week-template";

/**
 * Copying fills empty slots and never overwrites, so nothing the user wrote
 * can be lost. Days map by index — the template's Monday is this week's
 * Monday, and the dates differ by definition.
 */

const NOW = new Date(2026, 7, 26);
const TARGET_MONDAY = startOfWeek(NOW, { weekStartsOn: 1 }); // 2026-08-24
const SOURCE_MONDAY = subWeeks(TARGET_MONDAY, 1); // 2026-08-17

/** Paint one ten-minute block. */
const paint = (w: WeekData, day: number, hour: number, block: number, colorId: number) => {
  w.days[day].timeBlocks[hour][block] = colorId;
};

describe("applyTemplate — the grid", () => {
  it("copies a painted block into an empty slot", () => {
    const source = createEmptyWeek(SOURCE_MONDAY);
    paint(source, 0, 3, 2, 5);

    const result = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);

    expect(result.days[0].timeBlocks[3][2]).toBe(5);
  });

  it("never overwrites a block the user has already painted", () => {
    const source = createEmptyWeek(SOURCE_MONDAY);
    paint(source, 0, 3, 2, 5);
    const target = createEmptyWeek(TARGET_MONDAY);
    paint(target, 0, 3, 2, 9);

    const result = applyTemplate(target, source);

    expect(result.days[0].timeBlocks[3][2]).toBe(9);
  });

  it("maps days by index, not by date", () => {
    // The load-bearing case: the two weeks carry different dates by
    // definition, so anything matching on date would copy nothing at all.
    const source = createEmptyWeek(SOURCE_MONDAY);
    paint(source, 4, 0, 0, 7); // the source's Friday

    const result = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);

    expect(result.days[4].timeBlocks[0][0]).toBe(7); // the target's Friday
    expect(result.days[4].date).toBe("2026-08-28"); // still the target's date
  });

  it("mutates neither the target nor the source", () => {
    // Carry-forward's first rule: the source week genuinely happened the way
    // it happened, and applying a template must leave that record true.
    const source = createEmptyWeek(SOURCE_MONDAY);
    paint(source, 0, 3, 2, 5);
    const target = createEmptyWeek(TARGET_MONDAY);
    const sourceBefore = JSON.stringify(source);
    const targetBefore = JSON.stringify(target);

    applyTemplate(target, source);

    expect(JSON.stringify(source)).toBe(sourceBefore);
    expect(JSON.stringify(target)).toBe(targetBefore);
  });
});
