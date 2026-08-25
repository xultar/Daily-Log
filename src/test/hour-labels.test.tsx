import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TimeGrid from "@/components/planner/TimeGrid";
import { createEmptyDay, formatHourLabel, HOUR_LABELS } from "@/lib/planner-data";

/**
 * The grid's last row covers midnight to 1am, and labelling it 24 read as an
 * hour that does not exist on a clock. The label is presentation only: HOURS
 * still runs 6..24 because those values size timeBlocks and drive
 * repairTimeBlocks, so changing them would be a stored-data change for a
 * cosmetic fix.
 */

const MONDAY = new Date(2026, 7, 24);

describe("formatHourLabel", () => {
  it("shows midnight as 00 rather than 24", () => {
    expect(formatHourLabel(24)).toBe("00");
  });

  it("leaves every other hour as it reads on a clock", () => {
    expect(formatHourLabel(6)).toBe("6");
    expect(formatHourLabel(9)).toBe("9");
    expect(formatHourLabel(23)).toBe("23");
  });
});

describe("the rendered grid", () => {
  const grid = () =>
    render(
      <TimeGrid
        timeBlocks={createEmptyDay(MONDAY).timeBlocks}
        onChange={() => {}}
        activeColor={1}
        onActiveColorChange={() => {}}
      />
    );

  it("labels its last hour row 00", () => {
    grid();

    expect(screen.getByText("00")).toBeTruthy();
    expect(screen.queryByText("24")).toBeNull();
  });

  it("still labels its first hour row 6", () => {
    grid();

    expect(screen.getByText("6")).toBeTruthy();
  });

  it("still draws one row per hour", () => {
    grid();

    // The label change must not alter how many rows there are.
    expect(HOUR_LABELS).toHaveLength(19);
  });
});
