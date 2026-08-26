import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import TimeByTag from "@/components/planner/TimeByTag";
import { createEmptyWeek, getWeekKey, WeekData } from "@/lib/planner-data";

const AUG24 = new Date(2026, 7, 24); // Monday of 2026-W35
const MONTH_START = new Date(2026, 7, 1);
const MONTH_END = new Date(2026, 7, 31);

function storeWeek(monday: Date, plan: Record<number, [number, number]>) {
  const week: WeekData = createEmptyWeek(monday);
  for (const [idx, [colorId, blocks]] of Object.entries(plan)) {
    const day = week.days[Number(idx)];
    let left = blocks;
    let hour = 0;
    while (left > 0) {
      for (let b = 0; b < 6 && left > 0; b++, left--) day.timeBlocks[hour][b] = colorId;
      hour++;
    }
  }
  localStorage.setItem(`planner-${getWeekKey(monday)}`, JSON.stringify(week));
}

const bars = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>("li span[style*='width']")];

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("time blocked by tag", () => {
  it("names each tag rather than showing a colour alone", () => {
    storeWeek(AUG24, { 0: [1, 6] });
    render(<TimeByTag from={MONTH_START} to={MONTH_END} />);

    expect(screen.getByText("Blue")).toBeInTheDocument();
  });

  it("uses the name the user gave the tag", () => {
    storeWeek(AUG24, { 0: [1, 6] });
    localStorage.setItem("planner-color-labels", JSON.stringify({ 1: "Thesis" }));
    render(<TimeByTag from={MONTH_START} to={MONTH_END} />);

    expect(screen.getByText("Thesis")).toBeInTheDocument();
    expect(screen.queryByText("Blue")).toBeNull();
  });

  it("shows each total", () => {
    storeWeek(AUG24, { 0: [1, 9] }); // 90 minutes
    render(<TimeByTag from={MONTH_START} to={MONTH_END} />);

    expect(screen.getByText("1h 30m")).toBeInTheDocument();
  });

  it("fills the row for the largest tag and scales the rest against it", () => {
    storeWeek(AUG24, { 0: [1, 12], 1: [2, 6] }); // 120m and 60m
    const { container } = render(<TimeByTag from={MONTH_START} to={MONTH_END} />);

    const widths = bars(container).map((b) => b.style.width);
    expect(widths[0]).toBe("100%");
    expect(widths[1]).toBe("50%");
  });

  it("orders the rows with the largest first", () => {
    storeWeek(AUG24, { 0: [2, 3], 1: [1, 12] }); // 30m of Pink, 120m of Blue
    const { container } = render(<TimeByTag from={MONTH_START} to={MONTH_END} />);

    const names = [...container.querySelectorAll("li")].map((li) => li.children[1].textContent);
    expect(names).toEqual(["Blue", "Pink"]);
  });

  it("renders nothing at all when no time is blocked", () => {
    // An empty chart frame reads as something that failed to load.
    const { container } = render(<TimeByTag from={MONTH_START} to={MONTH_END} />);

    expect(container.firstChild).toBeNull();
  });

  it("reports a future month, because a plan is blocked time too", () => {
    // The app cannot tell a plan from a record, and does not need to: the same
    // aggregate answers "where did it go" and "where is it going".
    const nextYear = new Date(2027, 2, 1); // Mon 1 Mar 2027
    storeWeek(nextYear, { 0: [3, 6] });
    render(<TimeByTag from={new Date(2027, 2, 1)} to={new Date(2027, 2, 31)} />);

    expect(screen.getByText("Green")).toBeInTheDocument();
    expect(screen.getByText("1h")).toBeInTheDocument();
  });
});
