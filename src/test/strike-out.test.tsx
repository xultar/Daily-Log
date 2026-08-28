import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import DailyView from "@/components/planner/DailyView";
import DayColumn from "@/components/planner/DayColumn";
import WeeklyTodoSidebar from "@/components/planner/WeeklyTodoSidebar";
import { createEmptyDay, createEmptyWeek, repairWeek, saveWeek, loadWeek } from "@/lib/planner-data";
import { collectCarryForward } from "@/lib/carry";
import { applyTemplate } from "@/lib/week-template";

/**
 * Striking a task out is the Bullet Journal "irrelevant" bullet: the third way
 * a review of an open task can end, beside migrating it. Without it, "I have
 * decided this does not matter" and "I have not looked at this yet" are both an
 * unchecked box, and the carry bar goes on offering abandoned items for ever.
 *
 * Design: docs/superpowers/specs/2026-08-28-strike-out-design.md
 */

const MONDAY = new Date(2026, 7, 24); // Mon 24 Aug 2026

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("struck survives repair", () => {
  const repaired = (row: unknown, todo: unknown = {}) => {
    const week = createEmptyWeek(MONDAY) as unknown as Record<string, unknown>;
    const raw = JSON.parse(JSON.stringify(week));
    raw.days[0].subjects[0] = row;
    raw.weeklyTodos[0] = todo;
    const out = repairWeek(raw, MONDAY);
    return { row: out.days[0].subjects[0], todo: out.weeklyTodos[0] };
  };

  it("keeps a struck row struck", () => {
    expect(repaired({ subject: "Read the paper", checked: false, struck: true }).row.struck).toBe(true);
  });

  it("keeps a struck weekly action struck", () => {
    expect(repaired({}, { text: "Book the room", checked: false, struck: true }).todo.struck).toBe(true);
  });

  /**
   * Only a real `true` survives, matching `flagged`. A row that was never
   * struck stays free of the field rather than storing false, so rows written
   * before the field existed are identical to rows whose strike was lifted.
   */
  it.each([false, "true", 1, null, undefined])("drops a struck value of %p", (value) => {
    expect(repaired({ subject: "x", checked: false, struck: value }).row.struck).toBeUndefined();
  });

  it("survives a round trip through storage", () => {
    const week = createEmptyWeek(MONDAY);
    week.days[0].subjects[0] = { subject: "Chase the invoice", checked: false, struck: true };
    week.weeklyTodos[0] = { text: "Book the room", checked: false, struck: true };

    saveWeek(MONDAY, week);
    const back = loadWeek(MONDAY);

    expect(back.days[0].subjects[0].struck).toBe(true);
    expect(back.weeklyTodos[0].struck).toBe(true);
  });
});

describe("struck items never carry forward", () => {
  const weekWith = (row: Partial<Record<string, unknown>>, todo: Partial<Record<string, unknown>> = {}) => {
    const week = createEmptyWeek(MONDAY);
    week.days[0].subjects[0] = { subject: "Chase the invoice", checked: false, flagged: true, ...row };
    week.weeklyTodos[0] = { text: "Book the room", checked: false, ...todo };
    return week;
  };
  const texts = (week: ReturnType<typeof weekWith>) =>
    collectCarryForward(week, "2026-08-24").map((c) => c.text);

  /**
   * The negative control. Without it the two tests below would pass for a week
   * that offers nothing at all — which is exactly how a filter bug hides.
   */
  it("still offers an unstruck flagged row and an unstruck action", () => {
    expect(texts(weekWith({}))).toEqual(["Book the room", "Chase the invoice"]);
  });

  it("does not offer a struck flagged row", () => {
    expect(texts(weekWith({ struck: true }))).not.toContain("Chase the invoice");
  });

  it("does not offer a struck weekly action", () => {
    expect(texts(weekWith({}, { struck: true }))).not.toContain("Book the room");
  });
});

/**
 * `flagged` and `origin` already never copy through a template, and `struck`
 * joins them: a template is a shape, and "I abandoned this" belongs to the week
 * it was decided in. `fillDay` rebuilds a row from a named field list so this
 * happens by default — which is why it needs pinning. An untested coincidence
 * is not a decision.
 */
