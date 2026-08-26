import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { onExternalChange } from "@/lib/storage";
import CrossTabNotice from "@/components/planner/CrossTabNotice";
import { saveWeek, loadWeek, createEmptyWeek, getWeekKey } from "@/lib/planner-data";
import { startOfWeek, addWeeks } from "date-fns";
import StudyPlanner from "@/components/planner/StudyPlanner";

/**
 * jsdom does not fire storage events for its own localStorage writes, so these
 * dispatch a synthetic one. That is not a workaround: the real event never
 * fires in the writing document either, so a synthetic event is the only way
 * to exercise this in any environment.
 */
const externalChange = (key: string | null) =>
  window.dispatchEvent(new StorageEvent("storage", { key }));

describe("onExternalChange", () => {
  it("reports the key another tab changed", () => {
    const seen: (string | null)[] = [];
    const off = onExternalChange((k) => seen.push(k));
    externalChange("planner-2026-W35");
    off();
    expect(seen).toEqual(["planner-2026-W35"]);
  });

  it("passes null through rather than filtering it", () => {
    // null means another tab called clear(). Only the caller knows whether
    // that matters, so this must not swallow it.
    const seen: (string | null)[] = [];
    const off = onExternalChange((k) => seen.push(k));
    externalChange(null);
    off();
    expect(seen).toEqual([null]);
  });

  it("stops reporting once unsubscribed", () => {
    const handler = vi.fn();
    const off = onExternalChange(handler);
    off();
    externalChange("planner-2026-W35");
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns a callable unsubscribe even with no window", () => {
    // Guarding the subscribe means the unsubscribe must stay callable, or the
    // caller's effect cleanup throws.
    expect(typeof onExternalChange(vi.fn())).toBe("function");
  });
});

describe("CrossTabNotice", () => {
  const setup = (props = {}) =>
    render(<CrossTabNotice onReload={vi.fn()} onKeepMine={vi.fn()} {...props} />);

  it("says which tab changed, not that anything is unsaved", () => {
    // dirtyRef means edited-since-loaded, so this can appear when everything
    // local has already been written. "You have unsaved changes" would be
    // false in exactly that case.
    setup();
    expect(screen.getByText(/changed in another tab/i)).toBeInTheDocument();
    expect(screen.queryByText(/unsaved/i)).toBeNull();
  });

  it("offers reload", () => {
    const onReload = vi.fn();
    const onKeepMine = vi.fn();
    setup({ onReload, onKeepMine });
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onKeepMine).not.toHaveBeenCalled();
  });

  it("offers keeping this tab's version", () => {
    const onReload = vi.fn();
    const onKeepMine = vi.fn();
    setup({ onReload, onKeepMine });
    fireEvent.click(screen.getByRole("button", { name: /keep mine/i }));
    expect(onKeepMine).toHaveBeenCalledTimes(1);
    expect(onReload).not.toHaveBeenCalled();
  });

  it("does not print", () => {
    const { container } = setup();
    expect(container.firstElementChild?.className.split(/\s+/)).toContain("no-print");
  });

  it("carries none of the roles that would swallow the paint shortcuts", () => {
    // TimeGrid's keydown guard tests closest() for exactly these so Radix menus
    // can swallow digits; any of them on an ancestor disables 1-9 while focus
    // sits inside.
    const { container } = setup();
    expect(container.querySelector('[role="menu"], [role="dialog"], [role="listbox"]')).toBeNull();
  });
});

const NOW = new Date(2026, 7, 26); // Wed 26 Aug 2026
const thisMonday = () => startOfWeek(NOW, { weekStartsOn: 1 });
const thisKey = () => `planner-${getWeekKey(thisMonday())}`;

/** Let the debounce elapse, matching autosave.test.tsx. */
const settle = async () => { await act(async () => { vi.advanceTimersByTime(400); }); };

const goalInput = () => screen.getByPlaceholderText("What do you want to achieve this week?");

/** Deliver the event another tab's write would have produced. */
const fromOtherTab = async (key: string | null = thisKey()) => {
  await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key })); });
};

