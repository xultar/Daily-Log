# Scheduling a task to a chosen week

Approved 2026-08-28. Built 2026-08-28. Three notes from the building.

**"Create the week if it does not exist" was dead code.** `loadWeek` already
returns a repaired empty week when nothing is stored, so the `hasStoredWeek`
branch this document called for never ran. A mutation deleting it changed
nothing, which is how it was found. The function just loads.

**The spread trap needed two more tests than the plan listed.** The plan covered
editing a row's text afterwards, which exercises `updateSubject`. It did not
cover `markScheduled`, which rebuilds the item too — so a row carrying a tag, a
flag or a strike would have lost them the moment it was scheduled, in both the
day view and the sidebar. Both surfaced as surviving mutations, one after the
other.

**Radix menus do not open under jsdom from a synthetic pointer event.** There is
no `PointerEvent`, so the trigger never sees a button of 0 and the menu stays
shut. The tests open it with Enter instead, which is a real path a keyboard user
has anyway.

## Summary

Send an open item to a week you pick, rather than only to the next one. The item
is written into that week's Weekly Actions immediately, and the week it came
from records where it went with the `migratedTo` marker that already exists.

The Bullet Journal `<` bullet, and the closest thing to a Future Log this app
needs.

## Motivation

Carry-forward answers "not this week, next week". It has no answer for "not for
a month" — the task that is real but not now. Today those either sit in a week
being migrated over and over, which the escalation makes visible but does not
solve, or they leave the planner entirely and are forgotten.

The method's answer is the Future Log: a place to put things whose time has not
come, reviewed when the month turns. This app deliberately has no separate
Future Log view — month notes on a future month already give somewhere to write
"September: conference", and a second place to put future items is a second
place to forget them. Scheduling into a specific week puts the item where it
will actually be looked at.

## What this can now lean on

**The cross-week write is no longer novel.** `markMigrated` shipped on
2026-08-28 and established the pattern: take a Monday rather than a week object,
load fresh, save that week directly, never through `setWeekData`. This feature
follows it and should not reinvent it.

**The origin marker already exists.** `migratedTo` holds the destination Monday
and renders as `›` through `MigratedMarker`. A scheduled item is a migration to
a chosen week rather than to the next one, so the origin side needs no new
storage and no new glyph.

The method distinguishes `>` from `<`, and that distinction is deliberately not
reproduced. Both mean the item is now in week X, the stored date already says
which week, and the `>`/`<` split exists on paper largely because the Future Log
is a separate place. Here it is not.

## Decisions

**The item is written into the destination week at the moment of scheduling.**
Load that week, add the item to its Weekly Actions, save. It is simply there on
arrival, at any distance ahead. The alternative — storing the intent and
offering it when the week opens — was rejected because the offer would have to
scan backwards to find it, and that scan's reach would silently bound how far
ahead anything could be scheduled.

**A destination week that does not exist yet is created.** Most future weeks
have never been opened. `createEmptyWeek` for that Monday, then the item, then
save. This is the first thing that brings a week into existence without the user
visiting it, which is worth knowing when reading storage: a `planner-` entry no
longer implies someone opened that week.

**A scheduled item lands without an `origin`, and that is not an oversight.**
`origin` drives the age marker — "carried 3 weeks" — and its whole meaning is
slippage. An item deliberately placed eight weeks out has not slipped eight
times; stamping it would make the escalation lie in the one place the user is
most likely to trust it. It arrives as new work in that week. If it then goes
unfinished, `collectCarryForward` stamps an origin from the week it failed in,
which is correct.

**Only the destination is a cross-week write.** The origin is the week being
viewed — you schedule an item you are looking at — so marking it is an ordinary
row update through the existing `onChange`, spreading the item like every other
edit. Nothing here needs `markMigrated`, and it must not use it: that function
matches by text and marks only *flagged* daily rows, because it serves a bulk
carry where the specific rows are unknown. Here the component knows exactly
which item the user pointed at, so an unflagged row schedules and marks
correctly, which a text match would silently skip.

**Destination first, origin second.** Unlike the migration mark, these two are
halves of one action rather than a consequence of one that already happened. The
destination write goes first; the origin is marked only if it landed. A refused
destination write leaves nothing scheduled and nothing claiming to be, and says
so.

