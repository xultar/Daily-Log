import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import TimeGrid from "@/components/planner/TimeGrid";
import { createEmptyDay } from "@/lib/planner-data";

/**
 * The number keys select a colour by *display position*, never by storage id.
 * The two differ for four of the twelve entries, and confusing them writes
 * wrong values into weeks that are already planned.
 *
 * Twelve colours do not fit on ten keys, so positions 11 and 12 have none.
 */

const MONDAY = new Date(2026, 7, 24);

const setup = () => {
  const onActiveColorChange = vi.fn();
  render(
    <TimeGrid
      timeBlocks={createEmptyDay(MONDAY).timeBlocks}
      onChange={() => {}}
      activeColor={1}
      onActiveColorChange={onActiveColorChange}
    />
  );
  return onActiveColorChange;
};

afterEach(cleanup);

describe("selecting a colour by key", () => {
  it("maps 0 to display position 10, which is red", () => {
    // Literal expectations. Calling colorIdForDisplayPosition here would
    // reproduce the translation the handler performs, and agree with it even
    // when it is wrong.
    const onActiveColorChange = setup();
    fireEvent.keyDown(window, { key: "0" });
    expect(onActiveColorChange).toHaveBeenCalledWith(10);
  });

  it("still maps 9 to gray, whose storage id is 6", () => {
    // The muscle-memory guarantee, from the other side: this is the position
    // most likely to be broken by a tidier display order.
    const onActiveColorChange = setup();
    fireEvent.keyDown(window, { key: "9" });
    expect(onActiveColorChange).toHaveBeenCalledWith(6);
  });

  it("still maps 6 to yellow, whose storage id is 7", () => {
    // One of the four positions where display position and storage id differ.
    const onActiveColorChange = setup();
    fireEvent.keyDown(window, { key: "6" });
    expect(onActiveColorChange).toHaveBeenCalledWith(7);
  });

  it("leaves positions 11 and 12 without a key", () => {
    // Nothing on the number row can reach chartreuse or brown. If a key is
    // ever added for them, this test should be the thing that objects.
    const onActiveColorChange = setup();
    for (const key of ["-", "=", "a"]) {
      fireEvent.keyDown(window, { key });
    }
    expect(onActiveColorChange).not.toHaveBeenCalled();
  });

  it("types a zero into a label instead of repainting", () => {
    // The handler is on window, so without its INPUT guard every digit typed
    // into a colour label would also repaint the grid.
    const onActiveColorChange = setup();
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "0" });
    expect(onActiveColorChange).not.toHaveBeenCalled();
    input.remove();
  });
});
