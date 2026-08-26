import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import DailyView from "@/components/planner/DailyView";
import { createEmptyDay } from "@/lib/planner-data";

/**
 * Each legend cell used to be a button with the rename field inside it, which
 * is invalid HTML: a button may not contain interactive content. Assistive tech
 * commonly prunes the children of role="button" and announces the button by its
 * name alone, so the field could be unreachable and unannounced. A
 * stopPropagation on the input was what held it together for mouse users.
 *
 * None of this behaviour had a test, which is why these exist.
 */

const MONDAY = new Date(2026, 7, 24);

const setup = (props: Record<string, unknown> = {}) => {
  const onActiveColorChange = vi.fn();
  const { container } = render(
    <DailyView
      day={createEmptyDay(MONDAY)}
      dayIndex={0}
      onChange={() => {}}
      activeColor={1}
      onActiveColorChange={onActiveColorChange}
      {...props}
    />
  );
  const legend = container.querySelector(".grid.grid-cols-2") as HTMLElement;
  return { legend, onActiveColorChange, container };
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("arming a colour from the legend", () => {
  it("arms the colour when its swatch is pressed", () => {
    const { onActiveColorChange } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Use Blue (key 1)" }));

    expect(onActiveColorChange).toHaveBeenCalledWith(1);
  });

  it("passes the storage id, not the display position", () => {
    // Display position 9 is gray, whose storage id is 6. Passing the position
    // would arm the wrong colour and paint the wrong value into timeBlocks.
    const { onActiveColorChange } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Use Gray (key 9)" }));

    expect(onActiveColorChange).toHaveBeenCalledWith(6);
  });

  it("says which key selects each colour", () => {
    setup();

    expect(screen.getByRole("button", { name: "Use Blue (key 1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use Gray (key 9)" })).toBeInTheDocument();
    // Display position 10, reached by the 0 key.
    expect(screen.getByRole("button", { name: "Use Red (key 0)" })).toBeInTheDocument();
  });

  it("promises no key for the two that have none", () => {
    // Twelve colours outran the number row. Naming a key that does nothing
    // would be worse than naming none.
    setup();

    expect(screen.getByRole("button", { name: "Use Chartreuse" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use Brown" })).toBeInTheDocument();
  });

  it("reports which colour is armed", () => {
    // The weekly legend has always done this; the daily one never did, so a
    // screen reader user was not told what pressing a swatch would paint with.
    setup({ activeColor: 3 });

    expect(screen.getByRole("button", { name: "Use Green (key 3)" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Use Blue (key 1)" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });
});

describe("renaming a colour from the legend", () => {
  it("offers every colour its own field", () => {
    // Scoped to the legend: the day view also has subject rows and a memo.
    const { legend } = setup();

    expect(within(legend).getAllByRole("textbox")).toHaveLength(12);
  });

  it("renames without arming", () => {
    // What stopPropagation used to buy, now a property of the structure: the
    // field is beside the button rather than inside it, so a click on it was
    // never a click on the button.
    const { legend, onActiveColorChange } = setup();

    fireEvent.change(within(legend).getByRole("textbox", { name: "Rename Blue" }), {
      target: { value: "Thesis" },
    });

    expect(onActiveColorChange).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("planner-color-labels")!)).toMatchObject({
      1: "Thesis",
    });
  });

  it("names both controls by the label once one is set", () => {
    localStorage.setItem("planner-color-labels", JSON.stringify({ 1: "Thesis" }));
    const { legend } = setup();

    expect(screen.getByRole("button", { name: "Use Thesis (key 1)" })).toBeInTheDocument();
    expect(within(legend).getByRole("textbox", { name: "Rename Thesis" })).toBeInTheDocument();
  });
});

describe("the cell is valid HTML", () => {
  it("nests no interactive element inside another", () => {
    // The defect itself, asserted structurally so it cannot come back quietly.
    // A button containing an input is invalid, and it is what this cell was.
    const { legend } = setup();

    for (const button of legend.querySelectorAll("button")) {
      expect(
        button.querySelector("input, button, select, textarea, a[href]"),
        `button "${button.getAttribute("aria-label")}" contains an interactive element`
      ).toBeNull();
    }
  });
});
