# Weekly legend and priority row color tags

Date: 2026-08-24
Status: approved

## Summary

Two related features, shipped in sequence.

**Phase 1** adds a color legend to the weekly view as a full-width footer strip,
showing each tag's swatch, display number, label and total minutes for the week.
Clicking an entry arms that color. This requires lifting the active color out of
the individual views up to `StudyPlanner`.

**Phase 2** lets each Priorities / Actions row carry a color tag, rendered as a
solid left stripe plus a faint background wash, so a task visibly belongs to the
same category as the time blocks it maps to.

Phase 1 ships and deploys on its own before Phase 2 begins.

## Motivation

The weekly view renders `TimeGrid` with no legend and no active-color indicator
of any kind. With six colors that was tolerable. At nine it is not: the armed
color is invisible, so the only way to discover it is to paint a block and see
what comes out.

Row color tags close the loop the app is actually for. Today the priority list
and the time grid are unrelated surfaces. Tagging a row connects "draft the
proposal" to the blue blocks that got spent on it.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Legend placement | Full-width footer strip below the day columns | Fits nine entries with readable labels; matches the daily view, where the legend also sits below the grid; sits beside the per-day totals |
| Legend behavior | Click to arm, plus per-week minutes | The one thing a weekly legend can do that the daily one cannot |
| Label editing | Daily view only | Labels are global in `planner-color-labels`; editing them in one place already updates everywhere, and inline inputs in a horizontal strip get cramped |
| Row tag assignment | Left-click stripe applies the armed color, right-click opens the picker | Identical gesture to painting a block; reuses the existing picker |
| Row tag appearance | 3px solid left stripe plus background at 16% opacity | Keeps the "belongs to this color" reading while staying legible across 42 rows in the weekly grid |
| Shared legend component | No — separate components, shared pure functions | The two legends differ in layout, editability and scope; a component covering both would be mostly props |

Rejected alternatives:

- Legend under the sidebar. Costs no horizontal space from the day columns, but
  forces a single cramped column of nine rows and competes with the weekly todo
  list for vertical room.
- Legend as a header strip. More immediately visible, but pushes the grid down
  and separates the legend from the per-day totals.
- Background tint alone for row tags. Closest to the original instinct and
  warmest in the daily view, but 42 washed rows sit directly above the time grid
  and compete with it.
- Rows inheriting the armed color automatically as the user types. Fastest, but
  assigns colors that were never asked for.

## Phase 1 — Lift the active color and add the weekly legend

### The state lift

`DailyView` currently owns `activeColor` via `useState(1)` and passes it to
`TimeGrid` as a controlled prop. `DayColumn` passes nothing, so each of the seven
weekly `TimeGrid`s falls back to its own private `internalColor`.

Move the state to `StudyPlanner` and pass it to both `DailyView` and `DayColumn`,
which forward it to `TimeGrid`. The armed color then persists across a view
switch: arm blue in the daily view, switch to weekly, still blue.

`activeColor` holds a **storage id**, matching `timeBlocks`. It is initialised to
`1`, which is both storage id 1 and display position 1, and must not be routed
through `colorIdForDisplayPosition`.

`TimeGrid`'s `internalColor` fallback stays in place. Nothing will use it once
both call sites are controlled, but removing it would change the component's
contract for no benefit.

### The duplicate listener tradeoff

Each mounted `TimeGrid` registers its own `window` keydown listener. In the
weekly view that means seven listeners, all calling the same setter with the same
value on any digit press. React collapses identical state updates into a single
render, so the cost is negligible.

Consolidating them would mean moving the keyboard handler — including the
modifier guard, the contenteditable and Radix menu guards, and the display
position translation — up to `StudyPlanner`. That logic was hardened and verified
across three review rounds. Reopening it to remove a non-issue is a bad trade.

This is a deliberate decision, not an oversight.

### The legend strip

A new component, `src/components/planner/WeeklyColorLegend.tsx`, rendered by
`StudyPlanner` below the day columns in the weekly branch only.

This requires a small layout change. The weekly branch is currently a single flex
row holding the sidebar and the day columns. A footer strip cannot live inside
that row, so the branch is wrapped in a column-direction container: the existing
flex row becomes the growing child, and the strip sits beneath it as a fixed-height
sibling. The sidebar and columns keep their current sizing.

