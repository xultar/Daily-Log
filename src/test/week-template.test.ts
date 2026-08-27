import { describe, it, expect } from "vitest";
import { startOfWeek, subWeeks } from "date-fns";
import { createEmptyWeek, WeekData } from "@/lib/planner-data";
import { applyTemplate, previewTemplate } from "@/lib/week-template";

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

describe("applyTemplate — the priority rows", () => {
  it("lands a row in the first blank row, compacting rather than by position", () => {
    // Matches applyCarryForward, which fills a blank before appending.
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].subjects[3] = { subject: "Teaching", checked: false };
    const target = createEmptyWeek(TARGET_MONDAY);

    const result = applyTemplate(target, source);

    expect(result.days[0].subjects[0].subject).toBe("Teaching");
    expect(result.days[0].subjects[3].subject).toBe("");
  });

  it("keeps source order when several rows land", () => {
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].subjects[1] = { subject: "Teaching", checked: false };
    source.days[0].subjects[4] = { subject: "Supervision", checked: false };

    const result = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);

    expect(result.days[0].subjects.map((r) => r.subject).slice(0, 2)).toEqual([
      "Teaching",
      "Supervision",
    ]);
  });

  it("lands a row unchecked and keeps its colour tag", () => {
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].subjects[0] = { subject: "Teaching", checked: true, colorId: 3 };

    const result = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);

    expect(result.days[0].subjects[0]).toEqual({
      subject: "Teaching",
      checked: false,
      colorId: 3,
    });
  });

  it("never copies flagged or origin", () => {
    // flagged is the user saying "this one matters THIS week"; origin drives
    // the age marker, and a templated row is new work rather than a commitment
    // that has been slipping. Stamping it would render "1w" on a fresh row.
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].subjects[0] = {
      subject: "Teaching",
      checked: false,
      flagged: true,
      origin: "2026-08-10",
    };

    const result = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);

    expect(result.days[0].subjects[0].flagged).toBeUndefined();
    expect(result.days[0].subjects[0].origin).toBeUndefined();
  });

  it("lands a row with no colour tag without writing the field", () => {
    // colorId is optional, and rows saved before it existed load unflagged.
    // Writing undefined into the field is what repairSubject exists to stop.
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].subjects[0] = { subject: "Teaching", checked: false };

    const result = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);

    expect("colorId" in result.days[0].subjects[0]).toBe(false);
  });

  it("does not land a row whose text is already in that day", () => {
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].subjects[0] = { subject: "Teaching", checked: false };
    const target = createEmptyWeek(TARGET_MONDAY);
    target.days[0].subjects[2] = { subject: "Teaching", checked: false };

    const result = applyTemplate(target, source);

    expect(result.days[0].subjects.filter((r) => r.subject === "Teaching")).toHaveLength(1);
  });

  it("lands text listed twice in the source only once", () => {
    // The duplicate check must see rows landed earlier in the same pass, not
    // only the rows the target started with.
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].subjects[0] = { subject: "Teaching", checked: false };
    source.days[0].subjects[1] = { subject: "Teaching", checked: false };

    const result = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);

    expect(result.days[0].subjects.filter((r) => r.subject === "Teaching")).toHaveLength(1);
  });

  it("drops what will not fit when the day has no blank row left", () => {
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].subjects[0] = { subject: "Teaching", checked: false };
    const target = createEmptyWeek(TARGET_MONDAY);
    target.days[0].subjects = target.days[0].subjects.map((_, i) => ({
      subject: `Mine ${i}`,
      checked: false,
    }));

    const result = applyTemplate(target, source);

    expect(result.days[0].subjects.map((r) => r.subject)).toEqual([
      "Mine 0",
      "Mine 1",
      "Mine 2",
      "Mine 3",
      "Mine 4",
      "Mine 5",
    ]);
  });

  it("leaves memos, the goal, the review, weekly actions and carryResolved alone", () => {
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].memo = "Source memo";
    source.weekGoal = "Source goal";
    source.weekReview = "Source review";
    source.weeklyTodos[0] = { text: "Source action", checked: false };
    paint(source, 0, 0, 0, 1);

    const target = createEmptyWeek(TARGET_MONDAY);
    target.weekGoal = "My goal";
    target.carryResolved = true;

    const result = applyTemplate(target, source);

    expect(result.days[0].memo).toBe("");
    expect(result.weekGoal).toBe("My goal");
    expect(result.weekReview).toBe("");
    expect(result.weeklyTodos.every((t) => t.text === "")).toBe(true);
    expect(result.carryResolved).toBe(true);
  });

  it("changes nothing the second time it is applied", () => {
    // Emergent rather than enforced: after the first pass there are no empty
    // slots left to fill. Tested because emergent properties are the ones a
    // later change breaks without noticing.
    const source = createEmptyWeek(SOURCE_MONDAY);
    paint(source, 0, 3, 2, 5);
    source.days[0].subjects[0] = { subject: "Teaching", checked: false };

    const once = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);
    const twice = applyTemplate(once, source);

    expect(twice).toEqual(once);
  });
});

describe("previewTemplate", () => {
  it("counts exactly what applying actually changes", () => {
    // The dialog acts on these numbers. previewTemplate and applyTemplate are
    // wrappers over one pass so they cannot drift, and this proves the wiring
    // rather than trusting it.
    const source = createEmptyWeek(SOURCE_MONDAY);
    paint(source, 0, 0, 0, 1);
    paint(source, 0, 0, 1, 1);
    paint(source, 1, 5, 3, 2);
    source.days[0].subjects[0] = { subject: "Teaching", checked: false };
    source.days[1].subjects[0] = { subject: "Supervision", checked: false };

    const target = createEmptyWeek(TARGET_MONDAY);
    paint(target, 0, 0, 1, 9); // one collision
    target.days[1].subjects[0] = { subject: "Supervision", checked: false }; // one duplicate

    const preview = previewTemplate(target, source);
    const after = applyTemplate(target, source);

    let blocksChanged = 0;
    let rowsChanged = 0;
    target.days.forEach((day, i) => {
      day.timeBlocks.forEach((hour, h) =>
        hour.forEach((block, b) => {
          if (block !== after.days[i].timeBlocks[h][b]) blocksChanged++;
        })
      );
      day.subjects.forEach((row, r) => {
        if (row.subject !== after.days[i].subjects[r].subject) rowsChanged++;
      });
    });

    expect(preview.blocksToFill).toBe(blocksChanged);
    expect(preview.rowsToFill).toBe(rowsChanged);
    expect(preview.blocksKept).toBe(1);
    expect(preview.rowsDropped).toBe(1);
  });

  it("reports nothing to do for a week that is already full of the template", () => {
    const source = createEmptyWeek(SOURCE_MONDAY);
    paint(source, 0, 0, 0, 1);

    const once = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);

    expect(previewTemplate(once, source)).toEqual({
      blocksToFill: 0,
      blocksKept: 1,
      rowsToFill: 0,
      rowsDropped: 0,
    });
  });
});
