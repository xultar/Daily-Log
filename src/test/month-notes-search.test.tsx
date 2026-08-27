import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SearchDialog from "@/components/planner/SearchDialog";
import StudyPlanner from "@/components/planner/StudyPlanner";
import { createEmptyWeek } from "@/lib/planner-data";

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toasts: [] }) }));
import { saveMonthNote } from "@/lib/month-notes";
import { searchAll, searchMonthNotes } from "@/lib/search";

/**
 * A month note has no week key and no Monday, so it cannot ride the shape a
 * week match uses. The union is what keeps the two apart, and the sort key is
 * what stops a month note filing itself outside its own month.
 */

const AUG = new Date(2026, 7, 26); // Wed 26 Aug 2026, week 2026-W35

function storeWeekWithGoal(key: string, date: Date, goal: string) {
  const week = createEmptyWeek(date);
  week.weekGoal = goal;
  localStorage.setItem(`planner-${key}`, JSON.stringify(week));
}

beforeEach(() => localStorage.clear());

describe("searchMonthNotes", () => {
  it("finds a query in a stored note and says which month", () => {
    saveMonthNote("2026-08", "Teaching ate the month.");

    const [match] = searchMonthNotes("teaching");

    expect(match.kind).toBe("month");
    expect(match.monthKey).toBe("2026-08");
    expect(match.field).toBe("month");
  });

  it("carries the surrounding text, as a week match does", () => {
    saveMonthNote("2026-08", "The thing that went wrong was the Friday supervision slot.");

    expect(searchMonthNotes("Friday")[0].snippet).toContain("Friday");
  });

  it("keeps the two-character minimum", () => {
    saveMonthNote("2026-08", "Teaching ate the month.");

    expect(searchMonthNotes("T")).toEqual([]);
    expect(searchMonthNotes("Te")).toHaveLength(1);
  });

  it("is case-insensitive, as the week search is", () => {
    saveMonthNote("2026-08", "Teaching ate the month.");

    expect(searchMonthNotes("TEACHING")).toHaveLength(1);
  });
});

describe("searchAll", () => {
  it("returns both kinds, each narrowable on kind alone", () => {
    storeWeekWithGoal("2026-W35", AUG, "Finish the chapter");
    saveMonthNote("2026-08", "Finish the chapter, really");

    const kinds = searchAll("Finish the chapter")
      .map((m) => m.kind)
      .sort();

    expect(kinds).toEqual(["month", "week"]);
  });

  it("sorts newest first, with a month note among the weeks of its own month", () => {
    // July week, August note, September week. The August note must land between
    // them, not at either end.
    storeWeekWithGoal("2026-W29", new Date(2026, 6, 15), "repeat");
    storeWeekWithGoal("2026-W38", new Date(2026, 8, 16), "repeat");
    saveMonthNote("2026-08", "repeat");

    const order = searchAll("repeat").map((m) => (m.kind === "week" ? m.weekKey : m.monthKey));

    expect(order).toEqual(["2026-W38", "2026-08", "2026-W29"]);
  });

  it("gives a month match no Monday and a week match no month key", () => {
    storeWeekWithGoal("2026-W35", AUG, "repeat");
    saveMonthNote("2026-08", "repeat");

    for (const match of searchAll("repeat")) {
      if (match.kind === "week") expect(match.monday).toBe("2026-08-24");
      else expect(match.monthKey).toBe("2026-08");
    }
    expect(searchAll("repeat")).toHaveLength(2);
  });
});

afterEach(cleanup);

const openDialog = () => {
  const onJump = vi.fn();
  const onJumpToMonth = vi.fn();
  render(<SearchDialog onJump={onJump} onJumpToMonth={onJumpToMonth} />);
  fireEvent.click(screen.getByRole("button", { name: /search all weeks/i }));
  return { onJump, onJumpToMonth };
};

const typeQuery = (value: string) =>
  fireEvent.change(screen.getByRole("textbox", { name: /search all weeks/i }), {
    target: { value },
  });

describe("a month note in the search dialog", () => {
  it("names the month and the field it came from", () => {
    saveMonthNote("2026-08", "Teaching ate the month.");
    openDialog();

    typeQuery("Teaching");

    expect(screen.getByText(/August 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Month notes/)).toBeInTheDocument();
  });

  it("opens the month, not a week", () => {
    saveMonthNote("2026-08", "Teaching ate the month.");
    const { onJump, onJumpToMonth } = openDialog();

    typeQuery("Teaching");
    fireEvent.click(screen.getByText("Teaching ate the month."));

    expect(onJumpToMonth).toHaveBeenCalledWith("2026-08");
    expect(onJump).not.toHaveBeenCalled();
  });

  it("still opens a week for a week result", () => {
    storeWeekWithGoal("2026-W35", AUG, "Finish the chapter");
    const { onJump, onJumpToMonth } = openDialog();

    typeQuery("Finish the chapter");
    fireEvent.click(screen.getByText("Finish the chapter"));

    expect(onJump).toHaveBeenCalledWith("2026-08-24");
    expect(onJumpToMonth).not.toHaveBeenCalled();
  });
});

// No ThemeProvider: autosave.test.tsx renders <StudyPlanner /> bare, because
// theme-context gives createContext a real default rather than throwing.
describe("clicking a month result in the app", () => {
  it("switches to the month view and lands on that month", () => {
    saveMonthNote("2026-08", "Teaching ate the month.");
    render(<StudyPlanner />);

    fireEvent.click(screen.getByRole("button", { name: /search all weeks/i }));
    typeQuery("Teaching");
    fireEvent.click(screen.getByText("Teaching ate the month."));

    // The notes field, not the month heading. It proves both halves at once —
    // only the month view renders it, and its label names the month — where a
    // heading assertion would pass on the right view showing the wrong month.
    expect(
      screen.getByRole("textbox", { name: "Notes and reflections for August 2026" })
    ).toBeInTheDocument();
  });
});
