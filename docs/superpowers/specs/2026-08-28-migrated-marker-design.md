# Marking a migrated row

Approved 2026-08-28. Not yet implemented.

## Summary

When items are brought forward, the week they came from records that they moved
on: a `migratedTo` date on the source row or weekly action, drawn as a `›`
before the text. The Bullet Journal `>` signifier.

This is the first thing in the app that writes to a week other than the one on
screen. Most of this document is about doing that safely.

## Motivation

Carry-forward copies and leaves the source untouched, so a past week goes on
reading as though its flagged rows are still open when in fact the user
migrated them. Opening a past week to see how it went gives a false answer, and
it gets falser the more diligently the user migrates.

In the method, `>` is what closes the loop. A task that was migrated is struck
from the old page with an arrow, so the old page tells the truth about what
happened to it. The app has the migration and not the record of it.

## The premise, and the rule it ends

`applyCarryForward` says, in the code:

> The source week is never touched: last week genuinely ended with these items
> unfinished, and ticking one off here must leave that record true.

That absolute ends here, deliberately. The reasoning it protects does not: a
migration mark does not say the item was finished, it says where it went. The
row keeps its text, its tag, its checked state and its flag, so "last week ended
with these unfinished" remains exactly as true as it was. What changes is that
the week can also say what became of them.

Marking still never happens from merely *opening* a week. It happens on the
user's explicit "Bring forward" click, so `findCarrySource`'s promise — no week
the user can still read is modified by opening one — holds unchanged.

## What the code does not currently know

Two gaps have to be closed before anything can be marked, and both are the
reason this item was flagged as risky rather than small.

**A candidate has no locator.** `CarryCandidate` is `{ text, origin }`.
`collectCarryForward` dedupes by text and discards which day, row or todo
produced it — deliberately, and its own comment notes the same text can arrive
twice, once as a weekly action and once as a flagged daily row.

**The source Monday is thrown away.** `StudyPlanner`'s effect calls
`findCarrySource`, keeps `candidates`, and drops `source.monday`. Nothing
downstream knows which week the candidates came from, and it is not always last
week: `findCarrySource` scans back up to `MAX_WEEKS_BACK = 4`.

## Decisions

**`migratedTo` holds the destination Monday, not a boolean.** It mirrors
`origin`, whose comment argues the case: a date can only be right or absent,
where a counter can be double-incremented by a re-run or inflated by an import
with no way to detect it was wrong. It also lets the marker name the week it
went to rather than only that it went.

It is validated by the same `asOrigin` helper `repairSubject` and `repairTodo`
already use, so a malformed or non-date value is dropped and the item still
loads. **Both** repair functions must name it — `repairList` dispatches to them
per item, so a field added to one and not the other is lost on exactly half the
rows.

**Rows are found by text, at mark time, in a freshly loaded source week.** The
week captured during the scan is minutes old by the time the user clicks; using
it would write a stale snapshot back over whatever the week now says. That is
the same class of mistake as closing over `weekData`, which is the bug this
item was flagged for. The marker calls `loadWeek(sourceMonday)` itself.

Matching by text is self-verifying: it only ever marks an item that currently
says that text, so a concurrent edit cannot redirect the mark onto the wrong
row. It also marks both copies when one commitment existed as a weekly action
and as a flagged row, which is correct — both moved on.

**The eligibility rule is extracted, not written twice.** Unchecked, non-blank
and not struck is what makes an item carry; the marker must mark exactly what
`collectCarryForward` would have offered. One predicate, used by `take()` and by
the marker. The `flagged` requirement stays with the daily-row caller, because
it applies to rows and not to weekly actions.

**Only chosen items are marked.** Unticking a row in the bar means "not this
one", and Skip means "none of them". Neither writes anything to the source.

**No reconciliation afterwards.** If the carried copy is later struck out or
deleted, the mark stays. It records what happened at the time, which is true.
Retracting it would mean watching every later week for changes to an item this
one no longer owns — a second copy of the truth, kept in sync across weeks,
which is the failure this repo already names twice.

**`markMigrated` lives in `planner-data.ts`, not in `carry-source.ts`.** The
carry module's whole character is that it finds and never writes — its comment
says so, and that promise is what makes it safe to run on every week change. A
writer next door would blur it for the next reader. `planner-data.ts` already
owns `collectCarryForward`, `applyCarryForward`, `loadWeek`, `saveWeek` and the
private `asOrigin` validator, so the function has everything it needs there and
adds no new dependency edge.

