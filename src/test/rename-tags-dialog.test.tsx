import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import RenameTagsDialog from "@/components/planner/RenameTagsDialog";

/**
 * The dialog renames and never arms, which is why its rows contain no button.
 * The day view's legend had to earn that property with a fix and a test after
 * shipping an input nested inside a button; here there is nothing to nest.
 */

const setup = (labels: Record<number, string> = {}) => {
  const onRename = vi.fn();
  render(<RenameTagsDialog labels={labels} onRename={onRename} />);
  fireEvent.click(screen.getByRole("button", { name: /rename colour tags/i }));
  return onRename;
};

afterEach(cleanup);

describe("the rename tags dialog", () => {
  it("lists all twelve tags in display order", () => {
    // Display order, not storage order: Gray sits ninth while keeping id 6.
    setup();

    const fields = screen.getAllByRole("textbox");
    expect(fields.map((f) => f.getAttribute("placeholder"))).toEqual([
      "Blue",
      "Pink",
      "Green",
      "Lavender",
      "Orange",
      "Yellow",
      "Teal",
      "Magenta",
      "Gray",
      "Red",
      "Chartreuse",
      "Brown",
    ]);
  });

  it("shows a custom name in the field and the default as its placeholder", () => {
    setup({ 6: "Buffer" });

    const field = screen.getByRole("textbox", { name: /rename buffer/i });
    expect((field as HTMLInputElement).value).toBe("Buffer");
    expect(field.getAttribute("placeholder")).toBe("Gray");
  });

  it("reports the storage id, not the display position", () => {
    // Gray is ninth on screen and sixth in storage. Reporting the position
    // would rename Magenta, which is what sits at storage id 9.
    const onRename = setup();

    fireEvent.change(screen.getByRole("textbox", { name: /rename gray/i }), {
      target: { value: "Buffer" },
    });

    expect(onRename).toHaveBeenCalledWith(6, "Buffer");
  });

  it("reports an empty string when a name is cleared", () => {
    // Clearing is how a tag goes back to its default, so it must reach the
    // handler rather than being swallowed as "no change".
    const onRename = setup({ 6: "Buffer" });

    fireEvent.change(screen.getByRole("textbox", { name: /rename buffer/i }), {
      target: { value: "" },
    });

    expect(onRename).toHaveBeenCalledWith(6, "");
  });

  it("puts no button in any row, so nothing can nest", () => {
    // Asserted as the absence of buttons rather than by looping over buttons
    // and checking their contents: that loop would never execute here, and a
    // test that cannot fail reads as coverage without being any.
    setup();

    expect(screen.getByRole("list").querySelectorAll("button")).toHaveLength(0);
  });
});
