import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, act, fireEvent, screen } from "@testing-library/react";
import StudyPlanner from "@/components/planner/StudyPlanner";
import { getWeekKey } from "@/lib/planner-data";
import { addWeeks } from "date-fns";

/**
 * The autosave effect runs on mount, not only on edit, so simply opening a week
 * used to write it straight back. Combined with loadWeek's fallback that turned
 * any unreadable week into an empty one 300ms after it was viewed. Saving is now
 * gated on the user having actually changed something.
 */

const NOW = new Date(2026, 7, 26); // Wed 26 Aug 2026
const KEY = `planner-${getWeekKey(NOW)}`;
const NEXT_KEY = `planner-${getWeekKey(addWeeks(NOW, 1))}`;

/** Let the debounce elapse. */
const settle = async () => { await act(async () => { vi.advanceTimersByTime(400); }); };

const goalInput = () => screen.getByPlaceholderText("What do you want to achieve this week?");

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("the planner does not write a week it was only shown", () => {
  it("writes nothing to storage on mount", async () => {
    render(<StudyPlanner />);
    await settle();

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("leaves an unreadable week untouched when it is viewed", async () => {
    localStorage.setItem(KEY, "{ this is not json");

    render(<StudyPlanner />);
    await settle();

    expect(localStorage.getItem(KEY)).toBe("{ this is not json");
  });

  it("writes nothing to the week it navigates to", async () => {
    const { container } = render(<StudyPlanner />);
    const next = container.querySelectorAll("button")[1];

    await act(async () => { fireEvent.click(next); });
    await settle();

    expect(screen.getByText(/Aug 31/)).toBeTruthy(); // confirms the click navigated
    expect(localStorage.getItem(NEXT_KEY)).toBeNull();
  });

  it("does not carry one week's edit into the next week's key", async () => {
    const { container } = render(<StudyPlanner />);
    fireEvent.change(goalInput(), { target: { value: "Ship the thesis chapter" } });
    await settle();

    const next = container.querySelectorAll("button")[1];
    await act(async () => { fireEvent.click(next); });
    await settle();

    expect(localStorage.getItem(NEXT_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY)!).weekGoal).toBe("Ship the thesis chapter");
  });
});

describe("the planner still saves what the user changes", () => {
  it("saves an edited week goal", async () => {
    render(<StudyPlanner />);

    fireEvent.change(goalInput(), { target: { value: "Ship the thesis chapter" } });
    await settle();

    expect(JSON.parse(localStorage.getItem(KEY)!).weekGoal).toBe("Ship the thesis chapter");
  });

  it("saves an edit made after navigating to a different week", async () => {
    const { container } = render(<StudyPlanner />);
    const next = container.querySelectorAll("button")[1];
    await act(async () => { fireEvent.click(next); });

    fireEvent.change(goalInput(), { target: { value: "Next week's goal" } });
    await settle();

    expect(JSON.parse(localStorage.getItem(NEXT_KEY)!).weekGoal).toBe("Next week's goal");
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
