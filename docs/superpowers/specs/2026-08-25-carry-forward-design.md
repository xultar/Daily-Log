# Carrying unfinished work forward

Date: 2026-08-25
Status: approved

## Summary

When a week opens with unfinished work behind it, a review bar lists what was
left over and lets the user tick which items come across. Chosen items are
**copied** into the new week's Weekly Actions, never moved, so the old week's
record stays true. Each carried item remembers the week it was first written in,
and the sidebar shows how long it has been slipping as a left rule that thickens
with age.

## Motivation

Every week is an island. An unchecked Weekly Action, or a daily row the user
explicitly flagged as a priority, simply disappears when the week turns — no
trace, no prompt. It is the largest gap between what this app is and what a
planner does.

It is also only now safe to build. Weeks are correctly keyed by ISO week paired
with ISO week-year, damaged weeks repair rather than vanish, and every storage
call is guarded. A feature that reads last week and writes this one would have
been building on sand before that work landed.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| What is eligible | Unchecked Weekly Actions + unchecked **flagged** daily rows | The flag is the user declaring "this one matters" |
| Copy or move | Copy | The old week is a record of what happened; carrying must not rewrite it |
| Trigger | Review bar with a pick list | Opening a week must never write to it |
| Where flagged daily rows land | Weekly Actions | A row that failed to belong to a day no longer has one |
| How age is stored | `origin`, the ISO date of the originating week's Monday | Derived age is idempotent; a counter is not |
| Age marker | Left rule thickening with age, plus `Nw` | The sidebar is 128px at 9px text — the rule spends margin, not text width |
| Resolution memory | `carryResolved` on the week | Dismissal has to stick or the bar returns every visit |
| How far back to look | Most recent stored week within 4 | A holiday must not strand everything behind the gap |

Rejected alternatives:

- **Automatic carry on open.** Rejected: the autosave effect runs on mount, and
  `dirtyRef` exists precisely because merely opening a week once wrote it straight
  back — which is how an unreadable week became an empty one 300ms after being
  viewed. Populating a week on open is that bug, reintroduced deliberately.
- **A one-click "bring everything" bar.** Rejected: without a prune step the list
  only grows, and within a couple of months it is mostly things the user has
  silently decided not to do. At that point the age marker stops meaning "this is
  slipping" and starts meaning "this is furniture".
- **Moving items rather than copying.** Rejected: last week genuinely ended with
  three things unfinished, and that must stay true afterwards.
- **A `carriedWeeks` counter.** Rejected: a counter can be double-incremented by a
  re-run, inflated by an import, or desynced by a repair, with no way to detect
  it is wrong. A date can only be right or absent.
- **Carrying every unchecked daily row.** Rejected: 42 rows a week are partly a
  log of what happened, so an empty week would arrive pre-filled with stale text.

## Schema

Two optional fields and one week-level flag. All three are optional so that data
written before they existed loads without a migration.

```ts
interface TodoItem   { text: string; checked: boolean; origin?: string }
interface SubjectRow { …; flagged?: boolean; origin?: string }
interface WeekData   { …; carryResolved?: boolean }
```

`origin` is the ISO date of the Monday of the week the item was **first**
written. It validates against the `ISO_DATE` regex already in
`planner-data.ts`. Absent means the item originated in the week it is sitting
in, so its age is zero.

Age is derived, never stored:

```
age = differenceInCalendarWeeks(mondayOfThisWeek, parseISO(origin), { weekStartsOn: 1 })
```

`weekStartsOn: 1` is stated explicitly rather than left to the default of Sunday.
Both operands are Mondays so the two agree today, but the planner is
Monday-based everywhere else and an implicit Sunday boundary here would be a
quiet inconsistency waiting for the first caller that passes a non-Monday.

On carry, the new item takes `origin = source.origin ?? mondayOfSourceWeek`.
Carrying twice therefore cannot inflate the age, and re-running a carry is
idempotent.

