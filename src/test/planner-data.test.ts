import { describe, it, expect, beforeEach } from "vitest";
import {
  BLOCK_COLORS,
  getBlockColor,
  COLOR_IDS_IN_DISPLAY_ORDER,
  getPaletteInDisplayOrder,
  colorIdForDisplayPosition,
  createEmptyDay,
  createEmptyWeek,
  calcDayTotal,
  calcDayColorMinutes,
  calcWeekColorMinutes,
  formatMinutes,
  saveWeek,
  loadWeek,
  getBlockTint,
} from "@/lib/planner-data";

describe("BLOCK_COLORS", () => {
  it("has twelve entries", () => {
    // A tripwire, not a fact. It exists so that growing the palette is a
    // deliberate act with a diff attached, rather than something that happens
    // to a file. Update the number when you mean to; never delete the test.
    expect(BLOCK_COLORS).toHaveLength(12);
  });

  it("has unique ids numbered sequentially from 1", () => {
    const ids = BLOCK_COLORS.map((c) => c.id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Storage contract: a saved block value is this array's 1-based index.
  // Changing a row below repaints every saved week that used that color.
  // Adding a row at the END is the only safe edit — extend this table to match.
  it("pins every entry to its storage position", () => {
    expect(BLOCK_COLORS.map((c) => [c.id, c.label, c.hsl, c.hslDark])).toEqual([
      [1, "Blue",     "213 60% 80%", "213 60% 52%"],
      [2, "Pink",     "340 65% 76%", "340 65% 48%"],
      [3, "Green",    "140 35% 75%", "140 40% 42%"],
      [4, "Lavender", "270 40% 80%", "270 45% 64%"],
      [5, "Orange",   "25 65% 78%",  "25 70% 50%"],
      [6, "Gray",     "0 0% 78%",    "0 0% 46%"],
      [7, "Yellow",   "50 70% 76%",  "50 70% 58%"],
      [8, "Teal",     "178 40% 74%", "178 45% 38%"],
      [9, "Magenta",  "305 45% 76%", "305 45% 52%"],
      [10, "Red",        "4 65% 74%",  "4 65% 52%"],
      [11, "Chartreuse", "85 45% 74%", "85 45% 40%"],
      [12, "Brown",      "30 38% 64%", "30 42% 34%"],
    ]);
  });

  it("has no duplicate colors in either theme", () => {
    expect(new Set(BLOCK_COLORS.map((c) => c.hsl)).size).toBe(BLOCK_COLORS.length);
    expect(new Set(BLOCK_COLORS.map((c) => c.hslDark)).size).toBe(BLOCK_COLORS.length);
  });

  it("spreads the dark palette across lightness, not just hue", () => {
    // Nine hues at one lightness are not separable at swatch size. This pins
    // the property that motivated the re-tune so a later edit cannot quietly
    // flatten them back.
    const lightness = BLOCK_COLORS.map((c) => Number(c.hslDark.split(" ")[2].replace("%", "")));
    const span = Math.max(...lightness) - Math.min(...lightness);
    expect(span).toBeGreaterThan(20);
  });
});

describe("getBlockColor", () => {
  it("returns null for an empty block", () => {
    expect(getBlockColor(0)).toBeNull();
  });

  it("resolves a storage id to its CSS variable", () => {
    // The caller no longer says which scheme it wants. The cascade decides:
    // :root is light, .dark is dark, and @media print restores light. That is
    // what stopped an OS-dark machine sending dark values to the printer.
    expect(getBlockColor(1)).toBe("hsl(var(--tag-1))");
    expect(getBlockColor(6)).toBe("hsl(var(--tag-6))");
    expect(getBlockColor(7)).toBe("hsl(var(--tag-7))");
  });

  it("returns a distinct variable for every id", () => {
    const seen = new Set(BLOCK_COLORS.map((c) => getBlockColor(c.id)));
    expect(seen.size).toBe(BLOCK_COLORS.length);
  });

  it("returns null for an out-of-range value instead of throwing", () => {
    expect(getBlockColor(BLOCK_COLORS.length + 1)).toBeNull();
    expect(getBlockColor(99)).toBeNull();
  });
});

describe("COLOR_IDS_IN_DISPLAY_ORDER", () => {
  it("is a permutation of the palette ids", () => {
    const ids = BLOCK_COLORS.map((c) => c.id).sort((a, b) => a - b);
    const ordered = [...COLOR_IDS_IN_DISPLAY_ORDER].sort((a, b) => a - b);
    expect(ordered).toEqual(ids);
  });

  it("keeps gray at display position 9, where the 9 key has always put it", () => {
    // This deliberately reverses an earlier decision. The 2026-08-24 design
    // moved gray to the end so it would not sit mid-list; appending red,
    // chartreuse and brown puts it mid-list again. Restoring tidiness would
    // mean gray moving to position 12 and the 9 key selecting red instead —
    // silently retraining anyone with the shortcuts in their fingers.
    //
    // Display order costs nothing to change and muscle memory costs a lot, so
    // positions 1-9 are frozen and the new colours go on the end.
    expect(COLOR_IDS_IN_DISPLAY_ORDER[8]).toBe(6);
    expect(colorIdForDisplayPosition(9)).toBe(6);
  });
});

describe("getPaletteInDisplayOrder", () => {
  it("returns every entry, in COLOR_IDS_IN_DISPLAY_ORDER sequence", () => {
    const shown = getPaletteInDisplayOrder();
    expect(shown).toHaveLength(BLOCK_COLORS.length);
    expect(shown.map((c) => c.id)).toEqual(COLOR_IDS_IN_DISPLAY_ORDER);
  });
});

describe("colorIdForDisplayPosition", () => {
  it("maps a 1-based display position to a storage id", () => {
    expect(colorIdForDisplayPosition(1)).toBe(1);
    expect(colorIdForDisplayPosition(6)).toBe(7);
    expect(colorIdForDisplayPosition(9)).toBe(6);
  });

  it("returns null outside the palette", () => {
    expect(colorIdForDisplayPosition(0)).toBeNull();
    expect(colorIdForDisplayPosition(COLOR_IDS_IN_DISPLAY_ORDER.length + 1)).toBeNull();
    expect(colorIdForDisplayPosition(NaN)).toBeNull();
  });

  it("agrees with getPaletteInDisplayOrder on every position", () => {
    getPaletteInDisplayOrder().forEach((c, i) => {
      expect(colorIdForDisplayPosition(i + 1)).toBe(c.id);
    });
  });
});

const MONDAY = new Date(2026, 7, 24);

describe("calcDayTotal", () => {
  it("converts painted blocks into hours and minutes", () => {
    const day = createEmptyDay(MONDAY);
    day.timeBlocks[0][0] = 1;
    day.timeBlocks[0][1] = 2;
    day.timeBlocks[0][2] = 1;
    expect(calcDayTotal(day)).toEqual({ hours: 0, minutes: 30 });
  });

  it("rolls sixty minutes into an hour", () => {
    const day = createEmptyDay(MONDAY);
    for (let i = 0; i < 6; i++) day.timeBlocks[0][i] = 1;
    day.timeBlocks[1][0] = 1;
    expect(calcDayTotal(day)).toEqual({ hours: 1, minutes: 10 });
  });

  it("counts the final hour row", () => {
    const day = createEmptyDay(MONDAY);
    day.timeBlocks[day.timeBlocks.length - 1][5] = 1;
    expect(calcDayTotal(day)).toEqual({ hours: 0, minutes: 10 });
  });
});

describe("calcDayColorMinutes", () => {
  it("returns an empty record for a day with no painted blocks", () => {
    expect(calcDayColorMinutes(createEmptyDay(MONDAY))).toEqual({});
  });

  it("counts ten minutes per painted block, keyed by storage id", () => {
    const day = createEmptyDay(MONDAY);
    day.timeBlocks[0][0] = 1;
    day.timeBlocks[0][1] = 1;
    day.timeBlocks[0][2] = 3;
    expect(calcDayColorMinutes(day)).toEqual({ 1: 20, 3: 10 });
  });

  it("keys by storage id, not display position", () => {
    const day = createEmptyDay(MONDAY);
    day.timeBlocks[0][0] = 6;
    const result = calcDayColorMinutes(day);
    expect(result[6]).toBe(10);
    expect(result[9]).toBeUndefined();
  });

  it("counts blocks in the last hour and the last block of an hour", () => {
    const day = createEmptyDay(MONDAY);
    day.timeBlocks[day.timeBlocks.length - 1][5] = 2;
    expect(calcDayColorMinutes(day)).toEqual({ 2: 10 });
  });
});

describe("calcWeekColorMinutes", () => {
  it("returns an empty record for an untouched week", () => {
    expect(calcWeekColorMinutes(createEmptyWeek(MONDAY))).toEqual({});
  });

  it("sums one color across several days", () => {
    const week = createEmptyWeek(MONDAY);
    week.days[0].timeBlocks[0][0] = 3;
    week.days[2].timeBlocks[1][0] = 3;
    week.days[2].timeBlocks[1][1] = 3;
    expect(calcWeekColorMinutes(week)).toEqual({ 3: 30 });
  });

  it("keeps colors separate and omits colors with no blocks", () => {
    const week = createEmptyWeek(MONDAY);
    week.days[1].timeBlocks[0][0] = 7;
    week.days[4].timeBlocks[0][0] = 6;
    const result = calcWeekColorMinutes(week);
    expect(result).toEqual({ 6: 10, 7: 10 });
    expect(result[9]).toBeUndefined();
  });

  it("includes weekend days", () => {
    const week = createEmptyWeek(MONDAY);
    week.days[5].timeBlocks[0][0] = 4;
    week.days[6].timeBlocks[0][0] = 4;
    expect(calcWeekColorMinutes(week)).toEqual({ 4: 20 });
  });
});

describe("formatMinutes", () => {
  it("shows minutes alone under an hour", () => {
    expect(formatMinutes(40)).toBe("40m");
    expect(formatMinutes(10)).toBe("10m");
  });

  it("shows hours alone on a whole hour", () => {
    expect(formatMinutes(120)).toBe("2h");
  });

  it("shows both when there is a remainder", () => {
    expect(formatMinutes(150)).toBe("2h 30m");
  });

  it("shows zero as minutes", () => {
    expect(formatMinutes(0)).toBe("0m");
  });
});

describe("getBlockTint", () => {
  it("returns null for an empty block", () => {
    expect(getBlockTint(0)).toBeNull();
  });

  it("returns null for an out-of-range value", () => {
    expect(getBlockTint(BLOCK_COLORS.length + 1)).toBeNull();
    expect(getBlockTint(99)).toBeNull();
  });

  it("applies the 16% row wash to the same variable for every id", () => {
    for (const c of BLOCK_COLORS) {
      expect(getBlockTint(c.id)).toBe(`hsl(var(--tag-${c.id}) / 0.16)`);
    }
  });

  it("resolves a storage id, not a display position", () => {
    // Gray is storage id 6 and display position 9. Keying the variable by
    // display position would tint this row yellow.
    expect(getBlockTint(6)).toBe("hsl(var(--tag-6) / 0.16)");
  });
});

describe("SubjectRow.colorId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is absent on a freshly created day", () => {
    const day = createEmptyDay(MONDAY);
    expect(day.subjects[0].colorId).toBeUndefined();
  });

  it("survives a save and load round trip", () => {
    const week = createEmptyWeek(MONDAY);
    week.days[0].subjects[0] = { subject: "Draft the proposal", checked: false, colorId: 7 };
    saveWeek(MONDAY, week);
    expect(loadWeek(MONDAY).days[0].subjects[0].colorId).toBe(7);
  });

  it("loads a row saved without a colorId as untagged", () => {
    saveWeek(MONDAY, createEmptyWeek(MONDAY));
    const loaded = loadWeek(MONDAY);
    expect(loaded.days[0].subjects[0].colorId).toBeUndefined();
    expect(loaded.days[0].subjects[0].subject).toBe("");
  });

  it("stores the storage id, so gray round trips as 6 and not 9", () => {
    const week = createEmptyWeek(MONDAY);
    week.days[3].subjects[2] = { subject: "Buffer", checked: false, colorId: 6 };
    saveWeek(MONDAY, week);
    expect(loadWeek(MONDAY).days[3].subjects[2].colorId).toBe(6);
  });
});
