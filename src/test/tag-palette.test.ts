import { describe, it, expect } from "vitest";
import { buildTagPaletteCss, buildThemeCss } from "@/lib/tag-palette";
import { BLOCK_COLORS } from "@/lib/palette";

describe("buildTagPaletteCss", () => {
  const css = buildTagPaletteCss();

  it("defines every tag in all three blocks", () => {
    for (const c of BLOCK_COLORS) {
      // once in :root, once in .dark, once in the print block
      const occurrences = css.split(`--tag-${c.id}:`).length - 1;
      expect(occurrences).toBe(3);
    }
  });

  it("emits each value from BLOCK_COLORS, so the sheet cannot drift", () => {
    for (const c of BLOCK_COLORS) {
      expect(css).toContain(`--tag-${c.id}: ${c.hsl}`);
      expect(css).toContain(`--tag-${c.id}: ${c.hslDark}`);
    }
  });

  it("puts the print block last, so it wins over .dark", () => {
    // :root and .dark have equal specificity, so order decides. If the print
    // block is ever emitted before .dark, dark values reach the printer and
    // the near-black-sheet bug returns silently.
    expect(css.indexOf("@media print")).toBeGreaterThan(css.indexOf(".dark"));
  });

  it("restores the light values inside the print block", () => {
    const printBlock = css.slice(css.indexOf("@media print"));
    for (const c of BLOCK_COLORS) {
      expect(printBlock).toContain(`--tag-${c.id}: ${c.hsl}`);
      expect(printBlock).not.toContain(`--tag-${c.id}: ${c.hslDark}`);
    }
  });
});

describe("buildThemeCss", () => {
  const css = buildThemeCss({ "--primary": "1 2% 3%" }, { "--primary": "4 5% 6%" });

  it("emits light values in :root and dark values in .dark", () => {
    expect(css).toContain(":root");
    expect(css).toContain("--primary: 1 2% 3%");
    expect(css).toContain("--primary: 4 5% 6%");
  });

  it("restores light values for print, and prints last", () => {
    expect(css.indexOf("@media print")).toBeGreaterThan(css.indexOf(".dark"));
    const printBlock = css.slice(css.indexOf("@media print"));
    expect(printBlock).toContain("--primary: 1 2% 3%");
    expect(printBlock).not.toContain("--primary: 4 5% 6%");
  });
});
