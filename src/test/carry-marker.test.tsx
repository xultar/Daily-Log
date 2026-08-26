import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WeeklyTodoSidebar from "@/components/planner/WeeklyTodoSidebar";
import { TodoItem } from "@/lib/planner-data";

const TODOS: TodoItem[] = [
  { text: "Fresh this week", checked: false },
  { text: "Slipped once", checked: false, origin: "2026-08-17" },
  { text: "Slipped three times", checked: false, origin: "2026-08-03" },
];

const setup = (onChange = vi.fn()) =>
  render(<WeeklyTodoSidebar todos={TODOS} mondayISO="2026-08-24" onChange={onChange} />);

describe("the age marker", () => {
  it("labels a slipped item with its age in weeks", () => {
    setup();
    expect(screen.getByText("1w")).toBeInTheDocument();
    expect(screen.getByText("3w")).toBeInTheDocument();
  });

  it("leaves an item that originated this week unmarked", () => {
    setup();
    expect(screen.queryByText("0w")).toBeNull();
    // Anchored, so this cannot pass by rendering nothing at all.
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
  });

  it("measures age against the week being viewed, not a fixed date", () => {
    // A component ignoring the prop would pass every other test here.
    render(<WeeklyTodoSidebar todos={TODOS} mondayISO="2026-08-31" onChange={vi.fn()} />);
    expect(screen.getByText("2w")).toBeInTheDocument();
    expect(screen.getByText("4w")).toBeInTheDocument();
  });

  it("preserves origin through a keystroke", () => {
    // The spread in `update` is the only thing carrying origin through an edit,
    // for the same reason updateSubject must not be rewritten to list fields:
    // the field is optional and strict is off, so nothing would catch the loss.
    const onChange = vi.fn();
    setup(onChange);
    fireEvent.change(screen.getAllByRole("textbox")[1], { target: { value: "Slipped once more" } });
    expect(onChange.mock.calls[0][0][1]).toEqual({
      text: "Slipped once more",
      checked: false,
      origin: "2026-08-17",
    });
  });

  it("preserves origin through a checkbox toggle", () => {
    const onChange = vi.fn();
    setup(onChange);
    fireEvent.click(screen.getAllByRole("checkbox")[2]);
    expect(onChange.mock.calls[0][0][2].origin).toBe("2026-08-03");
  });

  it("announces the age as words, not as 3w", () => {
    setup();
    expect(screen.getByText("carried 3 weeks")).toBeInTheDocument();
    expect(screen.getByText("carried 1 week")).toBeInTheDocument();
  });

  it("hides the short token from screen readers, so it is not read as 'one w'", () => {
    const { container } = setup();
    const hidden = [...container.querySelectorAll('[aria-hidden="true"]')].map((e) => e.textContent);
    expect(hidden).toContain("3w");
    expect(hidden).toContain("1w");
  });

  it("thickens the rule with age and caps it at three weeks", () => {
    // Token-exact, not substring: CLAUDE.md records that border-border/50
    // contains the characters border-b, so a substring check discriminates
    // nothing. legend-borders.test.tsx pins classes the same way.
    const { container } = render(
      <WeeklyTodoSidebar
        todos={[
          { text: "Fresh", checked: false },
          { text: "One week", checked: false, origin: "2026-08-17" },
          { text: "Two weeks", checked: false, origin: "2026-08-10" },
          { text: "Five weeks", checked: false, origin: "2026-07-20" },
        ]}
        mondayISO="2026-08-24"
        onChange={vi.fn()}
      />
    );
    const tokens = (row: Element) => row.className.split(/\s+/);
    const rows = [...container.querySelectorAll(".group")];
    expect(rows).toHaveLength(4);
    expect(tokens(rows[0])).toContain("border-l-transparent");
    expect(tokens(rows[1])).toContain("border-l-2");
    expect(tokens(rows[2])).toContain("border-l-4");
    expect(tokens(rows[3])).toContain("border-l-[6px]"); // five weeks, capped at three
  });

  it("switches the rule to the warning colour past two weeks", () => {
    // A third item at exactly three weeks pins the boundary itself: at two
    // weeks it must still read as the calm colour, and at three it must not.
    const { container } = render(
      <WeeklyTodoSidebar
        todos={[
          { text: "Fresh", checked: false },
          { text: "Two weeks", checked: false, origin: "2026-08-10" },
          { text: "Three weeks", checked: false, origin: "2026-08-03" },
        ]}
        mondayISO="2026-08-24"
        onChange={vi.fn()}
      />
    );
    const tokens = (row: Element) => row.className.split(/\s+/);
    const rows = [...container.querySelectorAll(".group")];
    expect(rows).toHaveLength(3);
    expect(tokens(rows[1])).toContain("border-l-campus-blue-dark");
    expect(tokens(rows[2])).toContain("border-l-destructive/70");
  });
});
