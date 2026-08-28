import { describe, it, expect } from "vitest";
import { BLOCK_COLORS } from "@/lib/palette";
import { deltaEAs, hslToRgb, simulate, Vision } from "./color-distance";

/**
 * What twelve tags cost a colourblind user.
 *
 * CLAUDE.md recorded this as an accepted risk, which was honest but useless:
 * nobody had a number, so nobody could tell whether the next colour made it
 * worse. These tests supply the number and then hold it.
 *
 * The simulation is an approximation and is used only to compare the palette
 * against itself. It says nothing about how any particular person sees.
 */

/** The three dichromacies. "normal" is a Vision but is not a floor to hold. */
type Dichromacy = Exclude<Vision, "normal">;

const VISIONS: Dichromacy[] = ["protanopia", "deuteranopia", "tritanopia"];

function worstPair(mode: "light" | "dark", vision: Vision) {
  let worst = { pair: "", dE: Infinity };
  for (let i = 0; i < BLOCK_COLORS.length; i++) {
    for (let j = i + 1; j < BLOCK_COLORS.length; j++) {
      const a = mode === "light" ? BLOCK_COLORS[i].hsl : BLOCK_COLORS[i].hslDark;
      const b = mode === "light" ? BLOCK_COLORS[j].hsl : BLOCK_COLORS[j].hslDark;
      const dE = deltaEAs(a, b, vision);
      if (dE < worst.dE) worst = { pair: `${BLOCK_COLORS[i].label}/${BLOCK_COLORS[j].label}`, dE };
    }
  }
  return worst;
}

describe("the simulation behaves like a projection", () => {
  // Three properties that must hold if the transform is doing what it claims.
  // Without these, a sign error would quietly report that the palette is fine.

  it("leaves grey alone, because grey does not depend on the missing cone", () => {
    for (const vision of VISIONS) {
      const [r, g, b] = simulate([128, 128, 128], vision);
      expect(r, vision).toBeCloseTo(128, 0);
      expect(g, vision).toBeCloseTo(128, 0);
      expect(b, vision).toBeCloseTo(128, 0);
    }
  });

  it("is idempotent, because a projection has nothing left to remove", () => {
    for (const vision of VISIONS) {
      const once = simulate(hslToRgb("340 55% 82%"), vision);
      const twice = simulate(once, vision);
      once.forEach((v, i) => expect(twice[i], vision).toBeCloseTo(v, 0));
    }
  });

  it("puts red and green on the same axis for the two that lose it", () => {
    // The confusion these forms are named for, stated as the property that
    // actually holds. This first asserted that overall dE collapses, which is
    // wrong and failed: red simulates to a very dark yellow and green to a
    // bright one, so they stay far apart in *lightness*. A protanope really
    // does still tell them apart by brightness. What vanishes is the hue
    // difference, and that is what to assert.
    for (const vision of ["protanopia", "deuteranopia"] as Vision[]) {
      for (const colour of ["0 100% 50%", "120 100% 50%"]) {
        const [r, g, b] = simulate(hslToRgb(colour), vision);
        expect(r, `${vision} ${colour} r vs g`).toBeCloseTo(g, -1);
        expect(b, `${vision} ${colour} keeps no red-green chroma`).toBeLessThan(r);
      }
    }
  });

  it("collapses blue against green for tritanopia, and not for the others", () => {
    const blue = "240 100% 50%";
    const green = "120 100% 50%";
    const normal = deltaEAs(blue, green, "normal");

    expect(deltaEAs(blue, green, "tritanopia")).toBeLessThan(normal / 2);
    expect(deltaEAs(blue, green, "protanopia")).toBeGreaterThan(normal / 2);
    expect(deltaEAs(blue, green, "deuteranopia")).toBeGreaterThan(normal / 2);
  });
});

describe("twelve tags under colourblindness", () => {
  // A ratchet, not a target. These floors are the palette as it stands, rounded
  // down. They are much lower than the normal-vision floors and that is the
  // finding: a palette this size genuinely does collapse. The job of these
  // numbers is to stop the next colour making it quietly worse.
  // Measured, then rounded down. Compare with 12.1 and 23.5 for normal vision:
  //
  //   protanopia    light  4.2  Gray/Teal        dark  6.7  Blue/Lavender
  //   deuteranopia  light  2.8  Lavender/Magenta dark  6.0  Red/Brown
  //   tritanopia    light  1.1  Blue/Teal        dark  2.4  Magenta/Red
  //
  // Deuteranopia used to read 0.7 Pink/Gray in light: the two were the same
  // colour. Pink moved to 340 65% 76% / 340 65% 48%, which raised it fourfold
  // and left every other vision untouched. Gray stayed put — it is the neutral
  // tag, and a neutral that has to carry a hue to be legible is not neutral.
  //
  // Light now bottoms out at Lavender/Magenta. Going further means moving
  // magenta again, since lavender is a system colour and cannot move.
  //
  // Pink's lightness is load-bearing in a way that is easy to undo: at 54% in
  // dark it drops tritanopia from 2.4 to 0.2. Re-measure before touching it.
  const FLOORS: Record<Dichromacy, { light: number; dark: number }> = {
    protanopia: { light: 4.0, dark: 6.5 },
    deuteranopia: { light: 2.5, dark: 5.5 },
    tritanopia: { light: 1.0, dark: 2.3 },
  };

  for (const vision of VISIONS) {
    it(`keeps light-mode pairs above the ${vision} floor`, () => {
      const worst = worstPair("light", vision);
      expect(worst.dE, `closest ${vision} light pair is ${worst.pair} at ${worst.dE.toFixed(1)}`)
        .toBeGreaterThanOrEqual(FLOORS[vision].light);
    });

    it(`keeps dark-mode pairs above the ${vision} floor`, () => {
      const worst = worstPair("dark", vision);
      expect(worst.dE, `closest ${vision} dark pair is ${worst.pair} at ${worst.dE.toFixed(1)}`)
        .toBeGreaterThanOrEqual(FLOORS[vision].dark);
    });
  }
});
