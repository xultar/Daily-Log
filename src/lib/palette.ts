import { readItem, writeItem } from "./storage";

/**
 * The colour palette, and the one rule in this repo that can corrupt user data.
 *
 * Two numbers here both look like "the colour number". A **storage id** is the
 * 1-based position in BLOCK_COLORS and is what gets persisted. A **display
 * position** is the 1-based position in COLOR_IDS_IN_DISPLAY_ORDER and is what
 * the user sees beside a swatch. They differ for four of the twelve colours,
 * and confusing them writes wrong values into weeks people have already
 * planned. colorIdForDisplayPosition is the only place the two are translated.
 *
 * Split out of planner-data.ts on 2026-08-28. Nothing here touches week shape,
 * storage of weeks, or repair — which is what made it the cleanest cut
 * available, and why it must not start doing so.
 */

export interface BlockColor {
  id: number;
  label: string;
  hsl: string;
  hslDark: string;
}

/**
 * Block color palette. A stored block value is this array's 1-based index, so
 * entries may only be APPENDED — never reordered or removed, or every saved
 * week that used a moved color is silently repainted.
 * To change how the palette is presented, edit COLOR_IDS_IN_DISPLAY_ORDER instead.
 * Index 0 = empty.
 */
export const BLOCK_COLORS: readonly BlockColor[] = [
  { id: 1, label: "Blue",     hsl: "213 60% 80%",  hslDark: "213 60% 52%" },
  { id: 2, label: "Pink",     hsl: "340 65% 76%",  hslDark: "340 65% 48%" },
  { id: 3, label: "Green",    hsl: "140 35% 75%",  hslDark: "140 40% 42%" },
  { id: 4, label: "Lavender", hsl: "270 40% 80%",  hslDark: "270 45% 64%" },
  { id: 5, label: "Orange",   hsl: "25 65% 78%",   hslDark: "25 70% 50%" },
  { id: 6, label: "Gray",     hsl: "0 0% 78%",     hslDark: "0 0% 46%" },
  { id: 7, label: "Yellow",   hsl: "50 70% 76%",   hslDark: "50 70% 58%" },
  { id: 8, label: "Teal",     hsl: "178 40% 74%",  hslDark: "178 45% 38%" },
  { id: 9, label: "Magenta",  hsl: "305 45% 76%",  hslDark: "305 45% 52%" },
  { id: 10, label: "Red",        hsl: "4 65% 74%",   hslDark: "4 65% 52%" },
  { id: 11, label: "Chartreuse", hsl: "85 45% 74%",  hslDark: "85 45% 40%" },
  // Brown is five degrees from orange, so hue does almost none of the work
  // here: the separation is 27 points of saturation and 14 of lightness. That
  // makes it the only tag added in this batch that survives a greyscale print,
  // where two hues at matched lightness collapse to the same grey.
  { id: 12, label: "Brown",      hsl: "30 38% 64%",  hslDark: "30 42% 34%" },
];

/** Row wash opacity. Spec-fixed at 16%, tuned to stay legible across 42 weekly rows. */
const ROW_TINT_ALPHA = 0.16;

/** Resolve a storage id to its CSS variable reference. 0, undefined and out-of-range yield null. */
function blockVar(value: number | undefined): string | null {
  if (!value) return null;
  const color = BLOCK_COLORS[value - 1];
  if (!color) return null;
  return `var(--tag-${color.id})`;
}

/**
 * The block's paint colour, as a variable reference rather than a literal.
 *
 * The caller no longer says which scheme it wants, because the cascade decides:
 * :root is light, .dark is dark, and @media print restores light. That is what
 * stopped an OS-dark machine from sending dark values to the printer — this
 * function used to take an isDark argument, and printing never changed it.
 *
 * The variable is keyed by storage id, because that is what a painted block
 * holds. See tag-palette.ts for where the values come from.
 */
export function getBlockColor(value: number | undefined): string | null {
  const ref = blockVar(value);
  return ref ? `hsl(${ref})` : null;
}

