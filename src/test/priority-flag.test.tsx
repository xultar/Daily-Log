import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import DailyView from "@/components/planner/DailyView";
import DayColumn from "@/components/planner/DayColumn";
import { createEmptyDay, createEmptyWeek, saveWeek, loadWeek } from "@/lib/planner-data";

/**
 * A priority/action row can be flagged as important. `flagged` is optional in
 * the same way `colorId` is, so rows written before the field existed load
 * unflagged and need no migration.
 *
 * The trap worth guarding: repairSubject rebuilds every row from a fixed list
 * of fields on load, so a field it does not know about is dropped silently —
 * the same failure mode CLAUDE.md records for updateSubject.
 */

const MONDAY = new Date(2026, 7, 24);

const dayWith = (row: Record<string, unknown>) => {
  const day = createEmptyDay(MONDAY);
  day.subjects[0] = { subject: "Chapter 3 rewrite", checked: false, ...row } as never;
  return day;
};

/**
 * The flag toggle belonging to the first priority row. Matched on "flag" rather
 * than "priority" so the query cannot also pick up the Add priority / action
 * button, which sits in the same subtree.
 */
const firstFlag = (container: HTMLElement) =>
  within(container).getAllByRole("button", { name: /flag/i })[0];

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe("a flag survives being stored and read back", () => {
  it("comes back set", () => {
    const week = createEmptyWeek(MONDAY);
    week.days[0].subjects[0] = { subject: "Chapter 3 rewrite", checked: false, flagged: true };
    saveWeek(MONDAY, week);

    expect(loadWeek(MONDAY).days[0].subjects[0].flagged).toBe(true);
  });

  it("survives a repair of damage elsewhere in the week", () => {
    const week = createEmptyWeek(MONDAY) as never as Record<string, never>;
    const days = week.days as unknown as Record<string, unknown>[];
    (days[0] as never as { subjects: unknown[] }).subjects[0] = {
      subject: "Chapter 3 rewrite",
      checked: false,
      colorId: 4,
      flagged: true,
    };
    delete days[2].timeBlocks;
    localStorage.setItem(`planner-2026-W35`, JSON.stringify(week));

    const row = loadWeek(MONDAY).days[0].subjects[0];

    expect(row.flagged).toBe(true);
    expect(row.colorId).toBe(4);
  });

  it("leaves a row that was never flagged alone", () => {
    saveWeek(MONDAY, createEmptyWeek(MONDAY));

    expect(loadWeek(MONDAY).days[0].subjects[0].flagged).toBeUndefined();
  });

  it("discards a flag value that is not a boolean", () => {
    const week = createEmptyWeek(MONDAY);
    week.days[0].subjects[0] = { subject: "x", checked: false, flagged: "yes" as never };
    localStorage.setItem(`planner-2026-W35`, JSON.stringify(week));

    expect(loadWeek(MONDAY).days[0].subjects[0].flagged).toBeUndefined();
  });
});

describe("flagging a row in the day view", () => {
  const renderDay = (day = dayWith({}), onChange = vi.fn()) => ({
    onChange,
    ...render(
      <DailyView day={day} dayIndex={0} onChange={onChange}
                 activeColor={1} onActiveColorChange={() => {}} />
    ),
  });

  it("turns the flag on", () => {
    const { onChange, container } = renderDay();

    fireEvent.click(firstFlag(container));

    expect(onChange.mock.calls[0][0].subjects[0].flagged).toBe(true);
  });

  it("turns an already flagged row off again", () => {
    const { onChange, container } = renderDay(dayWith({ flagged: true }));

    fireEvent.click(firstFlag(container));

    expect(onChange.mock.calls[0][0].subjects[0].flagged).toBe(false);
  });

  it("keeps the row's colour tag and text through the toggle", () => {
    const { onChange, container } = renderDay(dayWith({ colorId: 7 }));

    fireEvent.click(firstFlag(container));

    expect(onChange.mock.calls[0][0].subjects[0]).toEqual({
      subject: "Chapter 3 rewrite",
      checked: false,
      colorId: 7,
      flagged: true,
    });
  });

  it("says whether the row is flagged, for assistive tech", () => {
    const { container } = renderDay(dayWith({ flagged: true }));

    expect(firstFlag(container).getAttribute("aria-pressed")).toBe("true");
  });

  it("says when it is not", () => {
    const { container } = renderDay();

    expect(firstFlag(container).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("flagging a row in the week view", () => {
  it("turns the flag on from a day column too", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DayColumn day={dayWith({})} dayIndex={0} onChange={onChange}
                 activeColor={1} onActiveColorChange={() => {}} />
    );

    fireEvent.click(firstFlag(container));

    expect(onChange.mock.calls[0][0].subjects[0].flagged).toBe(true);
  });

  it("keeps the row's colour tag through the toggle", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DayColumn day={dayWith({ colorId: 7 })} dayIndex={0} onChange={onChange}
                 activeColor={1} onActiveColorChange={() => {}} />
    );

    fireEvent.click(firstFlag(container));

    expect(onChange.mock.calls[0][0].subjects[0].colorId).toBe(7);
  });
});

describe("the add-priority control names both kinds of row", () => {
  it("invites a priority or an action", () => {
    render(
      <DailyView day={createEmptyDay(MONDAY)} dayIndex={0} onChange={() => {}}
                 activeColor={1} onActiveColorChange={() => {}} />
    );

    expect(screen.getAllByPlaceholderText("Add priority / action...")[0]).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add priority / action" })).toBeTruthy();
  });
});
