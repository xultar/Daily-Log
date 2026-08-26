# Finding when a tag was last used

Date: 2026-08-26
Status: approved

## Summary

Pick a colour tag and get back every day it was used, newest first, so the top
row answers "when did I last work on Thesis". A day counts as a use when time
was painted against that tag or when a priority row that day carries it. It
lives as a second mode inside the existing search dialog, and a click on a row
opens the week that day was filed under.

## Motivation

The colour tags are the user's goals, and the app holds no separate notion of a
goal — the palette is it. So "when did I last use this tag" is really "when did
I last touch this goal", and there is currently no way to ask it. The month
report answers how *much*, over a range the user is already looking at. It does
not answer *when*, and it cannot look backwards past the month on screen.

This is deliberately not text search. Search reads prose and answers with
passages; this reads `timeBlocks` and priority rows and answers with dates. They
are different questions that happen to share a result-list-and-jump idiom.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Answer shape | A list, one row per day, newest first | The top row *is* "last used"; the rest is the history. Rows per painted block would run to thousands |
| What counts as a use | Painted blocks **and** tagged priority rows | Both are the goal being touched; only one of them is time |
| How the two are told apart | Minutes when painted, "on priorities" when not | A priority row carries no minutes, and `0m` would be a lie rather than an absence |
| A day with both | One row, showing the minutes | The day is the unit. The tag was used that day, once |
| Surface | Second mode in the search dialog | Leaves the legend cell free for backlog item 4, and keeps one global entry point |
| Displayed date | The day's own `date` field | The date is the fact; the week key is only where it happens to be filed |
| Navigation target | The Monday derived from the entry key | `loadWeek` is key-addressed, so this is the only Monday that opens the week the row came from |
| A day with no readable date | Skipped | The answer here *is* a date. There is nothing to put in the column |
| Result cap | None | A cap reads as "that is everything" when it is not, and the list scrolls |
| Tag picker | Swatch **and** name, all twelve | Several pairs in this palette are one colour to a deuteranope, and the name is the goal |

Rejected alternatives:

- **A single date rather than a list.** Rejected: the list subsumes it, because
  the top row is that date, and the traversal that finds one use has already
  found them all. Returning less would be work spent discarding an answer.
- **Its own dialog, opened from the legend.** Rejected: the legend cell is a
  button that arms the colour beside an input that renames it, with a structural
  test asserting no cell nests one interactive element inside another. Backlog
  item 4 wants to add renaming to the weekly strip as well. A third affordance
  in that cell is a collision, not a shortcut.
- **A filter on the text query.** Rejected: one result list would have to carry
  two row shapes — a snippet with a field label, and a date with a duration —
  and the empty states contradict each other. Separate modes, one dialog.
- **Counting blocks and priority rows into one number.** Rejected: it puts
  intent and blocked time in the same column and the minutes stop meaning one
  thing. This is the same distinction as "time reporting reports blocked time,
  not spent time", one level down.

## A result

```ts
export interface TagUse {
  /** The week key the day was found under. Its identity, with the date. */
  weekKey: string;
  /** The day's own date. The fact, and what the row displays. */
  date: string;
  /** ISO Monday from the entry key. Where a click goes, and nothing else. */
  monday: string;
  /** Minutes painted against this tag that day. 0 when priority-only. */
  minutes: number;
  /** A priority row that day carries this tag. */
  onPriorities: boolean;
}

export function tagHistory(colorId: number): TagUse[]
```

Sorted by `date`, newest first. `minutes` counts ten minutes per painted block,
as everywhere else that counts painted time.

**The unit is a day within a stored week, not a calendar date.** If two stored
weeks both carry a day dated 19 Aug — which is precisely the mis-filing that
`mondayOfKey` exists to survive — that is two rows, not one. Merging them would
add minutes belonging to two different weeks and then have to pick one of the
two weeks to navigate to, which would make the row untrue in whichever direction
it chose. Rows sharing a date are ordered by `weekKey` descending, so the order
is stable rather than incidental.

An unknown `colorId` — zero, negative, or past the palette — returns an empty
list rather than throwing. It is a question with no uses, not an error.

A day where the tag is painted *and* on a priority row is one row carrying both
facts, rendered as its minutes. `onPriorities` is not rendered when minutes are
present; it is on the type because the day genuinely has both properties, and
discarding one at the data layer would make it unrecoverable.

## The two date rules, and why this needs both

This is the first caller in the repo to need both, and they are opposites.

`totalsByTag` reads a day's own `date` because it is aggregating by calendar
range, and a week straddles a month boundary while a day does not. The date is
the fact.

`searchWeeks` derives its Monday from the **entry key**, because a key can
disagree with the dates inside it, and `loadWeek` is key-addressed. Deriving
navigation from the contents would, for such a week, land the user somewhere
other than the week their result came from.

A `TagUse` does both jobs at once: it *displays* a date and it *navigates* to a
week. So it takes `date` from the day, per the first rule, and `monday` from the
key, per the second. Neither rule bends.

