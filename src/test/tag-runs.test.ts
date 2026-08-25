import { describe, it, expect } from "vitest";
import { isTagRunStart, displayPositionForColorId } from "@/lib/planner-data";

describe("isTagRunStart", () => {
  it("marks the first block of a full-hour run and no others", () => {
    const hour = [3, 3, 3, 3, 3, 3];
    expect(hour.map((_, i) => isTagRunStart(hour, i))).toEqual([true, false, false, false, false, false]);
  });

  it("marks every block when tags alternate", () => {
    const hour = [1, 2, 1, 2, 1, 2];
    expect(hour.map((_, i) => isTagRunStart(hour, i))).toEqual([true, true, true, true, true, true]);
  });

  it("marks nothing in an empty hour", () => {
    const hour = [0, 0, 0, 0, 0, 0];
    expect(hour.map((_, i) => isTagRunStart(hour, i))).toEqual([false, false, false, false, false, false]);
  });

  it("starts a new run after a gap", () => {
    const hour = [5, 5, 0, 0, 5, 5];
    expect(hour.map((_, i) => isTagRunStart(hour, i))).toEqual([true, false, false, false, true, false]);
  });

  it("does not throw on a missing hour", () => {
    expect(isTagRunStart(undefined, 0)).toBe(false);
  });
});

describe("displayPositionForColorId", () => {
  it("is the inverse of colorIdForDisplayPosition", () => {
    // The printed number must be the display position, not the storage id.
    // They differ for gray, yellow, teal and magenta, so printing the storage
    // id would put a 6 on a block the legend calls 9.
    expect(displayPositionForColorId(6)).toBe(9);
    expect(displayPositionForColorId(7)).toBe(6);
    expect(displayPositionForColorId(8)).toBe(7);
    expect(displayPositionForColorId(9)).toBe(8);
    expect(displayPositionForColorId(1)).toBe(1);
  });

  it("returns null for an id that is not in the palette", () => {
    expect(displayPositionForColorId(0)).toBeNull();
    expect(displayPositionForColorId(99)).toBeNull();
  });
});
