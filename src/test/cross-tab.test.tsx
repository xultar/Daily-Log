import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { onExternalChange } from "@/lib/storage";
import CrossTabNotice from "@/components/planner/CrossTabNotice";

/**
 * jsdom does not fire storage events for its own localStorage writes, so these
 * dispatch a synthetic one. That is not a workaround: the real event never
 * fires in the writing document either, so a synthetic event is the only way
 * to exercise this in any environment.
 */
const externalChange = (key: string | null) =>
  window.dispatchEvent(new StorageEvent("storage", { key }));

describe("onExternalChange", () => {
  it("reports the key another tab changed", () => {
    const seen: (string | null)[] = [];
    const off = onExternalChange((k) => seen.push(k));
    externalChange("planner-2026-W35");
    off();
    expect(seen).toEqual(["planner-2026-W35"]);
  });

  it("passes null through rather than filtering it", () => {
    // null means another tab called clear(). Only the caller knows whether
    // that matters, so this must not swallow it.
    const seen: (string | null)[] = [];
    const off = onExternalChange((k) => seen.push(k));
    externalChange(null);
    off();
    expect(seen).toEqual([null]);
  });

  it("stops reporting once unsubscribed", () => {
    const handler = vi.fn();
    const off = onExternalChange(handler);
    off();
    externalChange("planner-2026-W35");
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns a callable unsubscribe even with no window", () => {
    // Guarding the subscribe means the unsubscribe must stay callable, or the
    // caller's effect cleanup throws.
    expect(typeof onExternalChange(vi.fn())).toBe("function");
  });
});

describe("CrossTabNotice", () => {
  const setup = (props = {}) =>
    render(<CrossTabNotice onReload={vi.fn()} onKeepMine={vi.fn()} {...props} />);

  it("says which tab changed, not that anything is unsaved", () => {
    // dirtyRef means edited-since-loaded, so this can appear when everything
    // local has already been written. "You have unsaved changes" would be
    // false in exactly that case.
    setup();
    expect(screen.getByText(/changed in another tab/i)).toBeInTheDocument();
    expect(screen.queryByText(/unsaved/i)).toBeNull();
  });

  it("offers reload", () => {
    const onReload = vi.fn();
    const onKeepMine = vi.fn();
    setup({ onReload, onKeepMine });
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onKeepMine).not.toHaveBeenCalled();
  });

  it("offers keeping this tab's version", () => {
    const onReload = vi.fn();
    const onKeepMine = vi.fn();
    setup({ onReload, onKeepMine });
    fireEvent.click(screen.getByRole("button", { name: /keep mine/i }));
    expect(onKeepMine).toHaveBeenCalledTimes(1);
    expect(onReload).not.toHaveBeenCalled();
  });

  it("does not print", () => {
    const { container } = setup();
    expect(container.firstElementChild?.className.split(/\s+/)).toContain("no-print");
  });

  it("carries none of the roles that would swallow the paint shortcuts", () => {
    // TimeGrid's keydown guard tests closest() for exactly these so Radix menus
    // can swallow digits; any of them on an ancestor disables 1-9 while focus
    // sits inside.
    const { container } = setup();
    expect(container.querySelector('[role="menu"], [role="dialog"], [role="listbox"]')).toBeNull();
  });
});
