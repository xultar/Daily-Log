import { describe, it, expect } from "vitest";
import { BLOCK_COLORS, getBlockColor } from "@/lib/planner-data";

describe("BLOCK_COLORS", () => {
  it("has nine entries", () => {
    expect(BLOCK_COLORS).toHaveLength(9);
  });

  it("has unique ids numbered sequentially from 1", () => {
    const ids = BLOCK_COLORS.map((c) => c.id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Storage contract: a saved block value is this array's 1-based index.
  // Changing a row below repaints every saved week that used that color.
  // Adding a row at the END is the only safe edit — extend this table to match.
  it("pins every entry to its storage position", () => {
    expect(BLOCK_COLORS.map((c) => [c.id, c.label, c.hsl, c.hslDark])).toEqual([
      [1, "Blue",     "213 60% 80%", "213 50% 40%"],
      [2, "Pink",     "340 55% 82%", "340 45% 42%"],
      [3, "Green",    "140 35% 75%", "140 30% 38%"],
      [4, "Lavender", "270 40% 80%", "270 35% 42%"],
      [5, "Orange",   "25 65% 78%",  "25 55% 40%"],
      [6, "Gray",     "0 0% 78%",    "0 0% 42%"],
      [7, "Yellow",   "50 70% 76%",  "50 55% 38%"],
      [8, "Teal",     "178 40% 74%", "178 35% 36%"],
      [9, "Magenta",  "305 40% 80%", "305 35% 42%"],
    ]);
  });

  it("has no duplicate colors in either theme", () => {
    expect(new Set(BLOCK_COLORS.map((c) => c.hsl)).size).toBe(BLOCK_COLORS.length);
    expect(new Set(BLOCK_COLORS.map((c) => c.hslDark)).size).toBe(BLOCK_COLORS.length);
  });
});

describe("getBlockColor", () => {
  it("returns null for an empty block", () => {
    expect(getBlockColor(0, false)).toBeNull();
    expect(getBlockColor(0, true)).toBeNull();
  });

  it("resolves a storage id to its literal color", () => {
    expect(getBlockColor(1, false)).toBe("hsl(213 60% 80%)");
    expect(getBlockColor(6, true)).toBe("hsl(0 0% 42%)");
    expect(getBlockColor(7, false)).toBe("hsl(50 70% 76%)");
  });

  it("returns a different color per theme for every id", () => {
    for (const c of BLOCK_COLORS) {
      const light = getBlockColor(c.id, false);
      expect(light).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
      expect(getBlockColor(c.id, true)).not.toBe(light);
    }
  });

  it("returns null for an out-of-range value instead of throwing", () => {
    expect(getBlockColor(10, false)).toBeNull();
    expect(getBlockColor(99, true)).toBeNull();
  });
});
