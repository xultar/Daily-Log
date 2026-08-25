import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, act, fireEvent, screen } from "@testing-library/react";
import StudyPlanner from "@/components/planner/StudyPlanner";
import { getWeekKey } from "@/lib/planner-data";
import { addWeeks } from "date-fns";

/**
 * Saving is debounced by 300ms. Anything that ends the debounce early has to
 * write what is waiting, not drop it.
 *
 * Leaving a week used to drop it. On a currentDate change React runs the save
 * effect's cleanup — which clears the pending timer — before the load effect
 * runs, and the load effect then clears the dirty flag, so nothing rescheduled
 * it. An edit made within 300ms of clicking to the next week was simply gone.
 */

const NOW = new Date(2026, 7, 26); // Wed 26 Aug 2026
const KEY = `planner-${getWeekKey(NOW)}`;
const NEXT_KEY = `planner-${getWeekKey(addWeeks(NOW, 1))}`;

const goal = () => screen.getByPlaceholderText("What do you want to achieve this week?");
const nextWeek = (container: HTMLElement) => container.querySelectorAll("button")[1];
const settle = async () => { await act(async () => { vi.advanceTimersByTime(400); }); };
/** Less than the 300ms debounce: the pending write has not fired on its own. */
const tickWithinDebounce = async () => { await act(async () => { vi.advanceTimersByTime(100); }); };

const storedGoal = (key: string) => {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw).weekGoal : null;
};

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("an edit still waiting to be written is not lost", () => {
  it("keeps it when the user moves to another week", async () => {
    const { container } = render(<StudyPlanner />);

    fireEvent.change(goal(), { target: { value: "Ship the thesis chapter" } });
    await tickWithinDebounce();
    await act(async () => { fireEvent.click(nextWeek(container)); });
    await settle();

    expect(storedGoal(KEY)).toBe("Ship the thesis chapter");
  });

  it("writes it under the week it belongs to, not the week arrived at", async () => {
    const { container } = render(<StudyPlanner />);

    fireEvent.change(goal(), { target: { value: "Ship the thesis chapter" } });
    await tickWithinDebounce();
    await act(async () => { fireEvent.click(nextWeek(container)); });
    await settle();

    expect(localStorage.getItem(NEXT_KEY)).toBeNull();
  });

  it("keeps it when the planner goes away", async () => {
    const { unmount } = render(<StudyPlanner />);

    fireEvent.change(goal(), { target: { value: "Ship the thesis chapter" } });
    await tickWithinDebounce();
    unmount();

    expect(storedGoal(KEY)).toBe("Ship the thesis chapter");
  });

  it("keeps it when the page is being closed", async () => {
    render(<StudyPlanner />);

    fireEvent.change(goal(), { target: { value: "Ship the thesis chapter" } });
    await tickWithinDebounce();
    await act(async () => { window.dispatchEvent(new Event("pagehide")); });

    expect(storedGoal(KEY)).toBe("Ship the thesis chapter");
  });
});

describe("flushing early does not turn the debounce off", () => {
  it("collapses a burst of typing into a single write", async () => {
    render(<StudyPlanner />);
    const writes = vi.spyOn(Storage.prototype, "setItem");

    for (const value of ["S", "Sh", "Shi", "Ship"]) {
      fireEvent.change(goal(), { target: { value } });
      await tickWithinDebounce();
    }
    await settle();

    const weekWrites = writes.mock.calls.filter(([key]) => key === KEY);
    expect(weekWrites).toHaveLength(1);
    expect(storedGoal(KEY)).toBe("Ship");
  });

  it("writes nothing when a week is left without being edited", async () => {
    const { container } = render(<StudyPlanner />);

    await act(async () => { fireEvent.click(nextWeek(container)); });
    await settle();

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(NEXT_KEY)).toBeNull();
  });

  it("writes nothing when the planner goes away untouched", async () => {
    const { unmount } = render(<StudyPlanner />);

    unmount();

    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
