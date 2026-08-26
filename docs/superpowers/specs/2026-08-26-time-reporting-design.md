# Time reporting

Date: 2026-08-26
Status: approved

## Summary

Totals per tag over a date range, drawn as horizontal bars under the month
calendar. The month view already shows which days carry which tag; this says how
much.

**It reports blocked time, forwards as well as back.** The purpose is to see
whether time lines up with goals and projects — which is a question asked about
next month as often as last month. The aggregate reads a date range and neither
knows nor cares which side of today it falls on, so navigating to a future month
reports the plan rather than the record, with no extra code.

That is also a limit worth stating: **the app cannot tell a plan from a record.**
A painted block is a painted block. So the wording is "blocked", never "spent"
or "went" — past tense would be wrong half the time.

## Motivation

Logging time is the point of the app and nothing has ever added it up beyond a
single week. `calcWeekColorMinutes` totals one week by tag and has no caller
that spans more than that.

Twelve labelled tags and a measured palette make the totals worth reading now:
a bar list of "Blue, Pink, Green" says little, and "Thesis 14h, Teaching 6h,
Admin 3h" says a lot.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Range | The month being viewed | Every other screen responds to the arrows; this should too |
| Aggregate signature | A date range, not a month | Makes the range a caller's decision, so changing it later is an argument |
| Where | Under the month calendar | Annotates what the cells already show; no dialog, no new icon |
| Drawing | Hand-drawn bars | recharts costs 103 kB gzipped, a 74% increase, for a bar list |
| Aggregating | Day by day | A week straddles month boundaries; a day does not |
| Ordering | Most minutes first | The question is where the time went |

Rejected alternatives:

- **recharts.** It is already in `package.json` and contributes **zero bytes**
  to the bundle today, because the only file importing it is an unused shadcn
  wrapper and Vite shakes it out. Measured: importing it takes the bundle from
  453 kB to 826 kB, and 139 kB to 241 kB gzipped. It earns that for axes,
  tooltips and time series. This is a bar list, and the app already hand-draws
  a 19x6 grid, a legend and twelve swatches.
- **Everything stored.** Simplest, and it grows monotonically: a tag abandoned
  in March keeps its total forever and drowns the recent picture.
- **A rolling twelve weeks.** Answers "lately" but ignores where you have
  navigated, so looking at March would show a window ending today. The only
  screen that does not follow the date would be this one.
- **Split by month, a row per tag per month.** The most informative and the
  most to draw. Worth revisiting once there is a year of data to look at.

## The aggregate

    totalsByTag(from: Date, to: Date): { colorId: number; minutes: number }[]

Inclusive of both ends, ordered by minutes descending, tags with no minutes
omitted entirely.

It reads `loadAllWeeks`, which is the one place that enumerates stored weeks,
and therefore inherits its contract: **weeks arrive unrepaired**. Every field
access defends itself, exactly as `searchWeeks` does — `days` may be missing,
`timeBlocks` may not be a grid. One damaged week costs its own minutes and
nothing else.

Days are selected by their own `date` field falling inside the range, not by
which week key they were found under. That is the same reasoning as everywhere
else that reads day data: the date is the fact, the key is where it happens to
be filed.

Aggregating **per day rather than per week** is what makes an arbitrary range
possible at all. A week straddles a month boundary; a day does not.

## The bars

Under the calendar, inside the month view:

- One row per tag with minutes in range, most first.
- A swatch, the tag's name, a bar, and the formatted total.
- Bar width is that tag's share of the largest tag's total, so the biggest bar
  fills the width and the rest are read against it.
- Bars use `hsl(var(--tag-N))` at full strength. Unlike the month cells, no text
  sits on them, so the contrast ceiling that governs the cell wash does not
  apply here.
- Nothing at all when the month has no logged time. An empty chart frame is
  worse than no chart.

The name is not decoration. It is the same non-colour channel the month cells
carry, for the same two reasons: several pairs in this palette are the same
colour to a deuteranope, and a mono print renders every bar the same grey.

## Testing

`totalsByTag`, as a pure function:

- Totals a single day, and sums across days.
- Respects both ends of the range, inclusively.
- Excludes a day outside the range that sits inside an included week — the case
  that only works because aggregation is per day.
- Orders by minutes, descending.
- Omits tags with no minutes.
- Returns an empty array for a range with nothing in it.
- Survives a damaged week — `days` missing, `timeBlocks` not a grid — and still
  totals a healthy week beside it.

The view:

- A tag with minutes gets a row naming it.
- The largest tag's bar is wider than a smaller tag's.
- A month with nothing logged renders no chart at all.

Every new test is mutation-tested.

## Out of scope

- Any range other than the displayed month. The aggregate takes a range, so
  another caller is a small change; the UI for choosing one is not this.
- Trends over time, month by month.
- Filtering the calendar by tag. That belongs with "find when you last used a
  tag".
- recharts, and the `src/components/ui/chart.tsx` wrapper that imports it.

## Risks

**Unrepaired weeks, again.** This is the second reader of raw stored data after
search. The mitigation is the same and so is the test: build the fixture from a
genuinely malformed week rather than a tidy one.

**The month view grows.** It gains a section below the calendar, and on a short
month with many tags the page will scroll. That is acceptable; the calendar
stays at the top where it was.
