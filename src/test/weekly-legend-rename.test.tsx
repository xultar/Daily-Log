import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import WeeklyColorLegend from "@/components/planner/WeeklyColorLegend";

/**
 * The strip reads its labels once per mount, because loadColorLabels() hits
 * localStorage and this component re-renders at drag-paint rate. Making it
 * editable means that read has to become state — same single read, but now it
 * can update. These tests pin both halves of that.
 */

const setup = () => {
  const onSelect = vi.fn();
  const { container } = render(
    <WeeklyColorLegend colorMinutes={{}} activeColor={1} onSelect={onSelect} />
  );
  return { container, onSelect };
};

const openDialog = () =>
  fireEvent.click(screen.getByRole("button", { name: /rename colour tags/i }));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("renaming from the weekly strip", () => {
  it("opens the dialog from the strip", () => {
    setup();
    openDialog();

    expect(screen.getByRole("textbox", { name: /rename gray/i })).toBeInTheDocument();
  });

  it("saves a new name", () => {
    setup();
    openDialog();

    fireEvent.change(screen.getByRole("textbox", { name: /rename gray/i }), {
      target: { value: "Buffer" },
    });

    expect(JSON.parse(localStorage.getItem("planner-color-labels") as string)).toEqual({
      6: "Buffer",
    });
  });

  it("shows the new name in the strip behind the dialog", () => {
    // The whole reason the useMemo became useState. With the memo the strip
    // would keep showing "Gray" until something remounted it.
    setup();
    openDialog();

    fireEvent.change(screen.getByRole("textbox", { name: /rename gray/i }), {
      target: { value: "Buffer" },
    });

    // The strip renders the name as text; the dialog renders it as a field
    // value, which getByText does not match. So this can only be the strip.
    expect(screen.getByText("Buffer")).toBeInTheDocument();
  });

  it("goes back to the default when a name is cleared", () => {
    setup();
    openDialog();
    const field = () => screen.getByRole("textbox", { name: /rename (gray|buffer)/i });

    fireEvent.change(field(), { target: { value: "Buffer" } });
    fireEvent.change(field(), { target: { value: "" } });

    expect(screen.getByText("Gray")).toBeInTheDocument();
  });

  it("writes nothing merely by opening the dialog", () => {
    // A read that writes on mount is the bug that put planner-color-labels: {}
    // into storage for users who had never named a tag. Saving in the handler
    // rather than from an effect is what makes this hold.
    setup();
    openDialog();

    expect(localStorage.getItem("planner-color-labels")).toBeNull();
  });

  it("keeps the trigger outside the scrolling container", () => {
    // Structural on purpose. Inside the scroller the trigger sits after twelve
    // entries, which is off screen at any normal width — a feature you have to
    // scroll sideways to discover is one nobody discovers.
    const { container } = setup();

    const scroller = container.querySelector(".overflow-x-auto") as HTMLElement;
    const trigger = screen.getByRole("button", { name: /rename colour tags/i });

    expect(scroller).not.toBeNull();
    expect(scroller.contains(trigger)).toBe(false);
  });
});
