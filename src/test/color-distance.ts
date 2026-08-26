/**
 * Perceptual distance between two palette colours, computed from the HSL
 * strings in BLOCK_COLORS. No browser needed: these are plain strings, so the
 * whole calculation is arithmetic.
 *
 * This exists because hue degrees are a bad proxy for how different two colours
 * look. Chartreuse was once placed at hue 95 on the reasoning that it sat 45
 * degrees from both yellow and green, and it measured twice as close to green
 * as to yellow — the yellow-green region is perceptually compressed. Degrees
 * are evenly spaced; perception is not.
 *
 * CIE76 rather than CIEDE2000. It overstates differences among saturated
 * colours, so it is a screening tool rather than a verdict — but it ranks pairs
 * well enough to catch a colour placed somewhere it should not be, which is the
 * job.
 */

/** Tailwind-style triples: "213 60% 80%". */
export function parseHsl(value: string): { h: number; s: number; l: number } {
  const m = value.trim().match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) throw new Error(`Not an HSL triple: ${JSON.stringify(value)}`);
  return { h: Number(m[1]), s: Number(m[2]) / 100, l: Number(m[3]) / 100 };
}

export function hslToRgb(value: string): [number, number, number] {
  const { h, s, l } = parseHsl(value);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] :
    hp < 2 ? [x, c, 0] :
    hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] :
    hp < 5 ? [x, 0, c] :
             [c, 0, x];
  const m = l - c / 2;
  return [r1 + m, g1 + m, b1 + m].map((v) => Math.round(v * 255)) as [number, number, number];
}

function toLab([r, g, b]: [number, number, number]): [number, number, number] {
  const lin = (v: number) => {
    const n = v / 255;
    return n > 0.04045 ? Math.pow((n + 0.055) / 1.055, 2.4) : n / 12.92;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  // sRGB to XYZ, D65, then normalised by the white point.
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** CIE76 colour difference between two HSL triples. */
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = toLab(hslToRgb(a));
  const [l2, a2, b2] = toLab(hslToRgb(b));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
