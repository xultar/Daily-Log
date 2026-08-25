import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DailyView from "@/components/planner/DailyView";
import { createEmptyDay } from "@/lib/planner-data";

const MONDAY = new Date(2026, 7, 24);

const tagged = () => {
  const day = createEmptyDay(MONDAY);
  day.subjects[0] = { subject: "Draft", checked: false, colorId: 7 };
  return day;
};

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
