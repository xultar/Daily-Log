import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import MonthNotes from "@/components/planner/MonthNotes";
import { loadMonthNote, saveMonthNote } from "@/lib/month-notes";
import { toast } from "@/hooks/use-toast";

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toasts: [] }) }));

/**
 * The field saves on every keystroke rather than through a debounce, which is
 * what removes the whole pendingRef problem — there is no timer to flush, so
 * there is nothing to lose. These tests advance no timers on purpose.
 */

const field = () => screen.getByRole("textbox", { name: /notes and reflections/i });

const type = (value: string) => fireEvent.change(field(), { target: { value } });

const denyWrites = () =>
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

describe("the month notes field", () => {
  it("names the month it belongs to", () => {
    render(<MonthNotes monthKey="2026-08" />);

    expect(
      screen.getByRole("textbox", { name: "Notes and reflections for August 2026" })
    ).toBeInTheDocument();
  });

  it("shows what was already stored for that month", () => {
    saveMonthNote("2026-08", "Teaching ate the month.");

    render(<MonthNotes monthKey="2026-08" />);

    expect(field()).toHaveValue("Teaching ate the month.");
  });

  it("saves as it is typed, with no timer to wait out", () => {
    render(<MonthNotes monthKey="2026-08" />);

    type("Fridays are the problem.");

    expect(loadMonthNote("2026-08")).toBe("Fridays are the problem.");
  });

  it("does not print when it is empty", () => {
    const { container } = render(<MonthNotes monthKey="2026-08" />);

    expect(container.firstElementChild).toHaveClass("no-print");
  });

  it("prints once it has something in it", () => {
    const { container } = render(<MonthNotes monthKey="2026-08" />);

    type("Worth keeping.");

    expect(container.firstElementChild).not.toHaveClass("no-print");
  });

  it("warns once when storage refuses, not once per keystroke", () => {
    denyWrites();
    render(<MonthNotes monthKey="2026-08" />);

    type("a");
    type("ab");
    type("abc");

    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("warns again when saving fails after recovering", () => {
    const setItem = denyWrites();
    render(<MonthNotes monthKey="2026-08" />);
    type("a");

    setItem.mockRestore();
    type("ab");
    denyWrites();
    type("abc");

    expect(toast).toHaveBeenCalledTimes(2);
  });
});
