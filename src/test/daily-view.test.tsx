import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import DailyView from "@/components/planner/DailyView";
import { createEmptyDay } from "@/lib/planner-data";

const MONDAY = new Date(2026, 7, 24);

const tagged = () => {
  const day = createEmptyDay(MONDAY);
  day.subjects[0] = { subject: "Draft", checked: false, colorId: 7 };
  return day;
};

/**
 * Deleting rows here is what makes padding the stored `subjects` array wrong,
 * and it is why the week view lines its columns up in the rendering instead.
 * It had no test of its own until that fix needed it to stay true.
 */
describe("DailyView row deletion", () => {
  /**
   * The delete control names itself, so this queries by role rather than by
   * position. The name is matched loosely because it grows an explanation when
   * the row is the last one left.
   */
  const deleteControl = () => {
    const row = screen
      .getAllByPlaceholderText("Add priority / action...")[0]
      .closest("div.group") as HTMLElement;
    return within(row).getByRole("button", { name: /^Delete priority row/ });
  };

  const removeFirstRow = () => fireEvent.click(deleteControl());

  it("names the delete control", () => {
    render(
      <DailyView day={createEmptyDay(MONDAY)} dayIndex={0} onChange={() => {}}
                 activeColor={1} onActiveColorChange={() => {}} />
    );

    const button = deleteControl();
    expect(button).toHaveAccessibleName("Delete priority row");
    expect(button).toHaveAttribute("title", "Delete priority row");
    expect(button).toHaveAttribute("aria-disabled", "false");
  });

  /**
   * `removeSubject` refuses when one row is left, so the control is announced
   * as unavailable rather than looking identical and silently doing nothing.
   * `aria-disabled` rather than `disabled`: it keeps the button in the tab
   * order, which is the only way a keyboard user hears the reason, and it
   * leaves the refusal where it already lives instead of letting the attribute
   * swallow the click before the guard is consulted.
   */
  it("announces the delete control as unavailable on the last row", () => {
    const day = createEmptyDay(MONDAY);
    day.subjects = day.subjects.slice(0, 1);
    render(
      <DailyView day={day} dayIndex={0} onChange={() => {}}
                 activeColor={1} onActiveColorChange={() => {}} />
    );

    const button = deleteControl();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleName("Delete priority row (a day keeps at least one)");
    expect(button).toHaveAttribute("title", "A day keeps at least one row");
  });

  /** aria-disabled, not disabled: the click must still reach the guard. */
  it("keeps the delete control focusable and clickable on the last row", () => {
    const day = createEmptyDay(MONDAY);
    day.subjects = day.subjects.slice(0, 1);
    render(
      <DailyView day={day} dayIndex={0} onChange={() => {}}
                 activeColor={1} onActiveColorChange={() => {}} />
    );

    expect(deleteControl()).not.toBeDisabled();
  });

  it("shortens the day rather than blanking the row", () => {
    const onChange = vi.fn();
    render(
      <DailyView day={createEmptyDay(MONDAY)} dayIndex={0} onChange={onChange}
                 activeColor={1} onActiveColorChange={() => {}} />
    );

    removeFirstRow();

    expect(onChange.mock.calls[0][0].subjects).toHaveLength(5);
  });

  it("refuses to delete the last remaining row", () => {
    const onChange = vi.fn();
    const day = createEmptyDay(MONDAY);
    day.subjects = day.subjects.slice(0, 1);
    render(
      <DailyView day={day} dayIndex={0} onChange={onChange}
                 activeColor={1} onActiveColorChange={() => {}} />
    );

    removeFirstRow();

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("DailyView row mutation", () => {
  it("preserves a row colorId when the subject text changes", () => {
    const onChange = vi.fn();
    render(
      <DailyView day={tagged()} dayIndex={0} onChange={onChange}
                 activeColor={1} onActiveColorChange={() => {}} />
    );
    // createEmptyDay seeds six subject rows and every row shares the same
    // placeholder attribute regardless of its current value, so the query
    // is ambiguous with getByPlaceholderText; the tagged row is first.
    fireEvent.change(screen.getAllByPlaceholderText("Add priority / action...")[0],
                     { target: { value: "Draft the proposal" } });
    expect(onChange.mock.calls[0][0].subjects[0])
      .toEqual({ subject: "Draft the proposal", checked: false, colorId: 7 });
  });

  it("preserves a row colorId when the checkbox toggles", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DailyView day={tagged()} dayIndex={0} onChange={onChange}
                 activeColor={1} onActiveColorChange={() => {}} />
    );
    fireEvent.click(container.querySelector("input[type=checkbox]"));
    expect(onChange.mock.calls[0][0].subjects[0])
      .toEqual({ subject: "Draft", checked: true, colorId: 7 });
  });
});
