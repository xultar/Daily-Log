# Additional color tags

Date: 2026-08-24
Status: approved

## Summary

Add three color tags to the planner's time-block palette, taking it from six to
nine. The new tags are yellow, teal and magenta, chosen to fill the widest empty
stretches of the hue wheel so all nine stay distinguishable at the grid's 10px
block size.

## Motivation

`BLOCK_COLORS` currently offers six tags. Six categories is limiting for a full
week of time blocking. Nine is the practical ceiling for this UI because the
grid binds color selection to the number keys, and single-digit keys run out at
nine.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| How many to add | 3 (nine total) | Keeps every tag on a single number key |
| Which hues | Yellow 50, teal 178, magenta 305 | Widest gaps between existing hues |
| Legend layout | Stay at two columns | Three columns truncates the editable labels |
| Palette order | Append only, never reorder | Stored block values are array positions |
| Display order | Separate from storage order, gray last | Keeps the UI tidy without touching saved data |

Rejected alternatives:

- Adding red (hue 4) instead of magenta. Red reads as "urgent" and is
  semantically useful, but it sits 24 degrees from the existing pink at 340 and
  the two blur together at 10px.
- Adding indigo (hue 240). Same proximity problem against the existing blue at
  213.
- A three-column legend. Fits nine evenly with no orphan row, but each label
  field loses about a third of its width.

## The palette

New entries, appended to `BLOCK_COLORS` in `src/lib/planner-data.ts`:

| id | Label | Light HSL | Dark HSL |
| --- | --- | --- | --- |
| 7 | Yellow | `50 70% 76%` | `50 55% 38%` |
| 8 | Teal | `178 40% 74%` | `178 35% 36%` |
| 9 | Magenta | `305 40% 80%` | `305 35% 42%` |

Lightness and saturation follow the existing entries: roughly 76-82% lightness
for light mode and 36-44% for dark.

## Data compatibility

Time blocks are stored in localStorage as `number[][]`, where each number is an
index into the palette resolved by `getBlockColor()` as `BLOCK_COLORS[value - 1]`.

Appending is therefore safe: every existing value keeps its meaning, and no
migration is required.

The palette must never be reordered. Gray currently sits at id 6, which reads
oddly once three chromatic colors follow it, but moving it would silently
repaint every saved week that used gray. Order is a data contract.

Display order is handled separately. See the next section.

Custom labels are stored separately under `planner-color-labels` as a
`Record<number, string>` keyed by id. New ids simply have no entry, and the
legend already falls back to `colorLabels[c.id] ?? ""`.

## Display order

Gray at id 6 sits awkwardly in the middle once three chromatic colors follow it.
Rather than reorder the palette, which would corrupt saved data, the UI gets its
own ordering that never touches storage.

A `PALETTE_ORDER` constant lists color ids in the order they should appear:

    [1, 2, 3, 4, 5, 7, 8, 9, 6]

Blue, pink, green, lavender and orange keep their existing positions, the three
new chromatic colors follow, and gray moves to the end.

The number shown beside each swatch must come from the display position, not
from the id. If the legend kept printing ids it would read 1, 2, 3, 4, 5, 7, 8,
9, 6, which defeats the point of reordering. So position 6 in the list displays
as "6" and selects yellow, whose stored id is 7.

This means the palette has two distinct identifiers, and the distinction must be
kept straight:

- The **storage id** is what goes into `timeBlocks` and keys `planner-color-labels`.
  It never changes.
- The **display position** is what the user sees and what the number keys select.
  It may be reordered freely.

Every user-facing surface uses display position. Every persisted value uses
storage id. The translation happens in exactly one place, a helper in
`planner-data.ts`, so no component does the mapping by hand.

## Changes

### 1. `src/lib/planner-data.ts`

Append the three entries above to `BLOCK_COLORS`.

Update two stale comments that name the old count:

