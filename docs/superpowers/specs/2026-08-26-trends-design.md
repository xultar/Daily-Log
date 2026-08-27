# Time across months

Date: 2026-08-26
Status: approved

## Summary

A toolbar button opens a dialog showing the last twelve months as a small table:
one row per colour tag, one bar per month, scaled to that tag's own busiest
month, with the tag's total for the span printed at the end of the row. It reads
as "Thesis rising, Teaching falling" — the shape of a year, which the month
report cannot show because it only ever covers one month.

## Motivation

Time reporting shipped for a single month. `TimeByTag` answers how *much* went
to each tag over the range the month view is displaying, and answers it well,
but it cannot look past that month. The question it leaves unanswered is the
one a planner is kept for: is the thing I care about growing or shrinking.

The data layer for this already exists. `totalsByTag(from, to)` takes a range
rather than a month precisely so that "which span to show stays the caller's
decision", so trends is a rendering problem with a small aggregation in front of
it, not a new data model.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Surface | A dialog from the toolbar | Reachable from any view rather than only the month you are on, and it costs the month view no height |
| Shape | One row per tag, one bar per month | Answers "is this rising" per goal. A stacked bar per month answers composition instead, which is a different question |
| Scale | Per row, to that tag's own busiest month | A global scale flattens every small tag into stubs, hiding exactly the trend this exists to show |
| Magnitude | The row's total for the span, printed | What per-row scaling hides, stated in words. `TimeByTag` already ends every bar row with `formatMinutes` |
| Span | Twelve months back from today | Answers "the shape over a year" with no controls to build and no state to hold |
| Aggregation | One pass over stored days, bucketed by month | Twelve `totalsByTag` calls would walk every stored week twelve times |
| Markup | A `<table>` | `scope="col"` and `scope="row"` name the month and the tag for every cell; 144 divs with individual `aria-label`s do the same job worse |
| Charting library | None | Measured against the recharts note's own criteria — no axes, no tooltips, no zoom, no interpolated series |
| Empty span | A sentence, not an empty table | `TimeByTag`'s rule: a frame with no bars reads as something failing to load |

Rejected alternatives:

- **A fourth view mode, "Year".** The most discoverable answer, and the toolbar
  already segments Day / Week / Month. Rejected on cost: it needs the `ViewMode`
  union widened, the navigation chevrons taught what a year step means, print
  CSS, and changes to tests that assume three modes. A dialog gives the same
  information for a fraction of that.
- **Appending it below the month view's report.** No new surface at all, and the
  context is adjacent — but that page already runs calendar, then tag report,
  then hint line, and this is the option the backlog note itself doubted.
- **A stacked bar per month.** Shows what a month consisted of, which is a good
  question and not this one. "Thesis rising" is a per-tag question and wants a
  per-tag row.
- **A line per tag.** Twelve series needs axes to be readable, and several pairs
  of tags in this palette are one colour to a deuteranope, so the lines would
  have to be labelled individually anyway. It is also the shape that would drag
  in a charting library.
- **One global scale across all rows.** Rows become directly comparable, and a
  tall bar always means a lot of time. Rejected because a tag used an hour a
  week collapses to a row of stubs, and its trend — the entire point — vanishes.
- **Twelve `totalsByTag` calls.** Less new code, and correct. Rejected because
  each call walks every stored week, so two years of history would be traversed
  twelve times every time the dialog opens.

## The data

A new `trendsByMonth` in `src/lib/reporting.ts`, beside `totalsByTag` and
`tagHistory`, which are the same family of read.

```ts
export interface TagTrend {
  colorId: number;
  /** Minutes in each month of the span, oldest first. Zero where none. */
  months: number[];
  /** Minutes across the whole span. */
  total: number;
}

export interface Trends {
  /** "yyyy-MM" per column, oldest first. */
  months: string[];
  /** Tags with any time in the span, busiest total first. */
  tags: TagTrend[];
}

export function trendsByMonth(end: Date, monthCount: number): Trends;
```

**One pass.** A single traversal of `eachStoredDay` buckets minutes by
`(month, colorId)`. That iterator was extracted so `totalsByTag` and
`tagHistory` could share the unrepaired-week defending; this is its third
caller, which is the argument for having extracted it.

**A day's column is `date.slice(0, 7)`.** ISO dates group and compare correctly
as strings — the property `totalsByTag`'s range check already depends on — so
no `Date` object is built per day.

**Every row is `monthCount` long.** A month with no time is `0`, not absent, so
the row lines up with the header and the renderer needs no gap handling.

**Tags are rows only if they have time in the span**, sorted by total descending,
matching `totalsByTag`'s "most minutes first, absent rather than zero".

**`totalsByTag` is left exactly as it is.** It takes an arbitrary range rather
than whole months, so it is not a special case of this and cannot be folded into
it. Recording that here because the two look similar enough that a later tidy-up
would try, and the month report's ability to take any two dates would go with it.

## The dialog

`src/components/planner/TrendsDialog.tsx`, opened from a toolbar button
labelled "Time across months".

**The trigger must be rendered after `SearchDialog`.** `carry-bar.test.tsx`
finds the week chevrons positionally as `querySelectorAll("button")[0]` and
`[1]`; a button inserted before them renumbers every one and breaks a file with
nothing to do with this feature.