/**
 * A translucent wash of a tag's colour. Same storage-id contract as
 * getBlockColor: index 0 and out-of-range values yield null.
 *
 * The default is the faint wash behind a tagged row. The month view passes its
 * own alpha, because there the strength of the wash is carrying a second piece
 * of information — how much time the day took — on top of which tag it was.
 * Taking alpha as a parameter keeps the range check in one place rather than
 * having a caller build the string itself.
 */
export function getBlockTint(
  value: number | undefined,
  alpha: number = ROW_TINT_ALPHA
): string | null {
  const ref = blockVar(value);
  return ref ? `hsl(${ref} / ${alpha})` : null;
}

/**
 * Presentation order for the palette, listed by storage id.
 * Storage ids are positions in BLOCK_COLORS and must never move; reorder this
 * list instead. Gray sits last here while keeping storage id 6.
 */
// Positions 1-9 are exactly what they were. Gray stays at position 9 even
// though three chromatic colours now follow it, because moving it would change
// what the 9 key selects, and muscle memory is worth more than a tidy
// ordering. Positions 11 and 12 have no key: the palette outran the number row.
export const COLOR_IDS_IN_DISPLAY_ORDER: readonly number[] = [
  1, 2, 3, 4, 5, 7, 8, 9, 6, 10, 11, 12,
];

/** The palette in the order it should be shown to the user. */
export function getPaletteInDisplayOrder(): BlockColor[] {
  return COLOR_IDS_IN_DISPLAY_ORDER.map((id) => BLOCK_COLORS[id - 1]);
}

/**
 * Which grid lines a legend cell draws in a two-column grid inside a bordered
 * container. True means draw it.
 *
 * The container draws the outer edges, so a cell adds a line only where the
 * grid itself needs one: nothing along the bottom of the final row, where the
 * container's own border already sits, and nothing to the right of a cell that
 * has no neighbour — which is every odd index, and the lone cell of a final
 * odd row, where a right border stubs into the empty half.
 *
 * `count` is a parameter rather than read from the palette so the odd-length
 * case stays testable now that the palette itself is even. That case is not
 * hypothetical: it was the live behaviour until the palette grew to twelve.
 */
export function legendCellBorders(
  index: number,
  count: number
): { bottom: boolean; right: boolean } {
  const lastRowStart = count - (count % 2 || 2);
  return {
    bottom: index < lastRowStart,
    right: index % 2 === 0 && index + 1 < count,
  };
}

/**
 * Translate a 1-based display position (what the user sees and types) into the
 * storage id written to timeBlocks. Position 0, non-integers, and anything
 * outside the palette all miss the array and yield null. Callers must check
 * for null themselves: strictNullChecks is off in this project, so nothing
 * stops a caller from assigning the result straight to a number and writing
 * that null into timeBlocks, which persists to localStorage.
 */
export function colorIdForDisplayPosition(position: number): number | null {
  return COLOR_IDS_IN_DISPLAY_ORDER[position - 1] ?? null;
}

/**
 * The number to show the user for a storage id — the inverse of
 * colorIdForDisplayPosition, and the other half of the same translation.
 *
 * Printing the storage id instead would label a block 6 that the legend calls
 * 9, for the four colours where the two differ.
 */
export function displayPositionForColorId(id: number): number | null {
  const index = COLOR_IDS_IN_DISPLAY_ORDER.indexOf(id);
  return index === -1 ? null : index + 1;
}

/**
 * Whether this block begins an unbroken run of one tag within its hour row.
 *
 * Only the first block of a run prints its number, so a full hour of one tag
 * prints one digit rather than six. Runs do not cross hour rows, because each
 * row is rendered separately — a two-hour block prints one digit per hour,
 * which reads correctly on the sheet.
 */
export function isTagRunStart(hourBlocks: number[] | undefined, blockIdx: number): boolean {
  const value = hourBlocks?.[blockIdx] ?? 0;
  if (!value) return false;
  const previous = blockIdx === 0 ? 0 : hourBlocks?.[blockIdx - 1] ?? 0;
  return value !== previous;
}

const COLOR_LABELS_KEY = "planner-color-labels";

export function loadColorLabels(): Record<number, string> {
  const stored = readItem(COLOR_LABELS_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

export function saveColorLabels(labels: Record<number, string>): boolean {
  return writeItem(COLOR_LABELS_KEY, JSON.stringify(labels));
}
