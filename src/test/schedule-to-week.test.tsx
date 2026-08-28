import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import DailyView from "@/components/planner/DailyView";
import DayColumn from "@/components/planner/DayColumn";
import WeeklyTodoSidebar from "@/components/planner/WeeklyTodoSidebar";
import { createEmptyDay, createEmptyWeek, saveWeek, loadWeek, hasStoredWeek } from "@/lib/planner-data";
import { scheduleToWeek } from "@/lib/carry";

/**
 * The Bullet Journal `<` bullet. Carry-forward answers "not this week, next
 * week" and has nothing for "not for a month", so those tasks are migrated over
 * and over or leave the planner entirely.
 *
 * Design: docs/superpowers/specs/2026-08-28-schedule-to-week-design.md
 */

const VIEWED = new Date(2026, 7, 24); // Mon 24 Aug 2026
const VIEWED_ISO = "2026-08-24";
const TARGET = new Date(2026, 8, 21); // Mon 21 Sep 2026, four weeks on
const TARGET_ISO = "2026-09-21";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("scheduleToWeek writes the destination week", () => {
  it("puts the item in that week's Weekly Actions", () => {
    scheduleToWeek(TARGET_ISO, "Book the venue");

    expect(loadWeek(TARGET).weeklyTodos.map((t) => t.text)).toContain("Book the venue");
  });

  /**
   * Most future weeks have never been opened. This is the first thing that
   * brings a week into existence without the user visiting it.
   */
  it("creates a destination week that did not exist", () => {
    expect(hasStoredWeek(TARGET)).toBe(false);

    scheduleToWeek(TARGET_ISO, "Book the venue");

    expect(hasStoredWeek(TARGET)).toBe(true);
    expect(loadWeek(TARGET).days).toHaveLength(7);
  });

  it("leaves an existing destination week's work alone", () => {
    const existing = createEmptyWeek(TARGET);
    existing.weekGoal = "Conference week";
    existing.weeklyTodos[0] = { text: "Print posters", checked: false };
    saveWeek(TARGET, existing);

    scheduleToWeek(TARGET_ISO, "Book the venue");

    const back = loadWeek(TARGET);
    expect(back.weekGoal).toBe("Conference week");
    expect(back.weeklyTodos.map((t) => t.text)).toContain("Print posters");
    expect(back.weeklyTodos.map((t) => t.text)).toContain("Book the venue");
  });

  /**
   * `origin` means slippage and drives the age marker. An item deliberately
   * placed four weeks out has not slipped four times, and stamping one would
   * make the escalation lie in the place the user is most likely to trust it.
   */
  it("lands the item with no origin, so it shows no age on arrival", () => {
    scheduleToWeek(TARGET_ISO, "Book the venue");

    const landed = loadWeek(TARGET).weeklyTodos.find((t) => t.text === "Book the venue");
    expect(landed!.origin).toBeUndefined();
  });

  it("does not add the same text twice", () => {
    scheduleToWeek(TARGET_ISO, "Book the venue");
    scheduleToWeek(TARGET_ISO, "Book the venue");

    const hits = loadWeek(TARGET).weeklyTodos.filter((t) => t.text === "Book the venue");
    expect(hits).toHaveLength(1);
  });

  it("refuses a blank item", () => {
    expect(scheduleToWeek(TARGET_ISO, "   ")).toBe(false);
    expect(hasStoredWeek(TARGET)).toBe(false);
  });

  it("reports a refused write rather than claiming success", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });

    expect(scheduleToWeek(TARGET_ISO, "Book the venue")).toBe(false);
  });

  it("touches no week but the destination", () => {
    const viewed = createEmptyWeek(VIEWED);
    viewed.weekGoal = "This week";
    saveWeek(VIEWED, viewed);

    scheduleToWeek(TARGET_ISO, "Book the venue");

    expect(loadWeek(VIEWED)).toEqual(viewed);
  });
});

const openMenuFor = (text: string) => {
  const row = screen.getByDisplayValue(text).closest("div")!;
  const trigger = [...row.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === "Schedule for a later week"
  )!;
  // Opened by keyboard rather than pointer: jsdom has no PointerEvent, so
  // Radix's pointerdown handler never sees a button of 0 and the menu stays
  // shut. Enter is a real path a user has anyway.
  fireEvent.keyDown(trigger, { key: "Enter" });
  return trigger;
};

