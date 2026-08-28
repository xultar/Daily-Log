import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";
import StudyPlanner from "@/components/planner/StudyPlanner";
import DayColumn from "@/components/planner/DayColumn";
import { createEmptyDay, createEmptyWeek, getWeekKey } from "@/lib/planner-data";

/**
 * Navigation was prev and next only, so getting back to the current week from a
 * distant one meant one click per week. Nothing marked today either, so once
 * you arrived the week view gave no clue which column it was.
 */

const NOW = new Date(2026, 7, 26, 9, 30); // Wed 26 Aug 2026
const THIS_WEEK = "Aug 24 — Aug 30, 2026";

const today = () => screen.getByRole("button", { name: "Today" });
const navLabel = () => document.querySelector("span.text-xs.font-semibold")!.textContent;
const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };
const viewButton = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("getting back to today", () => {
  it("returns to the current week from a distant one", async () => {
    const { container } = render(<StudyPlanner />);
    const prev = container.querySelectorAll("button")[0];

    for (let i = 0; i < 6; i++) await click(prev);
    expect(navLabel()).not.toBe(THIS_WEEK);

    await click(today());

    expect(navLabel()).toBe(THIS_WEEK);
  });

  it("lands on today itself in the day view, not just today's week", async () => {
    const { container } = render(<StudyPlanner />);
    await click(viewButton("Day"));
    const prev = container.querySelectorAll("button")[0];
    for (let i = 0; i < 10; i++) await click(prev);

    await click(today());

    expect(navLabel()).toBe("Wednesday, August 26, 2026");
  });

  it("returns to the current month in the month view", async () => {
    const { container } = render(<StudyPlanner />);
    await click(viewButton("Month"));
    const prev = container.querySelectorAll("button")[0];
    for (let i = 0; i < 4; i++) await click(prev);

    await click(today());

    expect(navLabel()).toBe("August 2026");
  });

  /**
   * The month view derives its month from `currentDate`, which used to be set
   * to the *Monday of this week*. On any day whose week began in the previous
   * month that is the wrong month — 38 days of 2026, and on 1 January it is the
   * wrong year.
   *
   * The test above cannot catch it: its clock is Wed 26 Aug, whose Monday is 24
   * Aug, the same month. It passes whatever that line does. This one picks a
   * date where the two disagree.
   */
  it("returns to the current month when this week began in the previous one", async () => {
    vi.setSystemTime(new Date(2026, 8, 1, 9, 30)); // Tue 1 Sep 2026; Monday is 31 Aug
    const { container } = render(<StudyPlanner />);
    await click(viewButton("Month"));
    const prev = container.querySelectorAll("button")[0];
    for (let i = 0; i < 2; i++) await click(prev);

    await click(today());

    expect(navLabel()).toBe("September 2026");
  });

  it("opens on the current month when this week began in the previous one", async () => {
    vi.setSystemTime(new Date(2026, 8, 1, 9, 30)); // Tue 1 Sep 2026

    render(<StudyPlanner />);
    await click(viewButton("Month"));

    expect(navLabel()).toBe("September 2026");
  });

  it("does nothing surprising when today is already on screen", async () => {
    render(<StudyPlanner />);

    await click(today());

    expect(navLabel()).toBe(THIS_WEEK);
  });

  it("writes nothing to storage, because arriving somewhere is not an edit", async () => {
    const { container } = render(<StudyPlanner />);
    const prev = container.querySelectorAll("button")[0];
    await click(prev);

    await click(today());
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(Object.keys(localStorage).filter((k) => /^planner-\d{4}-W/.test(k))).toEqual([]);
  });
});

