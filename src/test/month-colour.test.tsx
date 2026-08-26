import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import MonthlyView from "@/components/planner/MonthlyView";
import { createEmptyWeek, getWeekKey } from "@/lib/planner-data";

/**
 * A month cell said how much a day took and never what it was spent on.
 *
 * The tag name matters as much as the tint: several pairs in this palette
 * measure at dE 0.7 to 2.8 under deuteranopia, so a view whose whole message is
 * hue is unreadable for those users and prints as identical greys.
 */

const IN_MONTH = new Date(2026, 7, 26); // Wed 26 Aug 2026

/** Seed the week containing IN_MONTH with `blocks` ten-minute blocks of a tag. */
function seedDay(colorId: number, blocks = 6) {
  const week = createEmptyWeek(IN_MONTH);
  const day = week.days.find((d) => d.date === "2026-08-26")!;
  for (let i = 0; i < blocks; i++) day.timeBlocks[0][i] = colorId;
  localStorage.setItem(`planner-${getWeekKey(IN_MONTH)}`, JSON.stringify(week));
}

const renderMonth = () =>
  render(<MonthlyView currentDate={IN_MONTH} onSelectDay={vi.fn()} />);

/** The cell for a given day number, found by its date label. */
const cellFor = (container: HTMLElement, dayNumber: string) =>
  [...container.querySelectorAll<HTMLElement>(".grid.grid-cols-7 > div")].find(
    (c) => c.firstElementChild?.textContent === dayNumber
  )!;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("colour in the month view", () => {
  it("tints a day with its dominant tag", () => {
    // Asserted as the decision, not the rendered colour. jsdom's CSSOM drops
    // `hsl(var(--tag-11) / 0.45)` as modern colour syntax, so reading
    // style.backgroundColor here returns an empty string whatever the
    // component did — CLAUDE.md and legend-borders.test.tsx both say so. That
    // the tint reaches the screen is checked in a browser.
    seedDay(11); // chartreuse
    const { container } = renderMonth();

    expect(cellFor(container, "26").dataset.dominantTag).toBe("11");
  });

  // Scoped to the calendar cell throughout. The tag name also appears in the
  // "Time blocked by tag" bars below the grid, so an unscoped screen query
  // finds two of everything and says nothing about the cell.

  it("names the tag, so the cell does not depend on colour alone", () => {
    seedDay(11);
    const { container } = renderMonth();

    expect(cellFor(container, "26").textContent).toContain("Chartreuse");
  });

  it("uses the name the user gave the tag", () => {
    seedDay(11);
    localStorage.setItem("planner-color-labels", JSON.stringify({ 11: "Thesis" }));
    const { container } = renderMonth();

    expect(cellFor(container, "26").textContent).toContain("Thesis");
    expect(cellFor(container, "26").textContent).not.toContain("Chartreuse");
  });

  it("leaves a day with no time untinted and unnamed", () => {
    seedDay(11);
    const { container } = renderMonth();

    // The 27th has nothing painted.
    expect(cellFor(container, "27").dataset.dominantTag).toBeUndefined();
    expect(cellFor(container, "27").textContent).not.toContain("Chartreuse");

    // Exactly one cell carries the name, so this cannot pass by no cell doing.
    const named = [...container.querySelectorAll(".grid.grid-cols-7 > div")].filter((c) =>
      c.textContent?.includes("Chartreuse")
    );
    expect(named).toHaveLength(1);
  });

  it("does not hover with a background class", () => {
    // An inline backgroundColor beats a hover background class, so hover would
    // stop working on exactly the days that have data — invisible in a
    // screenshot, obvious in use.
    seedDay(11);
    const { container } = renderMonth();

    expect(cellFor(container, "26").className).not.toMatch(/hover:bg-/);
  });
});
