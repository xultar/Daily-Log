import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SearchDialog from "@/components/planner/SearchDialog";
import { createEmptyWeek } from "@/lib/planner-data";

const AUG = new Date(2026, 7, 26); // Wed 26 Aug 2026, week 2026-W35

function seed() {
  const week = createEmptyWeek(AUG);
  week.weekGoal = "Finish the methods chapter";
  // Deliberately says nothing about which day it is: day index 4 is Friday, and
  // the row's day label has to be the only place that word appears or the test
  // cannot tell the label from the snippet.
  week.days[4].memo = "Library until four";
  localStorage.setItem("planner-2026-W35", JSON.stringify(week));
}

const open = (onJump = vi.fn()) => {
  render(<SearchDialog onJump={onJump} onJumpToMonth={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
  return onJump;
};

const type = (value: string) =>
  fireEvent.change(screen.getByRole("textbox", { name: /search/i }), { target: { value } });

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("the search dialog", () => {
  it("shows a matching week, with the text that matched", () => {
    seed();
    open();

    type("methods");

    expect(screen.getByText(/Finish the methods chapter/)).toBeInTheDocument();
  });

  it("names the week a result came from", () => {
    seed();
    open();

    type("methods");

    // The week of Mon 24 Aug 2026.
    expect(screen.getByText(/24/)).toBeInTheDocument();
  });

  it("names the day for a match inside one", () => {
    // The click lands on the week, where a memo is one truncated line, so the
    // row has to say where to look once you are there.
    seed();
    open();

    type("Library");

    expect(screen.getByText(/Friday/)).toBeInTheDocument();
  });

  it("jumps to the week the match came from", () => {
    seed();
    const onJump = open();

    type("methods");
    fireEvent.click(screen.getByRole("button", { name: /Finish the methods chapter/ }));

    expect(onJump).toHaveBeenCalledWith("2026-08-24");
  });

  it("says so when nothing matches, rather than looking broken", () => {
    seed();
    open();

    type("nothing here matches this");

    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });

  it("prompts rather than reporting no matches before the query is usable", () => {
    // One character is not a failed search, it is an unfinished one, and
    // "No matches" would be a lie.
    seed();
    open();

    type("m");

    expect(screen.queryByText(/no matches/i)).toBeNull();
  });
});
