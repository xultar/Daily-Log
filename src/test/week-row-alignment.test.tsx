import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import DayColumn from "@/components/planner/DayColumn";
import StudyPlanner from "@/components/planner/StudyPlanner";
import { createEmptyDay, createEmptyWeek, getWeekKey } from "@/lib/planner-data";

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toasts: [] }) }));

/**
 * The week grid only reads across days if every column has the same number of
 * priority rows. It never did: `DayColumn` renders `day.subjects.map(...)`, so a
 * day with fewer rows starts its time grid higher than its neighbours.
 *
 * The obvious fix — padding `subjects` back to six on load — is wrong twice
 * over. `repairList` preserves length on purpose, because both views let a user
 * delete rows and padding would resurrect them; and `addSubject` is uncapped, so
 * a day with *eight* rows throws the others out in the direction six cannot
 * reach. The agreement has to happen in the view.
 *
 * **None of these tests can see a pixel.** jsdom does no layout, so they count
 * row slots and check that a spacer carries no controls. That the columns
 * actually line up is verified by measuring `TimeGrid`'s offsetTop in a browser.
 */

const MONDAY = new Date(2026, 7, 24); // Mon 24 Aug 2026, week 2026-W35

/** A day carrying exactly `n` priority rows. */
const dayWithRows = (n: number, date = MONDAY) => {
  const day = createEmptyDay(date);
  day.subjects = Array.from({ length: n }, (_, i) => ({
    subject: `Row ${i + 1}`,
    checked: false,
  }));
  return day;
};

/**
 * Every priority row slot in a column, real or spacer. Matched on the wrapper
 * class the rows share rather than on their contents, because a spacer
 * deliberately has no contents to match on.
 */
const rowSlots = (container: HTMLElement) =>
  container.querySelectorAll("[data-row-slot]");

const renderColumn = (day: ReturnType<typeof createEmptyDay>, rowCount: number) =>
  render(
    <DayColumn
      day={day}
      dayIndex={0}
      rowCount={rowCount}
      onChange={vi.fn()}
      activeColor={1}
      onActiveColorChange={vi.fn()}
    />
  );

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("a column pads to the row count it is given", () => {
  it("renders eight slots for a three-row day when the week's longest is eight", () => {
    // Asserted first because it is the case a pad-to-six fix could never reach.
    const { container } = renderColumn(dayWithRows(3), 8);

    expect(rowSlots(container)).toHaveLength(8);
  });

  it("adds nothing when the day already has the week's longest count", () => {
    const { container } = renderColumn(dayWithRows(6), 6);

    expect(rowSlots(container)).toHaveLength(6);
  });

  it("keeps every real row editable, and pads only past the last one", () => {
    const { container } = renderColumn(dayWithRows(2), 5);

    const inputs = container.querySelectorAll('input[type="text"]');
    expect(inputs).toHaveLength(2);
    expect((inputs[1] as HTMLInputElement).value).toBe("Row 2");
  });

  it("gives a spacer no controls at all", () => {
    const { container } = renderColumn(dayWithRows(1), 4);

    const spacers = [...rowSlots(container)].slice(1);
    expect(spacers).toHaveLength(3);
    for (const spacer of spacers) {
      expect(within(spacer as HTMLElement).queryByRole("textbox")).toBeNull();
      expect(within(spacer as HTMLElement).queryByRole("checkbox")).toBeNull();
      expect(within(spacer as HTMLElement).queryByRole("button")).toBeNull();
      expect(spacer).toHaveAttribute("aria-hidden", "true");
    }
  });
});

/** The week's stored days, with `lengths[i]` rows on day i. */
function storeWeekWithRowCounts(lengths: number[]) {
  const week = createEmptyWeek(MONDAY);
  week.days = week.days.map((d, i) => ({
    ...dayWithRows(lengths[i], new Date(2026, 7, 24 + i)),
    date: d.date,
  }));
  localStorage.setItem(`planner-${getWeekKey(MONDAY)}`, JSON.stringify(week));
}

/** Row slots per rendered column, left to right. */
const slotsPerColumn = (container: HTMLElement) =>
  [...container.querySelectorAll(".flex-1.min-w-\\[100px\\]")].map(
    (col) => col.querySelectorAll("[data-row-slot]").length
  );

describe("the whole week agrees on one row count", () => {
  it("lifts every column to the longest day", () => {
    storeWeekWithRowCounts([3, 6, 6, 6, 6, 6, 6]);

    const { container } = render(<StudyPlanner />);

    expect(slotsPerColumn(container)).toEqual([6, 6, 6, 6, 6, 6, 6]);
  });

  it("lifts them past six when a day has more", () => {
    storeWeekWithRowCounts([8, 6, 6, 6, 6, 6, 6]);

    const { container } = render(<StudyPlanner />);

    expect(slotsPerColumn(container)).toEqual([8, 8, 8, 8, 8, 8, 8]);
  });

  it("does not pad up to six when every day is shorter", () => {
    storeWeekWithRowCounts([3, 3, 3, 3, 3, 3, 3]);

    const { container } = render(<StudyPlanner />);

    expect(slotsPerColumn(container)).toEqual([3, 3, 3, 3, 3, 3, 3]);
  });

  it("ignores a hidden weekend day's larger count", () => {
    // Saturday is day 5. With weekends hidden it is not on screen, and padding
    // the weekdays out to match it would read as unexplained empty space.
    storeWeekWithRowCounts([6, 6, 6, 6, 6, 8, 6]);

    const { container } = render(<StudyPlanner />);
    fireEvent.click(screen.getByRole("button", { name: /hide weekends/i }));

    expect(slotsPerColumn(container)).toEqual([6, 6, 6, 6, 6]);
  });
});
