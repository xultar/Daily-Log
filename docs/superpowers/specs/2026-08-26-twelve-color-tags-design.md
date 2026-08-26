# Twelve color tags

Date: 2026-08-26
Status: approved

## Summary

Add three color tags, taking the palette from nine to twelve: red, chartreuse
and brown.

Two of the three are new hues. The third is not: the wheel had only two
comfortable gaps left, so brown arrives as a darkened, desaturated orange rather
than as a hue of its own. That is a deliberate one-off, not the start of a
light-and-dark tier system.

Twelve tags exceed the ten available number keys, so the last two display
positions are reachable only by clicking the legend or right-clicking a block.

## Motivation

The 2026-08-24 spec set the ceiling at nine because "the grid binds color
selection to the number keys, and single-digit keys run out at nine". That is a
keyboard limit rather than a palette limit, and it is worth spending to get more
categories. Nine tags is limiting for a term with more than nine things in it.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| How many to add | 3 (twelve total) | The practical ceiling for this palette |
| Which colors | Red 4, chartreuse 95, brown | The only two gaps left, plus one off-hue |
| Keyboard | 1-9 unchanged, 0 selects position 10 | Preserves existing muscle memory |
| Positions 11-12 | No key; picker and legend only | Ten keys, twelve colors |
| Which color gets key 0 | Red | The one reached for fastest |
| Legend layout | Stay at two columns | Twelve is even, so the orphan row goes away |
| Border logic | Extract to a pure function | Its odd-length test goes vacuous at twelve |
| Palette order | Append only, never reorder | Stored block values are array positions |

Rejected alternatives:

- **Indigo at hue 240.** The original third candidate, and the one brown
  replaced. It sits 27 degrees from blue and 30 from lavender, squeezed between
  two neighbours rather than filling a gap, and it separates from both on hue
  alone — which is exactly the separation that disappears in a greyscale print.
- **Shift+digit for positions 10-12.** Gives every tag a key, but needs
  `e.code` rather than `e.key`, because Shift+1 yields an exclamation mark, and
  it is a shortcut nobody discovers without being told. Two picker-only colors
  is the smaller cost.
- **Leaving the keyboard at 1-9 entirely.** Simplest, but it makes all three new
  colors permanently slower to reach than the original nine.
- **Reordering the display order so the new colors take low positions.** Display
  order is free to change without touching stored data, but anyone who types 3
  for green would have to relearn it. Muscle memory is worth more than tidiness.

## The palette

Appended to `BLOCK_COLORS` in `src/lib/planner-data.ts`:

| id | Label | Light HSL | Dark HSL |
| --- | --- | --- | --- |
| 10 | Red | `4 65% 74%` | `4 65% 52%` |
| 11 | Chartreuse | `95 45% 74%` | `95 45% 40%` |
| 12 | Brown | `30 38% 64%` | `30 42% 34%` |

Red sits 24 degrees from the existing pink at 340, which the earlier spec judged
too close. It is included here because the wheel offers nothing better, and it
carries eight points more darkness than pink so the two separate by lightness as
well as by hue.

Chartreuse fills the only comfortable gap: 45 degrees from both yellow at 50 and
green at 140.

Brown is the deliberate exception. At hue 30 it is five degrees from orange at
25, so hue does almost none of the work: the separation is 27 points of
saturation and 14 of lightness. Brown is therefore the darkest and least
saturated entry in the light palette, which is what makes it legible next to
orange at 10px.

That also makes it the only new tag that survives a greyscale print. Two hues at
matched lightness collapse to the same gray; brown and orange do not.

## Data compatibility

No migration. `repairBlockValue` accepts any integer within
`BLOCK_COLORS.length`, so ids 10-12 become valid the moment the entries exist,
and every stored value keeps its meaning because the palette is only appended
to.

Custom labels under `planner-color-labels` are keyed by storage id, so new ids
simply have no entry and fall back to the default label.

The palette must never be reordered. Gray remains storage id 6 whatever its
display position.

## Display order and the keyboard

`COLOR_IDS_IN_DISPLAY_ORDER` becomes:

    [1, 2, 3, 4, 5, 7, 8, 9, 6, 10, 11, 12]

Positions 1-9 are exactly what they are today. Position 10 is red, position 11
chartreuse, position 12 brown.

The keydown handler in `TimeGrid` maps a pressed digit to a display position. It
gains one case: the key `0` means display position 10. Positions 11 and 12 have
no key.

`colorIdForDisplayPosition` returns `number | null`, and `tsconfig.app.json`
sets `strict: false`, so the compiler does not enforce the guard. The `0` branch
must guard exactly as the existing digit branch does. An unguarded `null`
written into `timeBlocks` fails silently in both directions:
`getBlockColor(null)` returns null so the block looks unpainted, and the
truthiness check in `calcDayTotal` skips it so the totals still look right.

The early return already in the handler for `INPUT`, `TEXTAREA` and `SELECT`
targets covers the new key too, but this must be verified rather than assumed.
Pressing `0` while typing a label must insert a zero, not repaint.

## The legend's border logic