/** What another tab would have written. */
function writeFromOtherTab(text: string) {
  const w = createEmptyWeek(thisMonday());
  w.weekGoal = text;
  saveWeek(thisMonday(), w);
}

describe("StudyPlanner across tabs", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("reloads a clean tab when another tab writes this week", async () => {
    render(<StudyPlanner />);
    writeFromOtherTab("From the other tab");
    await fromOtherTab();
    expect(goalInput()).toHaveValue("From the other tab");
  });

  it("shows no notice on a clean tab", async () => {
    render(<StudyPlanner />);
    writeFromOtherTab("From the other tab");
    await fromOtherTab();
    expect(screen.queryByText(/changed in another tab/i)).toBeNull();
  });

  it("does not reload a tab that has edited this week", async () => {
    render(<StudyPlanner />);
    fireEvent.change(goalInput(), { target: { value: "Mine" } });
    writeFromOtherTab("Theirs");
    await fromOtherTab();
    expect(goalInput()).toHaveValue("Mine");
    expect(screen.getByText(/changed in another tab/i)).toBeInTheDocument();
  });

  it("ignores a change to a different week", async () => {
    render(<StudyPlanner />);
    writeFromOtherTab("Should not appear");
    await fromOtherTab(`planner-${getWeekKey(addWeeks(thisMonday(), 1))}`);
    expect(goalInput()).toHaveValue("");
  });

  it("ignores a change to a setting", async () => {
    render(<StudyPlanner />);
    writeFromOtherTab("Should not appear");
    await fromOtherTab("planner-theme");
    expect(goalInput()).toHaveValue("");
  });

  it("treats a cleared store as relevant", async () => {
    render(<StudyPlanner />);
    writeFromOtherTab("From the other tab");
    await fromOtherTab(null);
    expect(goalInput()).toHaveValue("From the other tab");
  });

  it("reload takes the other tab's version and dismisses", async () => {
    render(<StudyPlanner />);
    fireEvent.change(goalInput(), { target: { value: "Mine" } });
    writeFromOtherTab("Theirs");
    await fromOtherTab();
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    await settle();
    expect(goalInput()).toHaveValue("Theirs");
    expect(screen.queryByText(/changed in another tab/i)).toBeNull();
  });

  it("reload does not write this tab's stale copy on the way out", async () => {
    // THE point of the task. The load effect flushes pendingRef first, so a
    // bare refreshKey bump would write "Mine" over "Theirs" and then read back
    // its own write — Reload doing the opposite of its label.
    render(<StudyPlanner />);
    fireEvent.change(goalInput(), { target: { value: "Mine" } });
    writeFromOtherTab("Theirs");
    await fromOtherTab();
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    await settle();
    expect(loadWeek(thisMonday()).weekGoal).toBe("Theirs");
  });

  it("keep mine dismisses, and this tab's next write still lands", async () => {
    render(<StudyPlanner />);
    fireEvent.change(goalInput(), { target: { value: "Mine" } });
    writeFromOtherTab("Theirs");
    await fromOtherTab();
    fireEvent.click(screen.getByRole("button", { name: /keep mine/i }));
    await settle();
    expect(screen.queryByText(/changed in another tab/i)).toBeNull();
    expect(loadWeek(thisMonday()).weekGoal).toBe("Mine");
  });

  it("drops the notice when the week changes", async () => {
    const { container } = render(<StudyPlanner />);
    fireEvent.change(goalInput(), { target: { value: "Mine" } });
    writeFromOtherTab("Theirs");
    await fromOtherTab();
    expect(screen.getByText(/changed in another tab/i)).toBeInTheDocument();
    fireEvent.click(container.querySelectorAll("button")[1]); // next week
    await settle();
    expect(screen.queryByText(/changed in another tab/i)).toBeNull();
  });

  it("stops listening once unmounted", () => {
    // Asserted on removeEventListener rather than on "nothing throws": React 18
    // dropped the setState-after-unmount warning, so a not.toThrow() version of
    // this would pass with the listener still live — a test that looks like
    // coverage and is not.
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<StudyPlanner />);
    unmount();
    expect(remove.mock.calls.some(([type]) => type === "storage")).toBe(true);
    remove.mockRestore();
  });
});
