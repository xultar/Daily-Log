import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CarryForwardBar from "@/components/planner/CarryForwardBar";
import WeeklyTodoSidebar from "@/components/planner/WeeklyTodoSidebar";
import { CarryCandidate } from "@/lib/carry";
import { carryRuleClass } from "@/lib/carry-age";

/**
 * The Bullet Journal method treats an item that keeps moving as the signal to
 * question it, and the bar said nothing about it: an item pushed five times
 * looked identical to one pushed once, at the moment the user decides whether
 * to push it again.
 *
 * Design: docs/superpowers/specs/2026-08-28-carry-escalation-design.md
 */

const MONDAY = "2026-08-24";

// Deliberately not in age order, and with a tie: "Book viva slot" and "Email
// supervisor" are both a week old, so they also pin the sort's stability.
const CANDIDATES: CarryCandidate[] = [
  { text: "Book viva slot", origin: "2026-08-17" },   // 1w
  { text: "Draft methods", origin: "2026-08-03" },    // 3w
  { text: "Email supervisor", origin: "2026-08-17" }, // 1w
];

const bar = (props = {}) =>
  render(
    <CarryForwardBar candidates={CANDIDATES} mondayISO={MONDAY}
                     onBring={vi.fn()} onDismiss={vi.fn()} {...props} />
  );

const rowOrder = () =>
  screen.getAllByRole("checkbox").map((b) => b.getAttribute("aria-label") ?? b.closest("label")?.textContent ?? "");

const ruleOf = (name: string) =>
  screen.getByRole("checkbox", { name }).closest("label")!.className;

afterEach(cleanup);

describe("the bar leads with the most-migrated item", () => {
  it("puts a three-week item above a one-week item", () => {
    bar();

    expect(rowOrder()[0]).toContain("Draft methods");
  });

  /**
   * Stability matters because collectCarryForward's own order is meaningful —
   * weekly actions, then daily rows in day order. Items of equal age must keep
   * it rather than shuffling between renders.
   */
  it("keeps items of equal age in the order they arrived", () => {
    bar();

    const order = rowOrder();
    expect(order.findIndex((t) => t.includes("Book viva slot")))
      .toBeLessThan(order.findIndex((t) => t.includes("Email supervisor")));
  });
});

/**
 * The trap this feature exists to avoid. `excluded` holds indices into
 * `candidates` and `chosen` filters by index, so sorting the array in place
 * would glue an untick to a slot rather than an item: unticking the row the
 * user sees would drop whichever task now sits at that position.
 *
 * "Book viva slot" is candidate 0 but renders second once sorted, so a naive
 * implementation excludes "Draft methods" instead and this test fails.
 */
describe("unticking follows the item, not the position", () => {
  it("excludes the row the user unticked", () => {
    const onBring = vi.fn();
    bar({ onBring });

    fireEvent.click(screen.getByRole("checkbox", { name: "Book viva slot carried 1 week" }));
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));

    expect(onBring.mock.calls[0][0].map((c: CarryCandidate) => c.text))
      .toEqual(["Draft methods", "Email supervisor"]);
  });

  it("counts the button down by one", () => {
    bar();

    fireEvent.click(screen.getByRole("checkbox", { name: "Book viva slot carried 1 week" }));

    expect(screen.getByRole("button", { name: "Bring 2 forward" })).toBeInTheDocument();
  });
});

describe("the bar shows age as a thickening rule", () => {
  it("gives a one-week item the thin rule", () => {
    bar();

    expect(ruleOf("Book viva slot carried 1 week")).toContain("border-l-2");
  });

  it("gives a three-week item the thick rule", () => {
    bar();

    expect(ruleOf("Draft methods carried 3 weeks")).toContain("border-l-[6px]");
  });
});

/**
 * Literal classes rather than a call to carryRuleClass. Asserting through the
 * helper would compare the implementation with itself and pass however wrong
 * both were; these are the classes the sidebar emitted before the scale was
 * extracted, so they pin the extraction as a no-op.
 */
describe("carryRuleClass reproduces the sidebar's scale", () => {
  it.each([
    [1, "border-l-2"],
    [2, "border-l-4"],
    [3, "border-l-[6px]"],
    [12, "border-l-[6px]"],
  ])("gives age %i the rule %s", (age, expected) => {
    expect(carryRuleClass(age as number)).toContain(expected as string);
  });

  it("draws nothing for an item that was never carried", () => {
    expect(carryRuleClass(0)).toContain("border-l-transparent");
  });

  it("turns destructive past two weeks", () => {
    expect(carryRuleClass(3)).toContain("border-l-destructive/70");
  });

  it("is still the ordinary colour at two weeks", () => {
    expect(carryRuleClass(2)).toContain("border-l-campus-blue-dark");
    expect(carryRuleClass(2)).not.toContain("destructive");
  });
});

describe("the sidebar's rules are unchanged by the extraction", () => {
  const row = (origin: string | undefined, text: string) => {
    render(
      <WeeklyTodoSidebar todos={[{ text, checked: false, ...(origin ? { origin } : {}) }]}
                         mondayISO={MONDAY} onChange={vi.fn()} />
    );
    return screen.getByDisplayValue(text).closest("div")!.className;
  };

  it("draws a transparent rule for a fresh item", () => {
    expect(row(undefined, "Fresh")).toContain("border-l-transparent");
  });

  it("thickens to 4px at two weeks", () => {
    expect(row("2026-08-10", "Two weeks")).toContain("border-l-4");
  });

  it("thickens to 6px and turns destructive at three weeks", () => {
    const cls = row("2026-08-03", "Three weeks");
    expect(cls).toContain("border-l-[6px]");
    expect(cls).toContain("border-l-destructive/70");
  });
});