Each entry shows, horizontally: the swatch, the display position, the label
(custom if set, otherwise the palette's default), and the week's minutes for that
color when non-zero. The armed entry is highlighted the same way the daily legend
highlights it. Clicking an entry arms that color.

Entries iterate `getPaletteInDisplayOrder()`, so gray appears last and the
displayed number is the display position. The value passed back on click is
`c.id`, the storage id.

The strip stays on a single line and scrolls horizontally when it does not fit.
Nine entries at roughly 90px each is about 810px, so at normal widths no scrolling
occurs. Entries must not wrap: a legend that reflows to two rows changes the
weekly view's height as labels are edited, and a one-line strip reads as a key
rather than as content.

This means the strip is its own horizontal scroll region, independent of the day
columns' existing horizontal scroll. The two scroll separately and that is
intended — scrolling the columns must not move the legend, since the legend is a
fixed reference.

### Why not a shared legend component

The daily legend is a two-column grid with editable label inputs and per-day
minutes. The weekly strip is a single horizontal row with read-only labels and
per-week minutes. A component serving both would take layout, editability and
scope as props and branch internally on all three.

Instead the genuinely shared logic moves into `planner-data.ts` as pure
functions, and each view keeps its own markup. The duplication is a few lines of
JSX; the coupling avoided is worse than the duplication accepted.

### New pure functions

In `src/lib/planner-data.ts`:

- `calcDayColorMinutes(day: DayData): Record<number, number>` — minutes per
  storage id for one day. `DailyView` currently computes this inline in the
  component body; that loop is deleted and the view calls this function instead.
  This is a required change to `DailyView`, not an optional cleanup — the daily
  legend's per-color minutes must keep working and must come from one
  implementation.
- `calcWeekColorMinutes(week: WeekData): Record<number, number>` — the same
  across all seven days, summing the per-day results.
- `formatMinutes(totalMinutes: number): string` — renders a duration as `40m`,
  `2h` or `2h 30m`. Both legends display durations, and `DailyView` currently
  does it with nested ternaries inline in the JSX. Extracting it avoids a second
  copy in the strip. This corrects one visible detail: a whole-hour total
  previously rendered as `2h ` with a trailing space and now renders as `2h`.

The two minute functions key their result by storage id.

## Phase 2 — Priority row color tags

### Schema

`SubjectRow` gains one optional field:

    export interface SubjectRow {
      subject: string;
      checked: boolean;
      colorId?: number;
    }

`colorId` holds a **storage id**, the same contract as `timeBlocks` and
`planner-color-labels`. It is never a display position.

The field is optional and additive. Rows saved before this change parse with
`colorId` undefined and render untagged. No migration is required, and
`createEmptyDay` does not need to set it.

### Interaction

The stripe zone at each row's left edge is the control.

- **Left-click** applies the currently armed color. Left-clicking a row that
  already carries that color clears it, mirroring how clicking a filled time
  block clears it.
- **Right-click** opens the color picker, including its clear button.

The visible stripe is 3px. The clickable zone is padded to roughly 10px so it
remains a usable target in a 100px-wide weekly column.

### Extracting the picker

The color picker currently lives inline inside `TimeGrid.tsx` as local state plus
JSX. Phase 2 extracts it to `src/components/planner/ColorPicker.tsx` so both the
time grid and the priority rows can open it.

The extraction must preserve, unchanged, everything the picker gained during the
color-tag work: the viewport clamp on `x` and `y`, the display-position numbering,
the `aria-label` on each swatch, the clear button rendered last, and the
outside-click close behavior.

This is the highest-risk part of Phase 2. It moves recently hardened code.

### Rendering

A new helper in `planner-data.ts`:

    export function getBlockTint(value: number, isDark: boolean): string | null

Returns `hsl(${c.hsl} / 0.16)` in light mode and the `hslDark` equivalent in dark
mode, or `null` for `0` and out-of-range values. The palette stores bare HSL
triples, so the alpha form is direct interpolation.

Rows render the stripe with `getBlockColor` and the background with
`getBlockTint`. An untagged row renders a transparent stripe of the same width so
rows do not shift horizontally when tagged.

Applies to the rows in both `DailyView` and `DayColumn`.

## Data compatibility

Phase 1 changes no persisted data.

Phase 2 adds one optional field to a persisted structure. Because it is optional,
old data loads correctly and new data is ignored by any older build. `loadWeek`
JSON-parses without validation, so neither direction throws.

The `colorId` value is a storage id. Every rule established for the palette
applies to it unchanged: `BLOCK_COLORS` stays append-only, and display position
appears only in rendering.

## Testing

Phase 1:

- `calcDayColorMinutes` returns the correct per-id totals for a day with mixed
  colors, and an empty object for an empty day.
- `calcWeekColorMinutes` sums across days, including a week where one color
  appears on several days and another on none.
- Both key by storage id, verified by tagging blocks with the id whose display
  position differs from it — gray, storage 6, display 9.

Phase 2:

- `getBlockTint` returns the 16% alpha form for every id in both themes, and
  `null` for `0` and for out-of-range values.
- A `SubjectRow` with `colorId` survives a save and load round trip with the id
  unchanged.
- A `SubjectRow` without `colorId` loads without error and reports untagged.

Manual verification for both phases follows the pattern established for the color
tags: paint, reload, and confirm the stored values are storage ids.

## Out of scope

- Consolidating the seven weekly keydown listeners. Deliberate, reasoned above.
- Editing color labels from the weekly strip.
- Filtering or sorting priority rows by color tag.
- Showing color tags in the monthly view.
- The `<input>` nested inside `<button>` in the daily legend, which is
  pre-existing and needs a real restructure.
- The doubled bottom border on the daily legend's final row.

## Risks

The main risk is Phase 2's picker extraction moving hardened code. The mitigation
is that the picker's behaviors are enumerated above and each is re-verified after
the move, rather than assumed to have survived.

The second risk is the two-identifier split extending to a new field. `colorId`
joins `timeBlocks` and the label record as storage-id-keyed state, and a mistake
there writes wrong values into saved weeks. The mitigation is unchanged: display
position appears only in rendering, and translation happens only in
`colorIdForDisplayPosition`.
