import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import CarryForwardBar from "@/components/planner/CarryForwardBar";
import { CarryCandidate, saveWeek, createEmptyWeek, loadWeek } from "@/lib/planner-data";
import { startOfWeek, subWeeks, addWeeks } from "date-fns";
import StudyPlanner from "@/components/planner/StudyPlanner";

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
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
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

const NOW = new Date(2026, 7, 26); // Wed 26 Aug 2026
const thisMonday = () => startOfWeek(NOW, { weekStartsOn: 1 });

/** Let the debounce elapse, matching autosave.test.tsx. */
const settle = async () => { await act(async () => { vi.advanceTimersByTime(400); }); };

function seedLastWeekWithUnfinishedWork() {
  const last = subWeeks(thisMonday(), 1);
  const w = createEmptyWeek(last);
  w.weeklyTodos[0] = { text: "Book viva slot", checked: false };
  saveWeek(last, w);
}

/**
 * Only the week entries. StudyPlanner writes planner-show-weekends from an
 * effect on mount, so snapshotting the whole of localStorage would fail on a
 * write this test does not care about.
 */
const weekEntries = () =>
  JSON.stringify(
    Object.keys(localStorage)
      .filter((k) => /^planner-\d{4}-W\d{2}$/.test(k))
      .sort()
      .map((k) => [k, localStorage.getItem(k)])
  );

