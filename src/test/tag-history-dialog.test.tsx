import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SearchDialog from "@/components/planner/SearchDialog";
import { createEmptyWeek } from "@/lib/planner-data";

const AUG = new Date(2026, 7, 26); // Wed 26 Aug 2026, week 2026-W35

function seed() {
  const week = createEmptyWeek(AUG);
  // Six ten-minute blocks on Monday 24 Aug = an hour of tag 1.
  for (let b = 0; b < 6; b++) week.days[0].timeBlocks[0][b] = 1;
  localStorage.setItem("planner-2026-W35", JSON.stringify(week));
  localStorage.setItem("planner-color-labels", JSON.stringify({ 1: "Thesis", 2: "Admin" }));
}

const open = (onJump = vi.fn()) => {
  render(<SearchDialog onJump={onJump} onJumpToMonth={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
  return onJump;
};

const toTagMode = () => fireEvent.click(screen.getByRole("button", { name: "Tag" }));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("the tag mode of the find dialog", () => {
  it("swaps the text box for the tag picker", () => {
    seed();
    open();

    expect(screen.getByRole("textbox", { name: /search/i })).toBeInTheDocument();
    toTagMode();

    expect(screen.queryByRole("textbox", { name: /search/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Thesis/ })).toBeInTheDocument();
  });

  it("lists the days a tag was used, with the time blocked against it", () => {
    seed();
    open();
    toTagMode();

    fireEvent.click(screen.getByRole("button", { name: /Thesis/ }));

    expect(screen.getByText(/Mon 24 Aug 2026/)).toBeInTheDocument();
    expect(screen.getByText("1h")).toBeInTheDocument();
  });

  it("jumps to the week the day belongs to", () => {
    seed();
    const onJump = open();
    toTagMode();

    fireEvent.click(screen.getByRole("button", { name: /Thesis/ }));
    fireEvent.click(screen.getByRole("button", { name: /Mon 24 Aug 2026/ }));

    expect(onJump).toHaveBeenCalledWith("2026-08-24");
  });

  it("names the tag when it has never been used, rather than saying nothing", () => {
    // "No results" would leave the user unsure which tag was even asked about.
    seed();
    open();
    toTagMode();

    fireEvent.click(screen.getByRole("button", { name: /Admin/ }));

    expect(screen.getByText(/tagged Admin/i)).toBeInTheDocument();
  });
});