- `DayData.timeBlocks`, which reads `0=empty, 1-6=color index`, should describe
  the range in terms of the palette rather than a fixed number.
- The doc comment above `BLOCK_COLORS`, which reads `index 1-6 maps to these HSL
  values`, likewise.

Add a comment on `BLOCK_COLORS` stating that entries may only be appended and
never reordered, because stored block values are array positions. This is the
documented guard referenced under Risks. The comment should point at
`PALETTE_ORDER` as the supported way to change how the palette is presented.

Add `PALETTE_ORDER`, the id list described above, and a helper that returns the
palette entries in display order. Components consume the helper rather than
sorting for themselves.

### 2. `src/components/planner/TimeGrid.tsx`

The keyboard handler hardcodes the palette length:

    if (num >= 1 && num <= 6) {

Derive the range from the palette instead, so future palette changes need only
the data edit. This is the one structural fix in the change: the palette is
defined in one place but its length is duplicated in another.

The pressed number is now a display position, not an id. Key N selects the color
at `PALETTE_ORDER[N - 1]`. Pressing 9 selects gray.

The right-click picker iterates the palette in display order and labels each
swatch with its display position rather than its id.

The handler's existing guard, which returns early when the event target is an
`INPUT` or `TEXTAREA`, already prevents keys 7-9 from firing while the user is
typing a category label. No change needed there, but it must be verified rather
than assumed.

### 3. `src/components/planner/DailyView.tsx`

The legend is a two-column grid. With nine tags the ninth sits alone on a fifth
row and its trailing right border reads as a broken cell. Suppress the right
border on the last item in the list, so the lone ninth cell reads as intentional.

The legend iterates the palette in display order and shows the display position
beside each swatch. The editable label input remains keyed by storage id, so
labels a user has already typed stay attached to their color.

## Components that need no change

- `getBlockColor()` already indexes the palette generically.
- The right-click color picker maps over `BLOCK_COLORS` and grows on its own,
  from seven buttons to ten. At roughly 26px per button that is about 260px
  wide, which still fits as a single row.
- The legend's per-color minute totals are computed by id and pick up new ids
  automatically.
- `MonthlyView` shades days by total minutes, not by color, so it is unaffected.

## Testing

The project has effectively no coverage today, only a placeholder test. This
change is a cheap place to add real tests, all against `src/lib/planner-data.ts`:

- `getBlockColor(0, ...)` returns `null`.
- `getBlockColor(n, ...)` returns the expected HSL string for every id 1 through
  9, in both light and dark mode.
- `getBlockColor(10, ...)` returns `null` rather than throwing, so an
  out-of-range value in stored data degrades to an unpainted block instead of
  crashing the grid.
- `BLOCK_COLORS` ids are unique and sequential starting at 1. This guards the
  id-to-index relationship that the storage format depends on.
- `PALETTE_ORDER` is a permutation of the palette ids: same length, no
  duplicates, nothing missing. A typo here would drop a color from the UI or
  show one twice while leaving stored data untouched and the build green, so
  this is the one failure mode nothing else would catch.

## Out of scope

- Reordering `BLOCK_COLORS` itself. Gray moves to the end of the *display*
  order only; its storage id stays 6.
- User-defined custom colors beyond the editable text labels that already exist.
- Any change to the monthly view's intensity shading.
- The ten remaining `react-refresh` lint warnings in vendored shadcn/ui files.

## Risks

The main risk is a future contributor reordering `BLOCK_COLORS` for aesthetic
reasons and silently corrupting saved weeks. The test asserting sequential ids
does not catch reordering on its own, so the constraint is documented as a
comment on the palette itself, pointing at `PALETTE_ORDER` as the supported
alternative.

The second risk is the two-identifier split. A component that reads `c.id` where
it means display position, or the reverse, produces a bug that looks cosmetic
but writes wrong values into storage. Confining the translation to one helper in
`planner-data.ts` is the mitigation.
