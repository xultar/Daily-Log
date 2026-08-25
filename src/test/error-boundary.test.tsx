import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { createEmptyWeek, getWeekKey } from "@/lib/planner-data";

/**
 * A render-phase throw unmounted the whole app and left a blank page. Because
 * the data that caused it is persisted, reloading reproduced it, so there was
 * no way back in — and no way to get the data out either, since it lives only
 * in this browser.
 */

const WEEK = new Date(2026, 7, 26);

const Boom = ({ message = "week is not iterable" }: { message?: string }) => {
  throw new Error(message);
};

beforeEach(() => {
  localStorage.clear();
  // React logs every caught error; silence it so the suite output stays clean.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders its children when nothing goes wrong", () => {
    render(
      <ErrorBoundary>
        <p>the planner</p>
      </ErrorBoundary>
    );

    expect(screen.getByText("the planner")).toBeTruthy();
  });

  it("shows a message instead of a blank page when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(document.body.textContent).not.toBe("");
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("shows what actually went wrong", () => {
    render(
      <ErrorBoundary>
        <Boom message="week is not iterable" />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert").textContent).toContain("week is not iterable");
  });

  it("offers a reload", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByRole("button", { name: /reload/i })).toBeTruthy();
  });

  it("offers a way to get the data out, since the app is the only way to reach it", () => {
    const week = createEmptyWeek(WEEK);
    week.weekGoal = "Ship the thesis chapter";
    localStorage.setItem(`planner-${getWeekKey(WEEK)}`, JSON.stringify(week));

    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => { created.push(blob); return "blob:stub"; });
    URL.revokeObjectURL = vi.fn();

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole("button", { name: /back ?up|download/i }));

    expect(created).toHaveLength(1);
    expect(created[0].type).toContain("json");
  });

  it("still offers the fallback when the data cannot be read at all", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
