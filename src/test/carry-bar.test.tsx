import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CarryForwardBar from "@/components/planner/CarryForwardBar";
import { CarryCandidate } from "@/lib/planner-data";

const CANDIDATES: CarryCandidate[] = [
  { text: "Book viva slot", origin: "2026-08-17" },
  { text: "Draft methods", origin: "2026-08-03" },
  { text: "Email supervisor", origin: "2026-08-17" },
];

const setup = (props = {}) =>
  render(
    <CarryForwardBar
      candidates={CANDIDATES}
      mondayISO="2026-08-24"
      onBring={vi.fn()}
      onDismiss={vi.fn()}
      {...props}
    />
  );

describe("CarryForwardBar", () => {
  it("states how many items are unfinished", () => {
    setup();
    expect(screen.getByText(/3 items/)).toBeInTheDocument();
  });

  it("lists every candidate", () => {
    setup();
    for (const c of CANDIDATES) expect(screen.getByText(c.text)).toBeInTheDocument();
  });

  it("ticks everything by default, so the fast path is one click", () => {
    setup();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
  });

  it("brings only the ticked items", () => {
    const onBring = vi.fn();
    setup({ onBring });
    fireEvent.click(screen.getAllByRole("checkbox")[1]); // untick "Draft methods"
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));
    expect(onBring).toHaveBeenCalledTimes(1);
    expect(onBring.mock.calls[0][0].map((c: CarryCandidate) => c.text)).toEqual([
      "Book viva slot",
      "Email supervisor",
    ]);
  });

  it("counts down the button as rows are unticked", () => {
    setup();
    expect(screen.getByRole("button", { name: "Bring 3 forward" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(screen.getByRole("button", { name: "Bring 2 forward" })).toBeInTheDocument();
  });

  it("names each checkbox by its row", () => {
    setup();
    // Exact, not a regex: a loose match passes with the age token unhidden
    // ("Book viva slot 1w carried 1 week") and with the sr-only phrase deleted
    // ("Book viva slot 1w"), so it would defend neither half of the age wiring.
    expect(
      screen.getByRole("checkbox", { name: "Book viva slot carried 1 week" })
    ).toBeInTheDocument();
  });

  it("unticks a row when its text is clicked", () => {
    const onBring = vi.fn();
    setup({ onBring });
    fireEvent.click(screen.getByText("Draft methods"));
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));
    expect(onBring.mock.calls[0][0].map((c: CarryCandidate) => c.text)).toEqual([
      "Book viva slot",
      "Email supervisor",
    ]);
  });

  it("labels the checkbox group with the unfinished-items count", () => {
    // role="group" + aria-labelledby ties the rows to the "3 items" heading so
    // a screen-reader user landing on a checkbox has context.
    setup();
    expect(
      screen.getByRole("group", { name: "3 items unfinished from last week" })
    ).toBeInTheDocument();
  });

  it("keeps duplicate-text rows independent", () => {
    // collectCarryForward can emit the same text twice — once as a weekly
    // action, once as a flagged daily row — so the bar really does receive
    // duplicates. Keying by text would collide them.
    const onBring = vi.fn();
    setup({
      candidates: [
        { text: "Draft methods", origin: "2026-08-17" },
        { text: "Draft methods", origin: "2026-08-17" },
      ],
      onBring,
    });
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));
    expect(onBring.mock.calls[0][0]).toHaveLength(1);
  });

  it("reports nothing to bring when everything is unticked", () => {
    const onBring = vi.fn();
    setup({ onBring });
    screen.getAllByRole("checkbox").forEach((b) => fireEvent.click(b));
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));
    expect(onBring.mock.calls[0][0]).toEqual([]);
  });

  it("lets an unticked item be ticked again", () => {
    const onBring = vi.fn();
    setup({ onBring });
    const box = screen.getAllByRole("checkbox")[1];
    fireEvent.click(box); // untick
    fireEvent.click(box); // re-tick
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));
    expect(onBring.mock.calls[0][0]).toHaveLength(3);
  });

  it("dismisses without bringing anything", () => {
    const onBring = vi.fn();
    const onDismiss = vi.fn();
    setup({ onBring, onDismiss });
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onBring).not.toHaveBeenCalled();
  });

  it("shows how long each item has slipped", () => {
    setup();
    // Two candidates deliberately share an origin: that is the common case,
    // because collectCarryForward stamps the same source Monday on every item
    // that has none of its own. getByText would throw on the duplicate.
    expect(screen.getAllByText("1w")).toHaveLength(2);
    expect(screen.getByText("3w")).toBeInTheDocument();
  });

  it("measures age against the week being viewed, not a fixed date", () => {
    // Every other test uses the default mondayISO, so a component that ignored
    // the prop would pass all of them.
    setup({ mondayISO: "2026-08-31" });
    expect(screen.getAllByText("2w")).toHaveLength(2); // origin 2026-08-17
    expect(screen.getByText("4w")).toBeInTheDocument(); // origin 2026-08-03
  });

  it("does not label an item that originated in the week being viewed", () => {
    setup({ candidates: [{ text: "Fresh", origin: "2026-08-24" }] });
    expect(screen.getByText("Fresh")).toBeInTheDocument();
    expect(screen.queryByText("0w")).toBeNull();
  });

  it("says 1 item, not 1 items", () => {
    setup({ candidates: [{ text: "Only one", origin: "2026-08-17" }] });
    expect(screen.getByText("1 item")).toBeInTheDocument();
    expect(screen.queryByText(/1 items/)).toBeNull();
  });

  it("does not print", () => {
    const { container } = setup();
    expect(container.firstElementChild?.className).toContain("no-print");
  });

  it("carries none of the roles that would swallow the paint shortcuts", () => {
    // TimeGrid's keydown guard tests for these so Radix menus can swallow
    // digits; any of them on an ancestor silently disables 1-9 while focus
    // sits inside.
    const { container } = setup();
    expect(container.querySelector('[role="menu"], [role="dialog"], [role="listbox"]')).toBeNull();
  });
});