describe("marking today in the month view", () => {
  const monthView = async () => {
    const rendered = render(<StudyPlanner />);
    await click(viewButton("Month"));
    return rendered;
  };

  it("marks the cell that is today", async () => {
    const { container } = await monthView();

    const marked = container.querySelector('[aria-current="date"]');
    expect(marked).toBeTruthy();
    expect(marked!.textContent).toContain("26");
  });

  it("marks exactly one cell in the month", async () => {
    const { container } = await monthView();

    expect(container.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
  });

  it("marks nothing once the user pages to another month", async () => {
    const { container } = await monthView();
    const next = container.querySelectorAll("button")[1];

    await click(next);

    expect(container.querySelector('[aria-current="date"]')).toBeNull();
  });

  /**
   * The marker cannot be a background. A day with painted time carries an inline
   * `backgroundColor` for its tag wash, and an inline style beats a class — so
   * on exactly the days that have data the marker would silently do nothing.
   * That is why hover here is a ring rather than a background, and the same trap
   * applies to this. Marking the date number instead sidesteps both.
   */
  it("survives a day that already carries a tag wash", async () => {
    const week = createEmptyWeek(NOW);
    const day = week.days.find((d) => d.date === "2026-08-26")!;
    for (let i = 0; i < 6; i++) day.timeBlocks[0][i] = 1;
    localStorage.setItem(`planner-${getWeekKey(NOW)}`, JSON.stringify(week));

    const { container } = await monthView();

    const marked = container.querySelector('[aria-current="date"]');
    expect(marked).toBeTruthy();
    expect(marked!.textContent).toContain("26");
  });
});

describe("marking today in the week view", () => {
  it("marks the column that is today", () => {
    const { container } = render(
      <DayColumn day={createEmptyDay(NOW)} dayIndex={2} onChange={() => {}}
                 activeColor={1} onActiveColorChange={() => {}} />
    );

    expect(container.querySelector('[aria-current="date"]')).toBeTruthy();
  });

  it("leaves a column that is not today unmarked", () => {
    const { container } = render(
      <DayColumn day={createEmptyDay(new Date(2026, 7, 24))} dayIndex={0} onChange={() => {}}
                 activeColor={1} onActiveColorChange={() => {}} />
    );

    expect(container.querySelector('[aria-current="date"]')).toBeNull();
  });

  it("marks exactly one column across the whole week", () => {
    const { container } = render(<StudyPlanner />);

    expect(container.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
  });

  it("washes today's notes area in the theme's own colour", () => {
    // Classes rather than computed styles, because jsdom applies no Tailwind.
    // The wash is decoration only: aria-current stays on the header alone, or
    // the week would announce the same day twice and the count above would be
    // two rather than one.
    const { container } = render(
      <DayColumn day={createEmptyDay(NOW)} dayIndex={2} onChange={() => {}}
                 activeColor={1} onActiveColorChange={() => {}} />
    );
    const notes = container.querySelector("textarea")!.parentElement!;

    // Both halves: the two themes need different alpha, because --primary is a
    // deep purple in dark and a pale lavender in light, and one value that
    // reads in either is invisible in the other.
    expect(notes.className).toContain("bg-primary/40");
    expect(notes.className).toContain("dark:bg-primary/15");
    expect(notes.querySelector('[aria-current="date"]')).toBeNull();
  });

  it("leaves another day's notes area unwashed", () => {
    const { container } = render(
      <DayColumn day={createEmptyDay(new Date(2026, 7, 24))} dayIndex={0} onChange={() => {}}
                 activeColor={1} onActiveColorChange={() => {}} />
    );
    const notes = container.querySelector("textarea")!.parentElement!;

    expect(notes.className).not.toContain("bg-primary");
  });

  it("marks the column whose date is today", () => {
    const { container } = render(<StudyPlanner />);
    const marked = container.querySelector('[aria-current="date"]')!;

    expect(within(marked as HTMLElement).getByText("8/26")).toBeTruthy();
  });
});

/**
 * `goToToday` sets `currentDate` and `selectedDayIndex` together, and its own
 * comment says why: "the day view lands on today itself". The initial state
 * used to disagree with it — `currentDate` started at `new Date()` while
 * `selectedDayIndex` started at 0 — so opening the day view before pressing
 * Today landed on the week's Monday. On a Friday that is four days wrong, and
 * the week view beside it was already marking Friday as today.
 *
 * The test above cannot catch it: it clicks prev ten times and then Today, so
 * it only ever sees an index that `goToToday` has already set.
 */
describe("opening the day view for the first time", () => {
  it("lands on today, not on the week's Monday", async () => {
    render(<StudyPlanner />);

    await click(viewButton("Day"));

    expect(navLabel()).toBe("Wednesday, August 26, 2026");
  });

  it("lands on today when today is a Sunday", async () => {
    vi.setSystemTime(new Date(2026, 7, 30, 9, 30)); // Sun 30 Aug 2026
    render(<StudyPlanner />);

    await click(viewButton("Day"));

    expect(navLabel()).toBe("Sunday, August 30, 2026");
  });
});
