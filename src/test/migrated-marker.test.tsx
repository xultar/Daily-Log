import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import DailyView from "@/components/planner/DailyView";
import DayColumn from "@/components/planner/DayColumn";
import WeeklyTodoSidebar from "@/components/planner/WeeklyTodoSidebar";
import StudyPlanner from "@/components/planner/StudyPlanner";
import {
  createEmptyDay,
  createEmptyWeek,
  saveWeek,
  loadWeek,
  markMigrated,
} from "@/lib/planner-data";
import { startOfWeek, subWeeks } from "date-fns";
import { toast } from "@/hooks/use-toast";

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toasts: [] }) }));

/**
 * The Bullet Journal `>` signifier. Carry-forward copies and leaves the source
 * untouched, so a past week reads as having open tasks that were in fact
 * migrated — and it reads falser the more diligently the user migrates.
 *
 * Design: docs/superpowers/specs/2026-08-28-migrated-marker-design.md
 *
 * This is the first thing in the app that writes to a week other than the one
 * on screen, so most of what is tested here is the write.
 */

const SOURCE = new Date(2026, 7, 17); // Mon 17 Aug 2026
const SOURCE_ISO = "2026-08-17";
const DEST_ISO = "2026-08-24";

const sourceWeekWith = (over: Partial<Record<string, unknown>> = {}) => {
  const w = createEmptyWeek(SOURCE);
  w.weeklyTodos[0] = { text: "Book viva slot", checked: false, ...over };
  return w;
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("migratedTo survives storage", () => {
  it("round-trips on a weekly action", () => {
    const w = sourceWeekWith({ migratedTo: DEST_ISO });
    saveWeek(SOURCE, w);

    expect(loadWeek(SOURCE).weeklyTodos[0].migratedTo).toBe(DEST_ISO);
  });

  it("round-trips on a subject row", () => {
    const w = createEmptyWeek(SOURCE);
    w.days[0].subjects[0] = { subject: "Lab report", checked: false, migratedTo: DEST_ISO };
    saveWeek(SOURCE, w);

    expect(loadWeek(SOURCE).days[0].subjects[0].migratedTo).toBe(DEST_ISO);
  });

  /** As origin: anything that is not a real date degrades to no marker. */
  it.each(["not-a-date", "2026-13-40", 20260824, true, null])(
    "drops a migratedTo of %p and still loads the item",
    (bad) => {
      const w = sourceWeekWith({ migratedTo: bad });
      saveWeek(SOURCE, w);

      const back = loadWeek(SOURCE).weeklyTodos[0];
      expect(back.migratedTo).toBeUndefined();
      expect(back.text).toBe("Book viva slot");
    }
  );
});

describe("markMigrated writes the source week", () => {
  const chosen = [{ text: "Book viva slot", origin: SOURCE_ISO }];

  it("marks a matching weekly action", () => {
    saveWeek(SOURCE, sourceWeekWith());

    markMigrated(SOURCE_ISO, DEST_ISO, chosen);

    expect(loadWeek(SOURCE).weeklyTodos[0].migratedTo).toBe(DEST_ISO);
  });

  it("marks a matching flagged daily row", () => {
    const w = createEmptyWeek(SOURCE);
    w.days[2].subjects[0] = { subject: "Book viva slot", checked: false, flagged: true };
    saveWeek(SOURCE, w);

    markMigrated(SOURCE_ISO, DEST_ISO, chosen);

    expect(loadWeek(SOURCE).days[2].subjects[0].migratedTo).toBe(DEST_ISO);
  });

  /**
   * collectCarryForward dedupes by text, so one commitment held in both places
   * arrives as a single candidate. Both copies moved on, so both are marked.
   */
  it("marks both copies when the text is an action and a flagged row", () => {
    const w = sourceWeekWith();
    w.days[1].subjects[0] = { subject: "Book viva slot", checked: false, flagged: true };
    saveWeek(SOURCE, w);

    markMigrated(SOURCE_ISO, DEST_ISO, chosen);

    const back = loadWeek(SOURCE);
    expect(back.weeklyTodos[0].migratedTo).toBe(DEST_ISO);
    expect(back.days[1].subjects[0].migratedTo).toBe(DEST_ISO);
  });

  /**
   * The negative case. Without it a marker that stamps every item passes every
   * test above.
   */
  it("leaves an item that was not chosen unmarked", () => {
    const w = sourceWeekWith();
    w.weeklyTodos[1] = { text: "Email supervisor", checked: false };
    saveWeek(SOURCE, w);

    markMigrated(SOURCE_ISO, DEST_ISO, chosen);

    expect(loadWeek(SOURCE).weeklyTodos[1].migratedTo).toBeUndefined();
  });

  it("marks nothing when nothing was chosen", () => {
    saveWeek(SOURCE, sourceWeekWith());

    markMigrated(SOURCE_ISO, DEST_ISO, []);

    expect(loadWeek(SOURCE).weeklyTodos[0].migratedTo).toBeUndefined();
  });

  /**
   * The marker must mark exactly what collectCarryForward would have offered.
   * A checked or struck item never carries, so a same-text one is a different
   * item that happens to read alike.
   */
  it("does not mark a checked item of the same text", () => {
    saveWeek(SOURCE, sourceWeekWith({ checked: true }));

    markMigrated(SOURCE_ISO, DEST_ISO, chosen);

    expect(loadWeek(SOURCE).weeklyTodos[0].migratedTo).toBeUndefined();
  });

  it("does not mark a struck item of the same text", () => {
    saveWeek(SOURCE, sourceWeekWith({ struck: true }));

    markMigrated(SOURCE_ISO, DEST_ISO, chosen);

    expect(loadWeek(SOURCE).weeklyTodos[0].migratedTo).toBeUndefined();
  });

  it("does not mark an unflagged daily row of the same text", () => {
    const w = createEmptyWeek(SOURCE);
    w.days[0].subjects[0] = { subject: "Book viva slot", checked: false };
    saveWeek(SOURCE, w);

    markMigrated(SOURCE_ISO, DEST_ISO, chosen);

    expect(loadWeek(SOURCE).days[0].subjects[0].migratedTo).toBeUndefined();
  });

  /**
   * Taking only the Monday is what makes a stale snapshot impossible: there is
   * no week object to hold on to. An edit made after the bar was built must
   * survive the mark rather than being reverted by a minutes-old copy.
   */
  it("reads the source week fresh rather than writing back a snapshot", () => {
    saveWeek(SOURCE, sourceWeekWith());
    const edited = sourceWeekWith();
    edited.weekGoal = "Edited after the scan";
    saveWeek(SOURCE, edited);

    markMigrated(SOURCE_ISO, DEST_ISO, chosen);

    const back = loadWeek(SOURCE);
    expect(back.weekGoal).toBe("Edited after the scan");
    expect(back.weeklyTodos[0].migratedTo).toBe(DEST_ISO);
  });

  it("writes nothing when the source week is not in storage", () => {
    expect(markMigrated(SOURCE_ISO, DEST_ISO, chosen)).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it("touches no week but the source", () => {
    saveWeek(SOURCE, sourceWeekWith());
    const dest = createEmptyWeek(new Date(2026, 7, 24));
    dest.weekGoal = "This week";
    saveWeek(new Date(2026, 7, 24), dest);

    markMigrated(SOURCE_ISO, DEST_ISO, chosen);

    expect(loadWeek(new Date(2026, 7, 24))).toEqual(dest);
  });
});

const NOW = new Date(2026, 7, 26); // Wed 26 Aug 2026
const thisMonday = () => startOfWeek(NOW, { weekStartsOn: 1 });
const settle = async () => { await act(async () => { vi.advanceTimersByTime(400); }); };

describe("bringing work forward marks where it came from", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  const seedLastWeek = () => {
    const last = subWeeks(thisMonday(), 1);
    const w = createEmptyWeek(last);
    w.weeklyTodos[0] = { text: "Book viva slot", checked: false };
    saveWeek(last, w);
    return last;
  };

  it("stamps the source item with the week it went to", async () => {
    const last = seedLastWeek();
    render(<StudyPlanner />);

    fireEvent.click(screen.getByRole("button", { name: /bring/i }));
    await settle();

    expect(loadWeek(last).weeklyTodos[0].migratedTo).toBe("2026-08-24");
  });

  /**
   * Found by a surviving mutation. Skip goes through dismissCarry, so it never
   * reaches the marker at all — what the empty-chosen guard actually protects
   * is this: unticking everything and pressing Bring must not report a failure,
   * because nothing was asked for and nothing failed.
   */
  it("says nothing when the user unticks everything and brings nothing", async () => {
    seedLastWeek();
    render(<StudyPlanner />);
    vi.mocked(toast).mockClear();

    screen.getAllByRole("checkbox").forEach((b) => fireEvent.click(b));
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));
    await settle();

    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it("marks nothing when the user skips", async () => {
    const last = seedLastWeek();
    render(<StudyPlanner />);

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await settle();

    expect(loadWeek(last).weeklyTodos[0].migratedTo).toBeUndefined();
  });

  it("marks nothing for an item the user unticked", async () => {
    const last = subWeeks(thisMonday(), 1);
    const w = createEmptyWeek(last);
    w.weeklyTodos[0] = { text: "Book viva slot", checked: false };
    w.weeklyTodos[1] = { text: "Email supervisor", checked: false };
    saveWeek(last, w);
    render(<StudyPlanner />);

    // The age phrase is part of the accessible name: collectCarryForward stamps
    // an origin, so every candidate is at least a week old by the time it shows.
    fireEvent.click(screen.getByRole("checkbox", { name: "Email supervisor carried 1 week" }));
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));
    await settle();

    const back = loadWeek(last);
    expect(back.weeklyTodos[0].migratedTo).toBe("2026-08-24");
    expect(back.weeklyTodos[1].migratedTo).toBeUndefined();
  });
});

