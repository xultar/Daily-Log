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

export type Vision = "normal" | "protanopia" | "deuteranopia" | "tritanopia";

// Viénot, Brettel and Mollon (1999), in the form that is applied to
// gamma-encoded RGB. Dichromacy is modelled as a projection: the three cone
// responses collapse onto a plane, so two colours that differ only along the
// lost axis become the same colour.
const TO_LMS = [
  [17.8824, 43.5161, 4.11935],
  [3.45565, 27.1554, 3.86714],
  [0.0299566, 0.184309, 1.46709],
];
const FROM_LMS = [
  [0.0809444479, -0.130504409, 0.116721066],
  [-0.0102485335, 0.0540193266, -0.113614708],
  [-0.000365296938, -0.00412161469, 0.693511405],
];

const apply = (m: number[][], [x, y, z]: number[]): [number, number, number] => [
  m[0][0] * x + m[0][1] * y + m[0][2] * z,
  m[1][0] * x + m[1][1] * y + m[1][2] * z,
  m[2][0] * x + m[2][1] * y + m[2][2] * z,
];

/**
 * How a colour looks to a dichromat.
 *
 * An approximation, and treated as one: it is used to compare the palette
 * against itself over time, not to make claims about any individual's vision.
 * What it is good for is noticing that two tags which look distinct to us have
 * collapsed into each other.
 */
export function simulate(rgb: [number, number, number], vision: Vision): [number, number, number] {
  if (vision === "normal") return rgb;
  const [L, M, S] = apply(TO_LMS, rgb);
  const lms: [number, number, number] =
    vision === "protanopia" ? [2.02344 * M - 2.52581 * S, M, S] :
    vision === "deuteranopia" ? [L, 0.494207 * L + 1.24827 * S, S] :
    [L, M, -0.395913 * L + 0.801109 * M];
  return apply(FROM_LMS, lms).map((v) => Math.max(0, Math.min(255, v))) as [number, number, number];
}

/** CIE76 difference as a dichromat would see it. */
export function deltaEAs(a: string, b: string, vision: Vision): number {
  const [l1, a1, b1] = toLab(simulate(hslToRgb(a), vision));
  const [l2, a2, b2] = toLab(simulate(hslToRgb(b), vision));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
