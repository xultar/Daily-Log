import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import DailyView from "@/components/planner/DailyView";
import { createEmptyDay, getPaletteInDisplayOrder, legendCellBorders } from "@/lib/planner-data";

/**
 * The colour legend is a two-column grid inside a bordered box. Nine entries
 * means the last row holds a single cell, and every cell was drawing its own
 * bottom border — so that lone cell's border sat directly on the container's,
 * doubling the line across the left half only.
 *
 * The same expression gave every cell but the very last a right border, which
 * put a second doubled line down the right-hand column.
 *
 * Class names are asserted rather than computed styles: jsdom v20 drops the
 * modern colour syntax this project uses, so a style assertion reads empty and
 * a negative one passes vacuously.
 */

const MONDAY = new Date(2026, 7, 24);

const legendCells = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>(".grid.grid-cols-2 > button"));

/**
 * Exact class tokens, never substrings: "border-border/50" contains the
 * characters "border-b", so a substring check passes whatever the cell does and
 * discriminates nothing in either direction.
 */
const classesOf = (el: HTMLElement) => el.className.split(/\s+/).filter(Boolean);

const renderLegend = () => {
  const { container } = render(
    <DailyView day={createEmptyDay(MONDAY)} dayIndex={0} onChange={() => {}}
               activeColor={1} onActiveColorChange={() => {}} />
  );
  return legendCells(container);
};

afterEach(cleanup);

describe("legendCellBorders", () => {
  // Expectations are literal, never recomputed from the same formula the
  // implementation uses. A test that mirrors the arithmetic cannot fail when
  // the arithmetic is wrong — it reproduces the bug and agrees with it.

  it("keeps the bottom border off both cells of an even grid's last row", () => {
    // Twelve entries: indices 10 and 11 share the final row.
    const bottoms = Array.from({ length: 12 }, (_, i) => legendCellBorders(i, 12).bottom);
    expect(bottoms).toEqual([
      true, true, true, true, true,
      true, true, true, true, true,
      false, false,
    ]);
  });

  it("keeps it off the lone cell of an odd grid's last row", () => {
    // Nine entries: only index 8 is on the final row, alone.
    const bottoms = Array.from({ length: 9 }, (_, i) => legendCellBorders(i, 9).bottom);
    expect(bottoms).toEqual([true, true, true, true, true, true, true, true, false]);
  });

  it("draws a right border only on a cell that has one beside it", () => {
    const rights = Array.from({ length: 12 }, (_, i) => legendCellBorders(i, 12).right);
    expect(rights).toEqual([
      true, false, true, false, true, false,
      true, false, true, false, true, false,
    ]);
  });

  it("draws none on the lone cell of an odd grid, where it would stub into nothing", () => {
    expect(legendCellBorders(8, 9).right).toBe(false);
  });
});

describe("the colour legend's grid lines", () => {
  it("draws one cell per palette entry", () => {
    expect(renderLegend()).toHaveLength(getPaletteInDisplayOrder().length);
  });

  it("leaves the bottom border off the last row, where the container's already is", () => {
    const cells = renderLegend();

    // Nine entries in two columns: the ninth sits alone on the final row.
    expect(classesOf(cells[cells.length - 1])).not.toContain("border-b");
  });

  it("still separates every row above the last", () => {
    const cells = renderLegend();

    for (const cell of cells.slice(0, -1)) {
      expect(classesOf(cell)).toContain("border-b");
    }
  });

  it("draws a right border only where a cell actually sits to the right", () => {
    const cells = renderLegend();

    cells.forEach((cell, index) => {
      const hasNeighbour = index % 2 === 0 && index + 1 < cells.length;
      expect(classesOf(cell).includes("border-r")).toBe(hasNeighbour);
    });
  });

  it("puts no right border on the lone cell of the final row", () => {
    const cells = renderLegend();

    // Otherwise it draws a stub into the empty half of that row.
    expect(classesOf(cells[cells.length - 1])).not.toContain("border-r");
  });
});
