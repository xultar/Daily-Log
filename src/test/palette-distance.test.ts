import { describe, it, expect } from "vitest";
import { BLOCK_COLORS } from "@/lib/palette";
import { deltaE, hslToRgb, parseHsl } from "./color-distance";

/**
 * A ratchet on how alike any two tags are allowed to look.
 *
 * Twelve tags is where hue ran out, and every further addition narrows the gaps
 * that remain. This turns that from a judgement someone makes once, in a
 * browser, into something the suite checks on every run — because the last time
 * it was a judgement, chartreuse went in at hue 95 and measured twice as close
 * to green as to yellow.
 *
 * The floors are the palette as it stands, rounded down. Raise them when the
 * palette improves; do not lower them to make a new colour fit. A colour that
 * cannot clear the floor is a colour the palette has no room for.
 */

const scheme = (mode: "light" | "dark") => (c: (typeof BLOCK_COLORS)[number]) =>
  mode === "light" ? c.hsl : c.hslDark;

function worstPair(mode: "light" | "dark") {
  const of = scheme(mode);
  let worst = { pair: "", dE: Infinity };
  for (let i = 0; i < BLOCK_COLORS.length; i++) {
    for (let j = i + 1; j < BLOCK_COLORS.length; j++) {
      const dE = deltaE(of(BLOCK_COLORS[i]), of(BLOCK_COLORS[j]));
      if (dE < worst.dE) {
        worst = { pair: `${BLOCK_COLORS[i].label}/${BLOCK_COLORS[j].label}`, dE };
      }
    }
  }
  return worst;
}

describe("the measuring instrument", () => {
  // An untested ruler measures nothing. These pin the conversion itself, so a
  // silent arithmetic error cannot quietly report that every colour is fine.

  it("reports no distance between a colour and itself", () => {
    expect(deltaE("213 60% 80%", "213 60% 80%")).toBe(0);
  });

  it("puts black and white about 100 apart, which is the range of L*", () => {
    expect(deltaE("0 0% 0%", "0 0% 100%")).toBeCloseTo(100, 0);
  });

  it("converts the ends of the lightness axis exactly", () => {
    expect(hslToRgb("0 0% 0%")).toEqual([0, 0, 0]);
    expect(hslToRgb("0 0% 100%")).toEqual([255, 255, 255]);
    expect(hslToRgb("0 100% 50%")).toEqual([255, 0, 0]);
    expect(hslToRgb("120 100% 50%")).toEqual([0, 255, 0]);
  });

  it("refuses a string that is not an HSL triple", () => {
    // A malformed palette entry must fail loudly here rather than silently
    // measuring as black and making everything look well separated.
    expect(() => parseHsl("213 60%")).toThrow();
    expect(() => parseHsl("rebeccapurple")).toThrow();
  });
});

describe("every palette entry is a usable colour", () => {
  it("parses in both themes", () => {
    for (const c of BLOCK_COLORS) {
      expect(() => parseHsl(c.hsl), `${c.label} light`).not.toThrow();
      expect(() => parseHsl(c.hslDark), `${c.label} dark`).not.toThrow();
    }
  });
});

describe("no two tags may look too alike", () => {
  // Light is roughly three times tighter than dark throughout, so the two
  // floors are far apart. A colour that survives light will survive dark; the
  // reverse does not hold, which is why light is the one to judge first.
  // Raised from 7.5/21.5 when magenta moved. Lavender/Magenta was the tightest
  // pair in the palette and separated on hue alone — identical saturation and
  // lightness, 35 degrees apart in a region where that buys very little.
  //
  // Magenta moved rather than lavender because lavender is a system colour
  // elsewhere in the user's setup, and because magenta was the one squeezed
  // between two neighbours: lavender at 270 on one side, pink at 340 on the
  // other, 35 degrees to each.
  //
  // Both floors are now set by other pairs — Orange/Brown in light,
  // Green/Chartreuse in dark — which is the point. No pair should be the
  // obvious weakest link.
  const LIGHT_FLOOR = 12.0;
  const DARK_FLOOR = 23.0;

  it("keeps every light-mode pair above the floor", () => {
    const worst = worstPair("light");
    expect(worst.dE, `closest light pair is ${worst.pair} at ${worst.dE.toFixed(1)}`)
      .toBeGreaterThanOrEqual(LIGHT_FLOOR);
  });

  it("keeps every dark-mode pair above the floor", () => {
    const worst = worstPair("dark");
    expect(worst.dE, `closest dark pair is ${worst.pair} at ${worst.dE.toFixed(1)}`)
      .toBeGreaterThanOrEqual(DARK_FLOOR);
  });
});
