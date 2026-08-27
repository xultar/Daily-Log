import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DailyView from "@/components/planner/DailyView";
import DayColumn from "@/components/planner/DayColumn";
import SearchDialog from "@/components/planner/SearchDialog";
import { createEmptyDay, createEmptyWeek } from "@/lib/planner-data";

/**
 * The free-text box on a day is called "Daily Log / Notes" in both views. It
 * used to say "Memo", which described the box's size rather than its purpose.
 *
 * A search result names the field it matched, so that label follows too.
 *
 * The one remaining "Memo" is deliberate: the CSV export column is a data
 * format rather than a label. Renaming it would change what lands in a
 * spreadsheet someone already has, and `export-import.test.ts` pins that header
 * row.
 */

const MONDAY = new Date(2026, 7, 24);
const AUG = new Date(2026, 7, 26); // Wed 26 Aug 2026, week 2026-W35

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("the day view's notes box", () => {
  it("is headed Daily Log / Notes", () => {
    render(
      <DailyView
        day={createEmptyDay(MONDAY)}
        dayIndex={0}
        onChange={() => {}}
        activeColor={1}
        onActiveColorChange={vi.fn()}
      />
    );

    // The heading is uppercased in CSS, which does not touch its text content.
    expect(screen.getByText("Daily Log / Notes")).toBeInTheDocument();
  });
});

describe("the week view's notes box", () => {
  it("prompts with Daily Log / Notes", () => {
    render(
      <DayColumn
        day={createEmptyDay(MONDAY)}
        dayIndex={0}
        onChange={() => {}}
        activeColor={1}
        onActiveColorChange={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText("Daily Log / Notes...")).toBeInTheDocument();
  });
});

describe("a search result's field label", () => {
  it("calls a match in that box Daily Log / Notes", () => {
    // The row reads "24 – 30 Aug 2026 · <field> · Friday", so this is the third
    // place the box is named and the one a search lands on.
    const week = createEmptyWeek(AUG);
    week.days[4].memo = "Library until four";
    localStorage.setItem("planner-2026-W35", JSON.stringify(week));

    render(<SearchDialog onJump={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /search/i }), {
      target: { value: "Library" },
    });

    expect(screen.getByText(/Daily Log \/ Notes/)).toBeInTheDocument();
  });

  it("leaves no 'memo' anywhere in the dialog", () => {
    // The dialog's own description listed what it searches and said "memos".
    // Asserted as an absence across the whole dialog, so a fourth copy of the
    // old word cannot reappear somewhere this file did not think to look.
    render(<SearchDialog onJump={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    expect(screen.queryByText(/memos?/i)).toBeNull();
  });
});
