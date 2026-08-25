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

  it("keeps gray at storage id 6 so saved weeks are not repainted", () => {
    expect(BLOCK_COLORS[5].label).toBe("Gray");
  });
});

describe("getBlockColor", () => {
  it("returns null for an empty block", () => {
    expect(getBlockColor(0, false)).toBeNull();
    expect(getBlockColor(0, true)).toBeNull();
  });

  it("returns the light color for every id", () => {
    for (const c of BLOCK_COLORS) {
      expect(getBlockColor(c.id, false)).toBe(`hsl(${c.hsl})`);
    }
  });

  it("returns the dark color for every id", () => {
    for (const c of BLOCK_COLORS) {
      expect(getBlockColor(c.id, true)).toBe(`hsl(${c.hslDark})`);
    }
  });

  it("returns null for an out-of-range value instead of throwing", () => {
    expect(getBlockColor(10, false)).toBeNull();
    expect(getBlockColor(99, true)).toBeNull();
  });
});
