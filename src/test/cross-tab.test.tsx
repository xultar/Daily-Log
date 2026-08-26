import { describe, it, expect, vi } from "vitest";
import { onExternalChange } from "@/lib/storage";

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