`DailyView` decides each legend cell's borders inline:

    const inLastRow = index >= shown.length - (shown.length % 2 || 2);
    const hasCellToTheRight = index % 2 === 0 && index + 1 < shown.length;

Nine entries in two columns leave a lone cell in the last row, and
`legend-borders.test.tsx` pins that case. Twelve is even, so the lone cell stops
existing: the test named "puts no right border on the lone cell of the final
row" keeps passing while asserting nothing, because its subject is no longer
rendered. A test that goes vacuous is worse than one that fails, because nothing
announces it.

The odd-length behaviour still has to be correct for the next palette change, so
the decision moves out of the JSX into a pure function in `planner-data.ts`:

    legendCellBorders(index: number, count: number): { bottom: boolean; right: boolean }

**`true` means draw that border.** The inline expressions say the opposite —
`inLastRow` means suppress the bottom one — and carrying that inversion into a
named function is how it gets implemented backwards. The function is phrased
positively; `DailyView` adds the class when the field is true.

It lives in `planner-data.ts` beside `getPaletteInDisplayOrder`, which is the
other function that exists solely to present the palette.

The existing rendering tests stay, re-pointed at the new cell markup; new unit
tests exercise the function at odd and even counts without depending on the live
palette's length.

## Print

`TimeGrid` stamps `data-tag={displayPositionForColorId(val)}` on the first block
of each run, which the print stylesheet reveals as the tag number so a mono
laser print stays readable. Positions 10, 11 and 12 are the first two-digit
values this has ever carried, inside a 10px block.

This needs a print check rather than an assumption. If two digits do not fit,
the print rule's font size is the thing to change, not the numbering.

## Changes

### 1. `src/lib/planner-data.ts`

Append the three palette entries. Extend `COLOR_IDS_IN_DISPLAY_ORDER`. Add
`legendCellBorders`.

### 2. `src/components/planner/TimeGrid.tsx`

Map `0` to display position 10, guarding the null exactly as the digit branch
does.

### 3. `src/components/planner/DailyView.tsx`

Consume `legendCellBorders` instead of computing borders inline. Update the hint
line, which reads "Press 1-9 to switch color", to name the new key.

## Components that need no change

- `src/lib/tag-palette.ts` generates the `--tag-N` custom properties for light,
  dark and print by mapping over `BLOCK_COLORS`, so the new tokens appear on
  their own. Its tests iterate the palette and extend with it.
- `ColorPicker` derives its width from `COLOR_IDS_IN_DISPLAY_ORDER.length + 1`.
  Thirteen buttons come to 374px, still a single row, and the existing viewport
  clamp handles placement.
- `getBlockColor`, `getBlockTint` and `displayPositionForColorId` all index the
  palette generically.
- `WeeklyColorLegend` iterates the palette in display order and grows on its own.
- `MonthlyView` shades by total minutes, not by color.

## Testing

- Palette ids remain unique and sequential from 1. The existing test extends.
- `COLOR_IDS_IN_DISPLAY_ORDER` remains a permutation of the palette ids: same
  length, no duplicates, nothing missing. This is the one failure mode that
  would otherwise leave the build green while dropping a color from the UI.
- `getBlockColor` returns the expected token for ids 10-12, and still returns
  null for 13.
- Pressing `0` selects display position 10, and pressing `0` inside an input
  does not repaint.
- `legendCellBorders` at an odd count and an even count, covering the lone-cell
  case the live palette no longer produces.
- Every new test is mutation-tested: break the line it defends and confirm that
  test, and not merely some test, fails.

Visual verification, in the browser at the grid's real 10px size, in both light
and dark:

- red against pink,
- brown against orange,
- chartreuse against yellow and green,
- a print preview showing a two-digit run label.

## Out of scope

- Any thirteenth color. Hue is exhausted, so a thirteenth would mean committing
  to the light-and-dark tier system that brown deliberately stops short of.
- Editing color labels from the weekly strip, and the restructure of the
  `<input>` nested inside a `<button>` in the daily legend. Both are wanted,
  both are separate, and the legend restructure should be designed against
  twelve cells rather than nine.
- Colorblind-safe patterning of blocks.
- User-defined colors beyond the editable text labels that already exist.

## Risks

**Twelve tags is worse for colorblind users than nine.** Each addition narrows
the gaps that remain, and red against green is the classic confusion. The print
run-numbers mitigate this on paper; nothing mitigates it on screen. Accepted
rather than solved, and recorded here so the next palette request can weigh it.

**Red against pink.** Rejected on these grounds in the 2026-08-24 spec, accepted
now because the alternative is not expanding at all, and gated on the visual
check above rather than on this document's confidence.

**Brown against orange at 10px.** Brown carries almost no hue separation, so if
the saturation and lightness gap proves too subtle at block size the fix is to
widen that gap rather than to move the hue — moving it toward yellow would run
into chartreuse.

**The vacuous test.** Twelve entries silently retire an assertion. Extracting
`legendCellBorders` is what keeps the odd-length behaviour pinned. Without it,
the palette could return to an odd length years from now with nothing defending
the lone cell.

**The null guard on key 0.** With `strict: false` the compiler will not catch a
missing guard, and the resulting failure is invisible in both directions.
