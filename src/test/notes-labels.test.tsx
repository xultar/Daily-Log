import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import DailyView from "@/components/planner/DailyView";
import DayColumn from "@/components/planner/DayColumn";
import { createEmptyDay } from "@/lib/planner-data";

/**
 * The free-text box on a day is called "Daily Log / Notes" in both views. It
 * used to say "Memo", which described the box's size rather than its purpose.
 *
 * Two other "Memo"s in this codebase are deliberately untouched. The CSV export
 * column is a data format rather than a label — renaming it would change what
 * lands in a spreadsheet someone already has, and `export-import.test.ts` pins
 * that header row. `SearchDialog`'s `FIELD_LABEL.memo` names the field a result
 * matched, and whether it should follow these two is an open question rather
 * than an oversight.
 */

const MONDAY = new Date(2026, 7, 24);

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