**The trap.** `repairSubject` and `repairTodo` rebuild every row from a fixed
list of fields, and `repairWeek` does the same for the week. A field absent from
those lists is silently dropped on the next load — no type error, because
`strict` is off and the field is optional, and no failing test unless one exists
for that field specifically. `origin` must be added to both row repairers and
`carryResolved` to `repairWeek`, each with a save/load round-trip test, exactly
as `flagged` is guarded by `priority-flag.test.tsx` and `colorId` by
`daily-view.test.tsx`.

`origin` survives repair only if it is a string matching `ISO_DATE`; anything
else is dropped, which degrades the item to age zero rather than rendering a
broken marker. `carryResolved`, like `flagged`, is stored only when `true`.

## Finding candidates

Pure, in `planner-data.ts`, with no storage or DOM access:

```ts
collectCarryForward(sourceWeek: WeekData, sourceMonday: string): CarryCandidate[]
applyCarryForward(target: WeekData, chosen: CarryCandidate[], targetMonday: string): WeekData
```

A candidate is any item that is unchecked and whose text is non-empty after
trimming, drawn from:

- `sourceWeek.weeklyTodos`, and
- `sourceWeek.days[].subjects` where `flagged === true`.

Blank rows never carry — the default week is 8 empty todos and 42 empty subject
rows, and carrying those would be noise, not work.

**Which week is the source.** Scan back from the immediately preceding week until
a week exists in storage, up to four weeks. The first one found is the source;
if none exists, there is nothing to carry. Four is enough to cross a normal break
without turning a dormant planner into an archaeology tool.

**When the bar may appear.** Only when the week being viewed is the current ISO
week or later. Navigating back to review March must not prompt to carry February
forward, and must not offer to write to a week the user is only reading.

**Duplicates.** A candidate whose trimmed text already appears in the target
week's `weeklyTodos` is skipped, so a user who retyped an item by hand does not
end up with two.

**Landing.** Chosen items fill blank Weekly Action rows first and append only
when none are left, because a fresh week starts with 8 empty rows and appending
past them would leave the list front-loaded with blanks.

A flagged daily row becomes a `TodoItem`: its `subject` becomes `text`, its
`origin` carries, and its `colorId` does not survive — `TodoItem` has no colour.
That loss is accepted as the cost of one landing place.

## Interaction

The review bar renders in the weekly view above the grid, and carries
`no-print`.

- It appears when the viewed week is current-or-later, `carryResolved` is not
  true, and at least one candidate exists.
- It lists each candidate with a checkbox — all ticked by default, so the fast
  path is one click — and shows each item's age marker.
- **Bring N forward** copies the ticked items and sets `carryResolved`.
- **Skip** sets `carryResolved` and writes nothing else. It discards: see Risks.

Both are user actions, so both legitimately mark the week dirty. Opening a week
still writes nothing, and `dirtyRef` keeps doing the job it was added for.

The bar must not gain `role="menu"`, `role="dialog"` or `role="listbox"`.
`TimeGrid`'s keydown guard tests `closest?.('[role="menu"], [role="dialog"],
[role="listbox"]')` so Radix menus can swallow digits; any of those roles on an
ancestor silently disables the 1–9 paint shortcuts whenever focus sits inside.

## The age marker

In `WeeklyTodoSidebar`, an item with a non-zero age gets:

- a left rule of `min(age, 3) × 2px`, in the accent colour up to two weeks and
  the warning colour from three;
- a small `Nw` label after the text.

The rule occupies margin the row was not using, which is what makes it viable in
a 128px column at 9px text — a chip or a row of dots would take width from the
item's own text and truncate it sooner. Thickness caps at three so a long-slipped
item cannot crowd the text out.

Age is computed at render from `origin` and the week's Monday, so it is always
current without anything being rewritten as weeks pass.

## Changes

### 1. `src/lib/planner-data.ts`
Add `origin` to `TodoItem` and `SubjectRow`, `carryResolved` to `WeekData`.
Extend `repairSubject`, `repairTodo` and `repairWeek` to carry them. Add
`collectCarryForward`, `applyCarryForward`, and an age helper.