**Only future weeks are offered.** The menu lists relative choices — next week,
in 2, in 4, in 8 — so there is no way to schedule into the past or into the week
being viewed, and no date parsing to get wrong.

**No control in the week's columns.** As with striking out: those rows are 20px
carrying 12px controls, and the day view and the sidebar are where the review
actually happens.

## The control

A button on the row in `DailyView` and `WeeklyTodoSidebar`, opening a menu of
relative weeks. Offered for any item with text; a blank row has nothing to send.

**The row is now genuinely crowded** — a day-view row carries a tag button, a
checkbox, the migration glyph, the text field, strike, flag and delete. This
adds an eighth element. If it does not fit, the honest response is to say so and
re-open the question rather than shrink the targets below what the existing 12px
controls already are.

**A Radix menu is the right primitive and its `role="menu"` is load-bearing.**
`TimeGrid`'s keydown guard tests for `[role="menu"], [role="dialog"],
[role="listbox"]` precisely so that an open menu swallows digits — otherwise
typing while the menu is open would arm colour tags. Do not remove or rename
that role to tidy the ARIA.

## Changes

| File | Change |
| --- | --- |
| `src/lib/planner-data.ts` | `scheduleToWeek(destinationMonday, text)` — load or create the destination week, add the item to its Weekly Actions, save. Returns whether it landed. Touches no other week |
| `DailyView.tsx`, `WeeklyTodoSidebar.tsx` | The button and its relative-week menu; on success, stamp `migratedTo` on the item through the existing `onChange` |

`planner-data.ts` is the big file and this makes it bigger. It is the right home
— `markMigrated`, `applyCarryForward`, `loadWeek` and `saveWeek` all live there —
but the file is worth splitting before the next thing lands in it, and that is
its own piece of work rather than a rider on this one.

## Testing

- The item appears in the destination week's Weekly Actions
- A destination week that did not exist is created, and contains only that item
  and the empty shape
- The destination's existing contents survive — a week with work in it gains the
  item and loses nothing
- The item does **not** land with an `origin`, so it shows no age on arrival
- The origin item gains `migratedTo` pointing at the chosen week
- The origin item is otherwise unchanged — still present, still unticked, same
  text
- Scheduling the same text twice does not add it twice
- **A refused destination write leaves the origin unmarked** — the ordering, and
  the case that separates this from `markMigrated`
- An **unflagged** daily row schedules and is marked, which a text-matching
  implementation borrowed from `markMigrated` would silently skip
- Editing the row's text afterwards keeps `migratedTo` — the spread trap that
  already loses `colorId`, `flagged`, `origin` and `struck`
- The menu offers only weeks after the one being viewed
- The control is absent for a blank row
- No control appears in the week's columns

**Mutation-test each, and confirm each mutation applied.** The ordering test
matters most: swap the two writes so the origin is marked first and confirm a
test fails, because that failure mode leaves a week claiming an item went
somewhere it never arrived.

## Out of scope

- A Future Log view. Month notes already serve it, and a second place to put
  future items is a second place to forget them.
- Scheduling to a specific day rather than a week. `applyCarryForward` already
  argues the case: a task that failed on Tuesday no longer belongs to a day, and
  re-pinning it to one is a guess.
- A distinct `<` signifier — see above.
- Rescinding a schedule. Once the item is in the destination week it is an
  ordinary item there, and the origin's marker records what happened.

## Risks

**Creating weeks nobody visited changes what storage means.** Anything that
reasons about stored weeks as "weeks the user has used" — a future export
summary, a "which weeks have data" view — would start counting empty scheduled
weeks. Nothing does today. It is written here so the first thing that wants to
is not surprised.

**A wrong destination Monday writes into a real week's slot.** The offsets are
computed from the viewed week's Monday with `addWeeks`, and the key comes from
`getWeekKey`, which pairs the ISO week with the ISO week-year. Do not construct
a key from a calendar year — nine weeks between 2015 and 2040 collide that way,
and the December ones are exactly where an eight-week offset from October lands.

**The origin mark can outlive the thing it points at.** If the scheduled item is
later deleted from the destination week, the origin still says it went there.
That is the same decision the migration marker already took: the mark records
what happened at the time, and reconciling it would mean watching another week
for changes to an item this one no longer owns.