describe("StudyPlanner carry-forward", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("offers the bar when last week left work unfinished", () => {
    seedLastWeekWithUnfinishedWork();
    render(<StudyPlanner />);
    expect(screen.getByText(/unfinished from last week/)).toBeInTheDocument();
  });

  it("stays silent when there is nothing behind this week", () => {
    render(<StudyPlanner />);
    expect(screen.queryByText(/unfinished from last week/)).toBeNull();
  });

  it("stays silent when last week finished everything", () => {
    const last = subWeeks(thisMonday(), 1);
    const w = createEmptyWeek(last);
    w.weeklyTodos[0] = { text: "Book viva slot", checked: true };
    saveWeek(last, w);
    render(<StudyPlanner />);
    expect(screen.queryByText(/unfinished from last week/)).toBeNull();
  });

  it("writes to no week merely by opening one that has candidates", async () => {
    // The dirtyRef guarantee. The autosave effect runs on mount, not only on
    // edit, and opening a week used to write it straight back. Settling the
    // debounce is the point: without it this would pass vacuously.
    seedLastWeekWithUnfinishedWork();
    const before = weekEntries();
    render(<StudyPlanner />);
    // Assert the bar is actually up: without this the test passes with no bar
    // on screen at all, which is the one test you least want self-disabling.
    expect(screen.getByText(/unfinished from last week/)).toBeInTheDocument();
    await settle();
    expect(weekEntries()).toBe(before);
  });

  it("carries into the week on screen, not the week the planner opened on", async () => {
    // bringForward is a useCallback with a stable dep, so it is created once at
    // mount. Closing over weekData instead of using the updater form would
    // capture the mount-time week forever, and pressing Bring on another week
    // would write this week's contents under that week's key. Every other carry
    // test acts on the mount week, so the closure is accidentally correct
    // throughout the suite and nothing else would notice.
    seedLastWeekWithUnfinishedWork();
    const nextMonday = addWeeks(thisMonday(), 1);
    const next = createEmptyWeek(nextMonday);
    next.weekGoal = "Next week's own goal";
    next.weeklyTodos[0] = { text: "Already planned for next week", checked: false };
    saveWeek(nextMonday, next);

    const { container } = render(<StudyPlanner />);
    fireEvent.click(container.querySelectorAll("button")[1]); // next week
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));
    await settle();

    const written = loadWeek(nextMonday);
    expect(written.weekGoal).toBe("Next week's own goal");
    expect(written.weeklyTodos.map((t) => t.text)).toContain("Already planned for next week");
    expect(written.weeklyTodos.map((t) => t.text)).toContain("Book viva slot");
  });

  it("brings the ticked items into this week and marks the week resolved", async () => {
    seedLastWeekWithUnfinishedWork();
    render(<StudyPlanner />);
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));
    await settle();
    const now = loadWeek(thisMonday());
    expect(now.weeklyTodos[0].text).toBe("Book viva slot");
    expect(now.weeklyTodos[0].origin).toBe("2026-08-17");
    expect(now.carryResolved).toBe(true);
  });

  it("leaves last week untouched, because carrying copies", async () => {
    seedLastWeekWithUnfinishedWork();
    render(<StudyPlanner />);
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));
    await settle();
    const last = loadWeek(subWeeks(thisMonday(), 1));
    expect(last.weeklyTodos[0]).toEqual({ text: "Book viva slot", checked: false });
  });

  it("dismissing marks the week resolved and adds nothing", async () => {
    seedLastWeekWithUnfinishedWork();
    render(<StudyPlanner />);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    await settle();
    const now = loadWeek(thisMonday());
    expect(now.carryResolved).toBe(true);
    expect(now.weeklyTodos.every((t) => t.text === "")).toBe(true);
  });

  it("does not offer the bar again once the week is resolved", () => {
    seedLastWeekWithUnfinishedWork();
    const now = createEmptyWeek(thisMonday());
    now.carryResolved = true;
    saveWeek(thisMonday(), now);
    render(<StudyPlanner />);
    expect(screen.queryByText(/unfinished from last week/)).toBeNull();
  });

  it("does not offer the bar on a past week", () => {
    seedLastWeekWithUnfinishedWork();
    const { container } = render(<StudyPlanner />);
    // Two chevrons lead the toolbar; [0] is "previous".
    fireEvent.click(container.querySelectorAll("button")[0]);
    fireEvent.click(container.querySelectorAll("button")[0]);
    expect(screen.queryByText(/unfinished from last week/)).toBeNull();
  });

  it("does not offer the bar on a past week even when there is work behind it", () => {
    // The two-weeks-back test above is green for the wrong reason: from there,
    // findCarrySource's backward scan never reaches the seeded week, so it
    // would pass with the isCurrentOrFutureWeek guard deleted. This puts the
    // work exactly one week behind the week being viewed, so only the guard
    // can hide the bar.
    const twoBack = subWeeks(thisMonday(), 2);
    const w = createEmptyWeek(twoBack);
    w.weeklyTodos[0] = { text: "Older unfinished work", checked: false };
    saveWeek(twoBack, w);
    const { container } = render(<StudyPlanner />);
    fireEvent.click(container.querySelectorAll("button")[0]); // back one week
    expect(screen.queryByText(/unfinished from last week/)).toBeNull();
  });

  it("resets the tick state when navigating to a week with its own candidates", async () => {
    // Without the remount key, unticking a row here would stay glued to
    // position 0 when the bar's candidates prop changes underneath it for the
    // next week, rather than resetting to the fresh-review default of
    // "everything ticked".
    seedLastWeekWithUnfinishedWork(); // gives this week a candidate: "Book viva slot"
    const current = createEmptyWeek(thisMonday());
    // This week's own unfinished item becomes next week's candidate.
    current.weeklyTodos[0] = { text: "Draft methods", checked: false };
    saveWeek(thisMonday(), current);

    const { container } = render(<StudyPlanner />);
    // Scoped to the bar's own group: WeeklyTodoSidebar renders checkboxes too.
    const firstGroup = screen.getByRole("group", { name: /unfinished from last week/ });
    // Untick the only candidate in this week's bar, without pressing Bring.
    fireEvent.click(within(firstGroup).getByRole("checkbox"));
    fireEvent.click(container.querySelectorAll("button")[1]); // next week
    await settle();

    expect(screen.getByText("Draft methods")).toBeInTheDocument();
    const nextGroup = screen.getByRole("group", { name: /unfinished from last week/ });
    const boxes = within(nextGroup).getAllByRole("checkbox");
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
  });

  it("hides the bar in the month view", () => {
    seedLastWeekWithUnfinishedWork();
    render(<StudyPlanner />);
    fireEvent.click(screen.getByRole("button", { name: /month/i }));
    expect(screen.queryByText(/unfinished from last week/)).toBeNull();
  });

  it("hides the bar in the day view, where the items would land off screen", () => {
    // The Weekly Actions sidebar is not rendered in the day view, so pressing
    // Bring there would make the bar vanish with nothing visibly happening —
    // and carryResolved would then stop it reappearing in the week view.
    seedLastWeekWithUnfinishedWork();
    render(<StudyPlanner />);
    fireEvent.click(screen.getByRole("button", { name: /^day$/i }));
    expect(screen.queryByText(/unfinished from last week/)).toBeNull();
  });
});
