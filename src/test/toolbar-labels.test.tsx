import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import StudyPlanner from "@/components/planner/StudyPlanner";

/**
 * Five toolbar controls are icon-only and carried no accessible name, so a
 * screen reader announced each of them as "button": the two navigation
 * chevrons, and the appearance, export and import buttons in `ToolbarActions`.
 *
 * Their neighbours in the same row — Search, Copy, Trends, Rename — were all
 * labelled already, which is what makes this an inconsistency rather than a
 * house style. The sweep below is the point of the file: it fails for any
 * unnamed button added to the toolbar later, not only for those five.
 */

const NOW = new Date(2026, 7, 26, 9, 30); // Wed 26 Aug 2026

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };
const viewButton = (name: string) => screen.getByRole("button", { name });

const unnamedToolbarButtons = (container: HTMLElement) => {
  const toolbar = container.querySelector(".no-print")!;
  return [...toolbar.querySelectorAll("button")].filter(
    (b) => !(b.getAttribute("aria-label") || b.textContent?.trim()),
  );
};

describe("toolbar controls carry accessible names", () => {
  it("leaves no icon-only button unnamed", () => {
    const { container } = render(<StudyPlanner />);

    expect(unnamedToolbarButtons(container)).toHaveLength(0);
  });

  it("names the appearance, export and import controls", () => {
    render(<StudyPlanner />);

    expect(screen.getByRole("button", { name: "Appearance and theme" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export a backup" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import a backup" })).toBeTruthy();
  });

  /**
   * One pair of buttons moves by week, day or month depending on the view, so a
   * fixed "Previous" would be wrong in two views out of three. The label says
   * which unit it moves.
   */
  it("names the navigation arrows for the week view", () => {
    render(<StudyPlanner />);

    expect(screen.getByRole("button", { name: "Previous week" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next week" })).toBeTruthy();
  });

  it("renames the navigation arrows for the day view", async () => {
    render(<StudyPlanner />);

    await click(viewButton("Day"));

    expect(screen.getByRole("button", { name: "Previous day" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next day" })).toBeTruthy();
  });

  it("renames the navigation arrows for the month view", async () => {
    render(<StudyPlanner />);

    await click(viewButton("Month"));

    expect(screen.getByRole("button", { name: "Previous month" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next month" })).toBeTruthy();
  });
});