```
┌─ Time across months ────────────────────────────┐
│ Sep 2025 – Aug 2026                             │
│            S O N D J F M A M J J A     total    │
│ ■ Thesis   ▁ ▁ ▂ ▂ ▃ ▃ ▅ ▅ ▆ ▇ ▇ █       82h    │
│ ■ Teaching █ ▇ ▅ ▃ ▂ ▂ ▁ ▁ ▂ ▁ ▁ ▁       61h    │
│ ■ Admin    ▂ ▃ ▂ ▁ ▂ ▂ █ ▂ ▂ ▃ ▂ ▂        9h    │
└─────────────────────────────────────────────────┘
```

A `<table>`. `<th scope="col">` per month showing its initial, with the full
month name `sr-only` — twelve initials contain three Js and two each of M and A,
so the visible letter is a position marker and the accessible name is the fact.
`<th scope="row">` holds the swatch and the tag's name. Each `<td>` holds a
muted track with a bar at `height: minutes / rowMax`, coloured by
`getBlockColor`, plus `sr-only` text with the value where there is one. The last
cell is the row total via `formatMinutes`.

The name appears on every row beside its swatch, for the reason it does
everywhere else: several pairs in this palette are one colour to a deuteranope,
and every bar is grey in a mono print.

`rowMax` is that row's largest month. A row whose busiest month is 40 hours and
a row whose busiest month is 3 hours both reach full height, which is what makes
both shapes readable and why the total is printed beside them.

**`rowMax` can never be zero**, because a tag only has a row when its total is
above zero, which means at least one month is. The division needs no guard, and
that is a property of the data layer rather than a coincidence — worth stating
so nobody adds a defensive `|| 1` that would silently change the scale if the
row rule ever loosened.

**A month with no time renders the track and no bar**, rather than a bar of zero
height. An element with `height: 0%` still carries its border and rounding, and
twelve of them read as a row of marks that mean nothing.

The visible month initial is `format(month, "LLLLL")` and the accessible name is
`format(month, "LLLL yyyy")`.

The span and the totals are computed when the dialog opens rather than held,
because weeks may have changed since it was last closed, including from another
tab.

**Empty span:** when no tag has time in the twelve months, the table is replaced
by "No time blocked in the last twelve months." rather than drawn empty.

## Changes

| File | Change |
| --- | --- |
| `src/lib/reporting.ts` | `TagTrend`, `Trends`, `trendsByMonth` |
| `src/components/planner/TrendsDialog.tsx` | New — trigger, table, empty state |
| `src/components/planner/StudyPlanner.tsx` | Renders the dialog, after `SearchDialog` |
| `src/test/trends.test.ts` | New — the aggregation |
| `src/test/trends-dialog.test.tsx` | New — the table and the scaling |
| `CLAUDE.md`, `docs/design-notes.md` | Baselines; backlog item 1 replaced by what shipped |

## Testing

`trends.test.ts`:

- A day's minutes land in that day's month.
- Twelve columns ending on the given month, oldest first.
- A month with no time is `0` rather than absent, so every row is the same
  length as `months`.
- A day outside the span is excluded.
- A tag with no time in the span has no row at all.
- Rows are sorted by total, busiest first.
- A row's `total` equals the sum of its `months`.
- A week damaged in every way at once, beside a healthy one that still reports —
  the shape `search.test.ts`, `reporting.test.ts` and `tag-history.test.ts` all
  use, because these weeks arrive unrepaired.

`trends-dialog.test.tsx`:

- The dialog names its span.
- One row per used tag, with its name.
- The row total is shown.
- A month with time renders a bar; a month without renders its track and no bar.
- The empty state appears when nothing is blocked in the span.
- **Two tags of wildly different size both reach full height in their own
  busiest month.** This is the load-bearing assertion: it is the only one that
  can tell a per-row scale from a global one, and every other test here passes
  under either.

Mutation pass: divide by a global maximum instead of the row's own and confirm
that test goes red.

Browser pass, because jsdom draws nothing: confirm twelve columns fit at dialog
width without crowding, that the bars read as a shape rather than noise at
24px tall, and that the colours are distinguishable in both themes.

## Out of scope

- **Printing.** Dialogs are not part of the printed sheet, and the month view
  remains what prints.
- **Choosing the span.** Twelve months back from today, with no controls. A
  picker is a separate decision if the fixed year proves wrong.
- **Drilling into a month.** Clicking a bar does nothing. Navigating to a month
  is what the month view is for.
- **Weekly or daily granularity.** The month is the column, deliberately: a year
  of weeks is 52 columns and no longer reads as a shape.

## Risks

- **Per-row scaling can mislead at a glance.** Two rows look equally busy when
  one is ten times the other. Mitigated by the printed total, which is on every
  row for exactly this reason — but it is a real cost of the choice, and the
  alternative hides small tags' trends entirely.
- **Twelve initials are ambiguous.** J appears three times. The `sr-only` full
  names and the span line in the description carry the fact; the visible letters
  are position markers.
- **`reporting.ts` grows past 240 lines.** Still one responsibility — reading
  stored weeks and counting time — but it is the file to watch. A fourth reader
  would be the moment to split, not this one.
