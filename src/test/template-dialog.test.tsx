import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { startOfWeek, subWeeks, addWeeks } from "date-fns";
import StudyPlanner from "@/components/planner/StudyPlanner";
import { createEmptyWeek, saveWeek, loadWeek, WeekData } from "@/lib/planner-data";

const NOW = new Date(2026, 7, 26); // Wed 26 Aug 2026
const thisMonday = () => startOfWeek(NOW, { weekStartsOn: 1 });

/** Let the autosave debounce elapse, matching carry-bar.test.tsx. */
const settle = async () => {
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
};

/** A painted week one week back, which is what findTemplateSource will find. */
function seedTemplateWeek(): WeekData {
  const monday = subWeeks(thisMonday(), 1);
  const w = createEmptyWeek(monday);
  for (let b = 0; b < 6; b++) w.days[0].timeBlocks[0][b] = 1;
  w.days[0].subjects[0] = { subject: "Teaching", checked: false };
  saveWeek(monday, w);
  return w;
}

const openDialog = () =>
  fireEvent.click(screen.getByRole("button", { name: /copy a week's shape/i }));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the template dialog", () => {
  it("names the week it would copy from", () => {
    seedTemplateWeek();
    render(<StudyPlanner />);
    openDialog();

    expect(screen.getByText(/17 – 23 Aug 2026/)).toBeInTheDocument();
  });

  it("says how much would land", () => {
    seedTemplateWeek();
    render(<StudyPlanner />);
    openDialog();

    expect(screen.getByText(/6 empty blocks/)).toBeInTheDocument();
    expect(screen.getByText(/1 empty row/)).toBeInTheDocument();
  });

  it("says so when there is no painted week behind this one", () => {
    render(<StudyPlanner />);
    openDialog();

    expect(screen.getByText(/no week in the last four/i)).toBeInTheDocument();
  });

  it("applies the shape to the week on screen", async () => {
    seedTemplateWeek();
    render(<StudyPlanner />);
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    await settle();

    const written = loadWeek(thisMonday());
    expect(written.days[0].timeBlocks[0][0]).toBe(1);
    expect(written.days[0].subjects[0].subject).toBe("Teaching");
  });

  it("leaves the source week untouched, because templating copies", async () => {
    seedTemplateWeek();
    render(<StudyPlanner />);
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    await settle();

    const source = loadWeek(subWeeks(thisMonday(), 1));
    expect(source.days[0].timeBlocks[0][0]).toBe(1);
    expect(source.days[0].subjects[0].subject).toBe("Teaching");
  });

  it("applies to the week on screen, not the week the planner opened on", async () => {
    // The documented bringForward trap, in a second place. applyWeekTemplate
    // is a useCallback with a stable dep, so its closure is built once at
    // mount. Closing over weekData instead of using the updater form captures
    // the mount-time week forever, and pressing Apply on another week writes
    // this week's contents under that week's key. Every other test here acts
    // on the mount week, so the closure is accidentally correct throughout and
    // nothing else would notice.
    seedTemplateWeek();
    const nextMonday = addWeeks(thisMonday(), 1);
    const next = createEmptyWeek(nextMonday);
    next.weekGoal = "Next week's own goal";
    saveWeek(nextMonday, next);

    const { container } = render(<StudyPlanner />);
    fireEvent.click(container.querySelectorAll("button")[1]); // next week
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    await settle();

    const written = loadWeek(nextMonday);
    expect(written.weekGoal).toBe("Next week's own goal");
    expect(written.days[0].timeBlocks[0][0]).toBe(1);

    // And this week, which was on screen at mount, got nothing.
    expect(loadWeek(thisMonday()).days[0].timeBlocks[0][0]).toBe(0);
  });
});