describe("a migrated item says so", () => {
  const dayWith = (migratedTo?: string, struck?: boolean) => {
    const day = createEmptyDay(SOURCE);
    day.subjects[0] = {
      subject: "Book viva slot",
      checked: false,
      ...(migratedTo ? { migratedTo } : {}),
      ...(struck ? { struck: true } : {}),
    };
    return day;
  };

  it("shows the marker in the day view", () => {
    render(<DailyView day={dayWith(DEST_ISO)} dayIndex={0} onChange={() => {}}
                      activeColor={1} onActiveColorChange={() => {}} />);

    expect(screen.getByText("migrated to 24 August")).toBeInTheDocument();
  });

  it("shows the marker in a week column", () => {
    render(<DayColumn day={dayWith(DEST_ISO)} dayIndex={0} onChange={() => {}}
                      activeColor={1} onActiveColorChange={() => {}} />);

    expect(screen.getByText("migrated to 24 August")).toBeInTheDocument();
  });

  it("shows the marker in the Weekly Actions sidebar", () => {
    render(<WeeklyTodoSidebar todos={[{ text: "Book viva slot", checked: false, migratedTo: DEST_ISO }]}
                              mondayISO={SOURCE_ISO} onChange={vi.fn()} />);

    expect(screen.getByText("migrated to 24 August")).toBeInTheDocument();
  });

  it("says nothing for an item that never moved", () => {
    render(<DailyView day={dayWith()} dayIndex={0} onChange={() => {}}
                      activeColor={1} onActiveColorChange={() => {}} />);

    expect(screen.queryByText(/migrated to/)).toBeNull();
  });

  /**
   * Struck and migrated are opposite outcomes — abandoned versus moved on — so
   * they use different channels and both stay legible when a row carries both.
   */
  it("shows both when a row was migrated and later struck out", () => {
    render(<DailyView day={dayWith(DEST_ISO, true)} dayIndex={0} onChange={() => {}}
                      activeColor={1} onActiveColorChange={() => {}} />);

    expect(screen.getByText("migrated to 24 August")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Book viva slot").className).toContain("line-through");
  });

  /** The glyph is decorative; the phrase beside it is what is announced. */
  it("hides the glyph from screen readers", () => {
    const { container } = render(
      <DailyView day={dayWith(DEST_ISO)} dayIndex={0} onChange={() => {}}
                 activeColor={1} onActiveColorChange={() => {}} />
    );

    const hidden = [...container.querySelectorAll('[aria-hidden="true"]')].map((e) => e.textContent);
    expect(hidden).toContain("›");
  });
});