describe("a template never copies struck", () => {
  it("lands the text without the strike", () => {
    const source = createEmptyWeek(MONDAY);
    source.days[0].subjects[0] = { subject: "Chase the invoice", checked: false, struck: true };
    const target = createEmptyWeek(new Date(2026, 7, 31));

    const filled = applyTemplate(target, source);

    expect(filled.days[0].subjects[0].subject).toBe("Chase the invoice");
    expect(filled.days[0].subjects[0].struck).toBeUndefined();
  });
});

describe("the strike control in the day view", () => {
  const dayWith = (struck?: boolean) => {
    const day = createEmptyDay(MONDAY);
    day.subjects[0] = { subject: "Chase the invoice", checked: false, ...(struck ? { struck: true } : {}) };
    return day;
  };
  const renderDay = (day: ReturnType<typeof dayWith>, onChange = vi.fn()) => {
    render(<DailyView day={day} dayIndex={0} onChange={onChange}
                     activeColor={1} onActiveColorChange={() => {}} />);
    return onChange;
  };

  it("offers a strike control with an accessible name", () => {
    renderDay(dayWith());

    expect(screen.getAllByRole("button", { name: "Strike out" }).length).toBeGreaterThan(0);
  });

  it("names the control Restore once the row is struck", () => {
    renderDay(dayWith(true));

    expect(screen.getAllByRole("button", { name: "Restore" }).length).toBeGreaterThan(0);
  });

  it("strikes the row out when pressed", () => {
    const onChange = renderDay(dayWith());

    fireEvent.click(screen.getAllByRole("button", { name: "Strike out" })[0]);

    expect(onChange.mock.calls[0][0].subjects[0].struck).toBe(true);
  });

  it("returns the row to its original state when pressed twice", () => {
    const onChange = renderDay(dayWith(true));

    fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[0]);

    expect(onChange.mock.calls[0][0].subjects[0].struck).toBe(false);
  });

  /**
   * The `{ ...s, [field]: value }` spread is the only thing carrying optional
   * fields through a keystroke. Rebuilding the row from named fields drops
   * `struck` with no type error, because strict is off — the same way colorId,
   * flagged and origin have been lost before.
   */
  it("keeps the strike when the row's text is edited", () => {
    const onChange = renderDay(dayWith(true));

    fireEvent.change(screen.getByDisplayValue("Chase the invoice"), {
      target: { value: "Chase the invoice again" },
    });

    expect(onChange.mock.calls[0][0].subjects[0].struck).toBe(true);
  });
});

describe("the strike control in the Weekly Actions sidebar", () => {
  const todos = (struck?: boolean) => [
    { text: "Book the room", checked: false, ...(struck ? { struck: true } : {}) },
  ];

  it("offers a strike control with an accessible name", () => {
    render(<WeeklyTodoSidebar todos={todos()} mondayISO="2026-08-24" onChange={vi.fn()} />);

    expect(screen.getAllByRole("button", { name: "Strike out" }).length).toBeGreaterThan(0);
  });

  it("strikes the action out when pressed", () => {
    const onChange = vi.fn();
    render(<WeeklyTodoSidebar todos={todos()} mondayISO="2026-08-24" onChange={onChange} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Strike out" })[0]);

    expect(onChange.mock.calls[0][0][0].struck).toBe(true);
  });
});

/**
 * The week's columns render the strike but cannot toggle it: a column is about
 * 160px carrying four controls at 9px type, and a fifth target would fall under
 * the 24px minimum the daily legend button was widened to meet.
 *
 * The assertion is on the class, not the computed style. This project pins jsdom
 * v20, whose cssstyle predates CSS Color 4 and drops values silently, so a style
 * assertion can pass vacuously.
 */
describe("the week column shows the strike without offering it", () => {
  const renderColumn = (struck: boolean) => {
    const day = createEmptyDay(MONDAY);
    day.subjects[0] = { subject: "Chase the invoice", checked: false, ...(struck ? { struck: true } : {}) };
    render(<DayColumn day={day} dayIndex={0} onChange={() => {}}
                      activeColor={1} onActiveColorChange={() => {}} />);
    return screen.getByDisplayValue("Chase the invoice");
  };

  it("strikes a struck row through", () => {
    expect(renderColumn(true).className).toContain("line-through");
  });

  it("leaves an unstruck row alone", () => {
    expect(renderColumn(false).className).not.toContain("line-through");
  });

  it("offers no strike control", () => {
    renderColumn(true);

    expect(screen.queryByRole("button", { name: "Strike out" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  });
});