describe("scheduling from a day-view row", () => {
  const dayWith = (subject: string, extra: Record<string, unknown> = {}) => {
    const day = createEmptyDay(VIEWED);
    day.subjects[0] = { subject, checked: false, ...extra };
    return day;
  };

  const renderDay = (subject: string, extra: Record<string, unknown> = {}) => {
    const onChange = vi.fn();
    render(
      <DailyView day={dayWith(subject, extra)} dayIndex={0} onChange={onChange}
                 activeColor={1} onActiveColorChange={() => {}} />
    );
    return onChange;
  };

  it("offers the control on a row with text", () => {
    renderDay("Book the venue");

    expect(screen.getAllByRole("button", { name: "Schedule for a later week" }).length)
      .toBeGreaterThan(0);
  });

  it("offers nothing on a blank row", () => {
    render(
      <DailyView day={createEmptyDay(VIEWED)} dayIndex={0} onChange={vi.fn()}
                 activeColor={1} onActiveColorChange={() => {}} />
    );

    expect(screen.queryByRole("button", { name: "Schedule for a later week" })).toBeNull();
  });

  it("offers only weeks after the one being viewed", () => {
    renderDay("Book the venue");

    openMenuFor("Book the venue");

    for (const label of ["Next week", "In 2 weeks", "In 4 weeks", "In 8 weeks"]) {
      expect(screen.getByRole("menuitem", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("writes the item into the chosen week", () => {
    renderDay("Book the venue");
    openMenuFor("Book the venue");

    fireEvent.click(screen.getByRole("menuitem", { name: /In 4 weeks/ }));

    expect(loadWeek(TARGET).weeklyTodos.map((t) => t.text)).toContain("Book the venue");
  });

  it("marks the origin row with where it went", () => {
    const onChange = renderDay("Book the venue");
    openMenuFor("Book the venue");

    fireEvent.click(screen.getByRole("menuitem", { name: /In 4 weeks/ }));

    expect(onChange.mock.calls[0][0].subjects[0].migratedTo).toBe(TARGET_ISO);
  });

  /**
   * markMigrated marks only flagged rows, because it serves a bulk carry where
   * the rows are unknown. Here the component knows exactly which item the user
   * pointed at, so an unflagged row must schedule and be marked.
   */
  it("marks an unflagged row too", () => {
    const onChange = renderDay("Book the venue");
    openMenuFor("Book the venue");

    fireEvent.click(screen.getByRole("menuitem", { name: /Next week/ }));

    expect(onChange.mock.calls[0][0].subjects[0].flagged).toBeUndefined();
    expect(onChange.mock.calls[0][0].subjects[0].migratedTo).toBe("2026-08-31");
  });

  /**
   * Destination first, origin second. Marking first would leave the week saying
   * an item went somewhere it never arrived.
   */
  it("leaves the origin unmarked when the destination write is refused", () => {
    const onChange = renderDay("Book the venue");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });
    openMenuFor("Book the venue");

    fireEvent.click(screen.getByRole("menuitem", { name: /In 4 weeks/ }));

    expect(onChange).not.toHaveBeenCalled();
  });

  /**
   * The same spread trap on the scheduling path rather than the typing one.
   * markScheduled rebuilds the row too, and a row carrying a tag, a flag or a
   * strike would lose them the moment it was scheduled — with no type error,
   * because strict is off. Found by a surviving mutation.
   */
  it("keeps the row's other fields when it is scheduled", () => {
    const onChange = renderDay("Book the venue", { colorId: 3, flagged: true, struck: true });
    openMenuFor("Book the venue");

    fireEvent.click(screen.getByRole("menuitem", { name: /In 4 weeks/ }));

    expect(onChange.mock.calls[0][0].subjects[0]).toEqual({
      subject: "Book the venue",
      checked: false,
      colorId: 3,
      flagged: true,
      struck: true,
      migratedTo: TARGET_ISO,
    });
  });

  /** The spread trap that already loses colorId, flagged, origin and struck. */
  it("keeps the marker when the row's text is edited afterwards", () => {
    const onChange = renderDay("Book the venue", { migratedTo: TARGET_ISO });

    fireEvent.change(screen.getByDisplayValue("Book the venue"), {
      target: { value: "Book the venue early" },
    });

    expect(onChange.mock.calls[0][0].subjects[0].migratedTo).toBe(TARGET_ISO);
  });
});

describe("scheduling from the Weekly Actions sidebar", () => {
  it("writes the item and marks the origin", () => {
    const onChange = vi.fn();
    render(
      <WeeklyTodoSidebar todos={[{ text: "Book the venue", checked: false }]}
                         mondayISO={VIEWED_ISO} onChange={onChange} />
    );

    openMenuFor("Book the venue");
    fireEvent.click(screen.getByRole("menuitem", { name: /In 4 weeks/ }));

    expect(loadWeek(TARGET).weeklyTodos.map((t) => t.text)).toContain("Book the venue");
    expect(onChange.mock.calls[0][0][0].migratedTo).toBe(TARGET_ISO);
  });

  /** As the day view: the todo's other optional fields must survive the mark. */
  it("keeps the todo's other fields when it is scheduled", () => {
    const onChange = vi.fn();
    render(
      <WeeklyTodoSidebar
        todos={[{ text: "Book the venue", checked: false, origin: "2026-08-10", struck: true }]}
        mondayISO={VIEWED_ISO}
        onChange={onChange}
      />
    );

    openMenuFor("Book the venue");
    fireEvent.click(screen.getByRole("menuitem", { name: /In 4 weeks/ }));

    expect(onChange.mock.calls[0][0][0]).toEqual({
      text: "Book the venue",
      checked: false,
      origin: "2026-08-10",
      struck: true,
      migratedTo: TARGET_ISO,
    });
  });
});

describe("the week's columns offer no scheduling", () => {
  it("has no control, because those rows are 20px with 12px controls", () => {
    const day = createEmptyDay(VIEWED);
    day.subjects[0] = { subject: "Book the venue", checked: false };
    render(<DayColumn day={day} dayIndex={0} onChange={() => {}}
                      activeColor={1} onActiveColorChange={() => {}} />);

    expect(screen.queryByRole("button", { name: "Schedule for a later week" })).toBeNull();
  });
});