### 2. `src/lib/carry-forward.ts` (new)
The storage-facing part: scan back up to four weeks for the most recent stored
week and return it with its Monday. Kept separate from the pure rules so those
stay testable without storage, and it reads through `loadWeek` — nothing outside
`src/lib/storage.ts` touches `localStorage`.

### 3. `src/components/planner/CarryForwardBar.tsx` (new)
The review bar. Presentational: receives candidates, reports the chosen subset.

### 4. `src/components/planner/StudyPlanner.tsx`
Look up candidates when the viewed week changes, render the bar, and apply the
result. Applying goes through the existing week-update path so autosave, the
debounce and `pendingRef` all behave normally.

### 5. `src/components/planner/WeeklyTodoSidebar.tsx`
Render the age marker. `update` keeps its `{ ...t, [field]: value }` spread — that
spread is what preserves `origin` through a keystroke, for the same reason
`updateSubject` must not be rewritten to list fields explicitly.

## Testing

Rules, without a DOM:

- Unchecked non-empty Weekly Actions are candidates; checked ones, blank ones and
  whitespace-only ones are not.
- Flagged unchecked daily rows are candidates; unflagged unchecked rows are not.
- A candidate already present in the target by text is skipped.
- Landing fills blank rows before appending.
- `origin` is set from the source week's Monday when absent, and preserved when
  present — so carrying twice yields age 2, not age 1 twice or age 3.
- Age across a skipped week reports elapsed weeks, not carry events.
- The source scan finds the most recent stored week within four and gives up
  beyond that.

Round trips, which are the ones that catch the repair trap:

- A todo with `origin` survives save → load.
- A subject with `origin` **and** `flagged` **and** `colorId` survives together —
  the combination, not each in isolation.
- `carryResolved` survives save → load, and is absent rather than `false` when
  unset.
- An `origin` that is not a valid ISO date is dropped and the item still loads.

Component:

- The bar appears for a current-or-later week with candidates, and not for a past
  week, a resolved week, or a week with no candidates.
- **Bring forward** adds only ticked items and sets `carryResolved`.
- **Skip** adds nothing and sets `carryResolved`.
- Opening a week with candidates and touching nothing writes nothing to storage —
  the `dirtyRef` guarantee, asserted directly.

`src/test/autosave.test.tsx` and `src/test/pending-save.test.tsx` reach the next
week with `container.querySelectorAll("button")[1]`. The bar renders below the
toolbar, but any control added **before** either chevron silently repoints those
tests at the wrong button, and they then fail looking like a save bug rather than
a layout change. Verify both still pass.

## Out of scope

- Carrying `colorId` with a promoted daily row. `TodoItem` has no colour field
  and adding one is a schema change this feature does not need.
- Carrying the week goal or review.
- Any cross-week search or history view. Separate backlog item.
- Notifying about slipped items anywhere other than the sidebar.

## Risks

- **The repair trap is the whole risk.** Three optional fields across three
  repair functions, none of them visible to the compiler. If `origin` is dropped
  on load, every carried item silently resets to age zero and the feature looks
  like it works while quietly forgetting. The round-trip tests are not optional.
- **Duplicate detection is by exact trimmed text.** Retyping an item with
  different wording will still produce a near-duplicate. Accepted: the
  alternative is fuzzy matching, which is worse when wrong.
- **`carryResolved` is per week, not per item, and skipping discards.** This
  paragraph originally claimed an item left behind was "still available from
  the following week's scan". That was wrong, and the code was right.

  Skipping marks the week resolved *and dirty*, so week N gets written. The
  scan then stops at the first week that **exists**, which from week N+1 is
  week N — a week that never received the items. So pressing Skip once removes
  last week's unfinished work from the feature permanently. The same happens if
  the user simply types anything in the new week without answering the bar.

  This is a consequence of the stop-at-the-first-stored-week rule, which is
  itself deliberate: an existing week means the user was there, and scanning
  past it would resurrect items they had already moved on from. The two cannot
  both hold.

  The button therefore reads **Skip**, not "Not now" — "not now" promises a
  later that does not come.
