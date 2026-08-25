import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readItem, writeItem, removeItem, listKeys } from "@/lib/storage";

/**
 * Every localStorage call in the app goes through here. The browser throws
 * outright rather than returning null when storage is denied — a sandboxed
 * frame, Safari with cookies blocked — and setItem throws on QuotaExceeded.
 * Those throws used to escape from loadWeek and from the autosave timeout.
 */

const deny = (method: "getItem" | "setItem" | "removeItem" | "key") =>
  vi.spyOn(Storage.prototype, method).mockImplementation(() => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  });

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("readItem", () => {
  it("returns what was stored", () => {
    localStorage.setItem("k", "v");

    expect(readItem("k")).toBe("v");
  });

  it("returns null for a key that is not there", () => {
    expect(readItem("missing")).toBeNull();
  });

  it("returns null instead of throwing when storage is denied", () => {
    deny("getItem");

    expect(readItem("k")).toBeNull();
  });
});

describe("writeItem", () => {
  it("stores the value and reports success", () => {
    expect(writeItem("k", "v")).toBe(true);
    expect(localStorage.getItem("k")).toBe("v");
  });

  it("reports failure instead of throwing when the write is refused", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });

    expect(writeItem("k", "v")).toBe(false);
  });
});

describe("removeItem", () => {
  it("removes the entry and reports success", () => {
    localStorage.setItem("k", "v");

    expect(removeItem("k")).toBe(true);
    expect(localStorage.getItem("k")).toBeNull();
  });

  it("reports failure instead of throwing", () => {
    deny("removeItem");

    expect(removeItem("k")).toBe(false);
  });
});

describe("listKeys", () => {
  it("lists what is stored", () => {
    localStorage.setItem("a", "1");
    localStorage.setItem("b", "2");

    expect(listKeys().sort()).toEqual(["a", "b"]);
  });

  it("returns nothing instead of throwing when storage is denied", () => {
    deny("key");

    expect(listKeys()).toEqual([]);
  });
});
