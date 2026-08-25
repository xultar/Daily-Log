import { describe, it, expect, beforeEach } from "vitest";
import { readColorScheme, writeColorScheme, resolveScheme, applySchemeClass } from "@/lib/color-scheme";

beforeEach(() => localStorage.clear());

describe("resolveScheme", () => {
  it("ignores the OS when the scheme is pinned", () => {
    expect(resolveScheme("light", true)).toBe(false);
    expect(resolveScheme("light", false)).toBe(false);
    expect(resolveScheme("dark", true)).toBe(true);
    expect(resolveScheme("dark", false)).toBe(true);
  });

  it("follows the OS when the scheme is system", () => {
    expect(resolveScheme("system", true)).toBe(true);
    expect(resolveScheme("system", false)).toBe(false);
  });
});

describe("readColorScheme", () => {
  it("defaults to system when nothing is stored", () => {
    expect(readColorScheme()).toBe("system");
  });

  it("round-trips a stored value", () => {
    writeColorScheme("dark");
    expect(readColorScheme()).toBe("dark");
  });

  it("falls back to system for an unreadable value", () => {
    localStorage.setItem("planner-color-scheme", "chartreuse");
    expect(readColorScheme()).toBe("system");
  });
});

describe("applySchemeClass", () => {
  it("adds and removes the class tailwind's darkMode switch looks for", () => {
    applySchemeClass(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    applySchemeClass(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