`mondayOfKey` is private to `search.ts` today. It moves to `planner-data.ts`,
next to `weekKeyForStoredWeek`, and `search.ts` imports it back. Putting the two
opposite translations side by side, each with the comment explaining why it is
not the other one, is worth more than either is in isolation.

**The cost of skipping undated days.** A week too damaged to state its own dates
stays searchable — that is exactly what navigating by key buys. It will have no
tag history, because the answer here is a date and that week cannot supply one.
This is a deliberate divergence from search's behaviour, not an oversight.

## Reading every stored week

Weeks arrive from `loadAllWeeks` **unrepaired**, so every field access defends
itself: `days` may be missing, a day may be a string, `timeBlocks` may not be a
grid, `subjects` may be absent, a subject may be a number. One damaged week must
cost its own rows and nothing else.

`SubjectRow.colorId` is optional — rows saved before the field existed load
unflagged — so the comparison must survive a row whose `colorId` is `undefined`,
`null`, or not a number.

`totalsByTag` and `tagHistory` are the same walk with different bookkeeping, and
would be the second and third hand-written copies of it. A small internal
iterator in `reporting.ts` yields each stored day with the key it was found
under, having already done the shape-defending; `totalsByTag` filters it by
range, `tagHistory` does not. `totalsByTag`'s existing tests stay green and
untouched, which is the proof the extraction changed nothing.

## Interaction

The dialog title becomes "Find". The trigger icon and the file name do not
change, so no imports or existing tests move.

Two mode buttons, `Text` and `Tag`, carrying `aria-pressed` — the idiom the
legend cell already uses, rather than introducing a tabs primitive for two
options.

Tag mode replaces the text input with a picker: all twelve tags in
`COLOR_IDS_IN_DISPLAY_ORDER`, each a swatch beside its name, the selected one
flagged with `aria-pressed`. Names are not decoration here; a swatch alone is
ambiguous under colourblindness and blank in a mono print.

A row shows its date on the left — `Tue 19 Aug 2026` — and on the right either
`formatMinutes(minutes)` or `on priorities`. Clicking it calls `onJump(monday)`
and closes the dialog, exactly as text mode does, landing on the week view.

Results recompute when the dialog opens as well as on selection, because weeks
may have changed since it was last closed, including from another tab.

The empty state names the tag: "No time blocked or priorities tagged Thesis."

## Changes

| File | Change |
| --- | --- |
| `src/lib/planner-data.ts` | `mondayOfKey` moves here, exported, beside `weekKeyForStoredWeek` |
| `src/lib/search.ts` | Imports `mondayOfKey` rather than defining it |
| `src/lib/reporting.ts` | Shared day iterator; `totalsByTag` rewritten onto it; `TagUse` and `tagHistory` added |
| `src/components/planner/TagHistoryPanel.tsx` | New — picker and result list |
| `src/components/planner/SearchDialog.tsx` | Owns the shell, the mode state and the jump; renders one body or the other |
| `CLAUDE.md` | Baselines test count; backlog item 2 replaced by what shipped |

## Testing

`tag-history.test.ts`:

- Newest first.
- Painted blocks and a tagged priority row on one day give a single row, showing
  the minutes.
- A priority-only day gives `minutes: 0, onPriorities: true`.
- A priority row whose `colorId` is absent, null, or not a number does not throw
  and does not match.
- A day with no readable date is skipped.
- Two stored weeks both carrying the same date give two rows, each navigating to
  its own week, ordered by `weekKey` descending.
- An unknown `colorId` returns an empty list.
- A week broken in every way at once, beside a healthy one that still returns
  its rows — the shape `search.test.ts` already uses.
- **`monday` comes from the entry key even when the key and the day's own dates
  disagree.** This is the load-bearing case: without it, a mis-keyed week sends
  the user to a week that does not contain the day they clicked.

`tag-history-dialog.test.tsx`:

- Switching modes swaps the body.
- Picking a tag lists its days.
- Clicking a row calls `onJump` with the key's Monday and closes the dialog.
- The empty state names the tag.

`totalsByTag`'s existing tests are not edited.

Mutation pass: swap `date` and `monday` in a returned row and confirm the
key-versus-dates test goes red. If it stays green it is not defending the line
it exists for.

Browser pass at `http://localhost:8080/Daily-Log/`, because jsdom sees no colour
and no layout, and the picker is twelve swatches.

## Out of scope

- Trends over months — that is backlog item 3, and it aggregates where this
  enumerates.
- Renaming a tag from this list. Backlog item 4.
- Any cross-tag view. `totalsByTag` already answers that question.
- Restricting the history to a date range. The question is "when did I last",
  which is unbounded by definition.

## Risks

- **A tag used daily for years produces a long list.** Accepted, and uncapped
  for the reason the text results are uncapped. The answer the user came for is
  the first row.
- **Rewriting `totalsByTag` onto a shared iterator touches tested, load-bearing
  code.** Mitigated by leaving its tests untouched: if the extraction changes
  behaviour, they say so.
- **`onPriorities` is carried but not rendered when minutes exist.** A field
  with no current display is a mild smell. It is kept because the day really
  does have both properties, and the alternative is discarding a fact at the
  data layer that the UI may later want.
