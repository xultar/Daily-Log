import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { loadWeek, saveWeek, createEmptyWeek } from "@/lib/planner-data";
import { saveColorLabels, loadColorLabels } from "@/lib/palette";
import { exportAllData } from "@/lib/export-import";
import { ThemeProvider, THEMES } from "@/lib/theme-context";
import StudyPlanner from "@/components/planner/StudyPlanner";
import { toast } from "@/hooks/use-toast";

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toasts: [] }) }));

/**
 * Storage can fail in two ways that matter: it is denied outright (reads and
 * writes both throw), or it is full (writes throw). Neither should take the app
 * down, and a write that fails must not fail silently — the user goes on typing
 * into a planner that stopped saving.
 */

const WEEK = new Date(2026, 7, 26);

const denyEverything = () => {
  for (const m of ["getItem", "setItem", "removeItem", "key"] as const) {
    vi.spyOn(Storage.prototype, m).mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
  }
};

const fillStorage = () =>
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("QuotaExceededError", "QuotaExceededError");
  });

beforeEach(() => {
  localStorage.clear();
  vi.mocked(toast).mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("reads survive storage being denied", () => {
  it("loadWeek gives back an empty week rather than throwing", () => {
    denyEverything();

    expect(() => loadWeek(WEEK)).not.toThrow();
    expect(loadWeek(WEEK).days).toHaveLength(7);
  });

  it("loadColorLabels gives back no labels", () => {
    denyEverything();

    expect(loadColorLabels()).toEqual({});
  });

  it("exportAllData gives back no weeks", () => {
    // Seed first: on an empty store the scan loop never runs, so denying
    // storage afterwards would pass without exercising anything.
    localStorage.setItem("planner-2026-W35", JSON.stringify(createEmptyWeek(WEEK)));
    denyEverything();

    expect(exportAllData().weeks).toEqual({});
  });

  it("the theme provider falls back to the first theme", () => {
    denyEverything();

    expect(() =>
      render(
        <ThemeProvider>
          <p>{"rendered"}</p>
        </ThemeProvider>
      )
    ).not.toThrow();
    expect(screen.getByText("rendered")).toBeTruthy();
  });
});

describe("writes report whether they landed", () => {
  it("saveWeek reports success", () => {
    expect(saveWeek(WEEK, createEmptyWeek(WEEK))).toBe(true);
  });

  it("saveWeek reports failure instead of throwing when storage is full", () => {
    fillStorage();

    expect(saveWeek(WEEK, createEmptyWeek(WEEK))).toBe(false);
  });

  it("saveColorLabels does not throw when storage is full", () => {
    fillStorage();

    expect(() => saveColorLabels({ 1: "Deep work" })).not.toThrow();
  });
});

describe("the user is told when saving stops working", () => {
  const goal = () => screen.getByPlaceholderText("What do you want to achieve this week?");
  const settle = async () => { await act(async () => { vi.advanceTimersByTime(400); }); };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("warns when an edit could not be saved", async () => {
    render(<StudyPlanner />);
    fillStorage();

    fireEvent.change(goal(), { target: { value: "Ship the thesis chapter" } });
    await settle();

    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast).mock.calls[0][0]).toMatchObject({ variant: "destructive" });
  });

  it("warns once, not on every keystroke", async () => {
    render(<StudyPlanner />);
    fillStorage();

    for (const value of ["S", "Sh", "Shi", "Ship"]) {
      fireEvent.change(goal(), { target: { value } });
      await settle();
    }

    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
  });

  it("says nothing while saving works", async () => {
    render(<StudyPlanner />);

    fireEvent.change(goal(), { target: { value: "Ship the thesis chapter" } });
    await settle();

    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it("warns again if saving fails after recovering", async () => {
    render(<StudyPlanner />);
    const full = fillStorage();

    fireEvent.change(goal(), { target: { value: "one" } });
    await settle();
    full.mockRestore();
    fireEvent.change(goal(), { target: { value: "two" } });
    await settle();
    fillStorage();
    fireEvent.change(goal(), { target: { value: "three" } });
    await settle();

    expect(vi.mocked(toast)).toHaveBeenCalledTimes(2);
  });
});