## The cross-week write

The mark is written with `saveWeek(sourceDate, marked)` — direct to storage,
outside React state, never through `setWeekData`.

**This is safe only because the source key can never be the week on screen.**
The bar renders only when `isCurrentOrFutureWeek(currentDate)`, and
`findCarrySource` scans strictly backwards, so the source Monday is always
earlier than the viewed Monday. If either of those ever changes, this write can
collide with the autosave debounce and one of the two will lose. The assumption
is stated here so that a change to it has somewhere to fail loudly.

**`setWeekData` is not an option** and not merely unnecessary: it writes the
week on screen. The `bringForward` bug was exactly this confusion — one week's
contents written under another week's key, with the whole suite green.

**The mark is a second write, and must not take the migration with it.**
`saveWeek` returns a boolean. The carry itself lands through the normal
autosave of the current week; the mark is separate. If the mark is refused —
`QuotaExceededError`, a sandboxed frame — the carry still stands and the failure
surfaces through the toast path `saveFailedRef` already owns. It must not be
silent, and it must not roll back a migration that succeeded.

## Rendering

A `›` before the text, plus an sr-only phrase naming the destination — "migrated
to 31 August" — in `DailyView`, `DayColumn` and `WeeklyTodoSidebar`.

Read-only in all three. The mark is set by the act of bringing forward; there is
no control to apply or clear it, and no fourth control to fit into a 20px row.

**It must not read as a weaker strikethrough.** Struck and migrated are opposite
outcomes — abandoned versus moved on — so they use different channels: a glyph
and a line. A row can carry both, and both must remain legible when it does.

The glyph is a text character, so it survives a mono print and involves no
colour, which is the same constraint that put printed run-numbers on tags.

## Changes

| File | Change |
| --- | --- |
| `src/lib/planner-data.ts` | `migratedTo?: string` on `SubjectRow` and `TodoItem`; both repairs name it via `asOrigin`; extract the carry-eligibility predicate; `markMigrated(sourceMonday, chosen)` — load, mark by text, save, returning whether the write landed |
| `StudyPlanner.tsx` | Keep the source Monday in state beside `candidates`; call the marker from `bringForward`; warn on a refused write |
| `DailyView.tsx`, `DayColumn.tsx`, `WeeklyTodoSidebar.tsx` | Render the glyph and its spoken phrase |

## Testing

- `migratedTo` round-trips through `saveWeek` / `loadWeek` on a row and on a todo
- A malformed `migratedTo` is dropped and the item still loads, as `origin` is
- Bringing one item forward marks that item in the source week
- **and leaves the unticked items unmarked** — the negative case, without which
  a marker that marks everything passes
- Skip marks nothing
- A matching text that is *not* carry-eligible — checked, or struck — is not
  marked
- Both copies are marked when the same text is a weekly action and a flagged row
- The source week is loaded fresh: a source edited after the scan keeps that
  edit, and only gains the mark
- **The current week is not written by the marker** — assert the viewed week's
  stored contents are unchanged except by the carry itself
- A refused `saveWeek` warns and leaves the carry standing
- The glyph and its spoken phrase render in all three components
- A row that is both struck and migrated shows both

**Mutation-test each, and confirm each mutation applied.** The cross-week ones
matter most: point the marker at the viewed week instead of the source and
confirm a test fails, because that is the bug this whole document is about.

## Out of scope

- A control to set or clear the mark by hand.
- Retracting it when the carried copy is struck or deleted.
- Showing the marker in the carry bar. The bar lists what is coming, not what
  was left behind.
- Marking anything on Skip.

## Risks

**A stale source snapshot silently reverts the user's edits.** If the marker
writes the week it was handed at scan time rather than a fresh load, every
change made to that week since — in this tab or another — is overwritten by a
minutes-old copy. Nothing errors. The freshly-loaded read is the mitigation and
its test names the scenario.

**The eligibility rule can drift.** If the marker's idea of what carries stops
matching `collectCarryForward`'s, the app marks items it did not carry or misses
ones it did. The shared predicate is the mitigation; a mutation must prove the
test catches divergence rather than assuming.

**A wrong week key writes into a real week's slot.** `saveWeek` takes a Date and
derives the key. The source Monday arrives as an ISO string and must be parsed
back to a Date that lands on the same week — see "Week keys pair an ISO week
with an ISO week-year", and note that a December Monday is exactly where the
calendar year and the ISO week-year disagree.
