# Copying a week's shape onto another week

Date: 2026-08-26
Status: approved

## Summary

A toolbar button opens a dialog offering to copy the shape of the most recent
painted week into the week being viewed. "Shape" means the painted `timeBlocks`
and the priority row text and colour tags — not memos, not the goal, not the
review, not weekly actions. It only ever fills empty slots, so nothing the user
has written can be overwritten. The dialog says how much will land and how much
will not before anything happens.

## Motivation

A recurring timetable is retyped every week. The painted grid is the part that
repeats — teaching at the same hours, supervision on the same afternoon — and
it is also the most tedious thing in the app to reproduce, being 798 blocks a
week.

Carry-forward already solved the adjacent problem, and deliberately solved only
that one: it moves *unfinished commitments* forward as text. It copies no
`timeBlocks` at all, and drops `colorId` because `TodoItem` has no colour. The
repeating *shape* of a week has never been addressable.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Scope | Template a week; not duplicate a day, not named templates | The backlog bullet held two features. The weekly one is what the motivation describes, and it needs no new stored entity |
| What copies | `timeBlocks`, priority row text, row `colorId` | A timetable is the blocks and what the rows are called |
| What does not | Memos, `weekGoal`, `weekReview`, `weeklyTodos`, `carryResolved` | Those record a particular week. Re-stamping a memo onto a new week makes the log untrue |
| Collisions | Fill empty slots only, per block and per row | Non-destructive by construction, so no confirmation is needed to make it safe |
| Row placement | Compact into the first blank row | Matches `applyCarryForward`. Rejected alternative below |
| Day mapping | By index, 0–6 | Monday to Monday. The dates differ by definition |
| Source | Most recent week within 4 with at least one painted block | `findCarrySource`'s rule, for its reason: a holiday must not strand everything behind the gap |
| Trigger | Toolbar button opening a confirm dialog | A second bar would take its height out of the time grid |
| Provenance | No `origin` stamp | `origin` drives the age marker; a templated row is new work, not a slipping commitment |
| Past weeks | Allowed | The carry *bar* refuses because it appears unbidden. This is a button the user pressed, and it cannot destroy anything |

Rejected alternatives:

- **Duplicating a day instead.** A real feature, and smaller, but it is not what
  "recurring schedules get retyped every week" describes. Five duplications to
  rebuild a timetable is still retyping.
- **Named, saved templates.** More powerful and materially bigger: a new storage
  key, its own repair path, and a migration story. The most recent painted week
  is already a template, and applying it weekly chains the timetable forward.
- **Positional row placement.** Source row *i* into target row *i*, dropping the
  row when the slot is taken. It preserves a timetable's row order, which is
  read against the grid beside it. Rejected in favour of matching
  `applyCarryForward`: one row-landing rule in the codebase is worth more than
  each feature having its own.
- **Replacing the week after a confirmation.** The truest "apply my timetable",
  and the only option that can destroy work if the warning is clicked through.
- **Automatic application on opening an empty week.** Rejected for the reason
  carry-forward rejected it: the autosave effect runs on mount and `dirtyRef`
  exists because merely opening a week once wrote it straight back. Populating
  a week on open is that bug, deliberately.

## The module

A new `src/lib/week-template.ts`, sibling to `carry-source.ts` rather than more
of `planner-data.ts`, which is already 817 lines.

```ts
export interface TemplateSource {
  /** Repaired, via loadWeek. */
  week: WeekData;
  /** ISO Monday, for the dialog's label. */
  monday: string;
}

/** What applying would do, computed without doing it. */
export interface TemplatePreview {
  /** Empty here, painted there. */
  blocksToFill: number;
  /** Painted here and there — the user's paint wins. */
  blocksKept: number;
  /** Source rows that will land. */
  rowsToFill: number;
  /** Source rows that will not: duplicate text, or no blank row left. */
  rowsDropped: number;
}

export function findTemplateSource(currentWeekDate: Date): TemplateSource | null;
export function previewTemplate(target: WeekData, source: WeekData): TemplatePreview;
export function applyTemplate(target: WeekData, source: WeekData): WeekData;
```

`findTemplateSource` scans back from the previous week, up to four, and returns
the first stored week with at least one painted block. It differs from
`findCarrySource` in exactly that predicate: an existing-but-blank week is a
perfectly good carry source and a useless template. Same loop, different
question, so it is a sibling function rather than a parameter on that one.

**`blocksKept` counts collisions, not totals** — the blocks where the template
wanted to write and the user's paint won. What the template did not get to do is
the only number worth showing; how much paint the week already had is not.

## The copy rules

Days map by **index**, 0–6. The template's Monday is this week's Monday.

**Blocks.** A block copies when the target's value is `0` and the source's is
greater than `0`. Otherwise the target's value stands.

**Rows.** For each day, source rows are read in order; each one carrying text
lands in the target day's first blank row. A row is skipped when its trimmed
text already appears anywhere in that target day, which stops "Teaching" in the
user's row 3 being joined by the template's "Teaching". **That comparison
includes rows landed earlier in the same pass**, so a source day listing
"Teaching" twice lands it once. When no blank row remains, the remaining source
rows are dropped. Both kinds of skip count towards `rowsDropped`, which the
dialog reports as "won't land" rather than "won't fit", because a duplicate is
not a space problem.

A landed row is `{ subject, checked: false }`, plus `colorId` when the source
row carries one — the field is optional, and rows saved before it existed load
unflagged. **`flagged` and `origin` never copy.** `flagged` is the user declaring "this one matters *this week*";
`origin` means "the week this item was first written in" and drives the age
marker, so stamping it would render `1w` on a row created seconds ago.

**Nothing else is touched.** `memo`, `weekGoal`, `weekReview`, `weeklyTodos` and
`carryResolved` come through from the target unchanged.

**Neither week is mutated.** `applyTemplate` returns a new week, built from new
arrays. This is carry-forward's first rule and it exists because the source week
genuinely happened the way it happened.

**Applying twice is a no-op**, and falls out of the rules rather than being
enforced: after the first pass there are no empty slots left for the second to
fill. It is emergent, which is exactly why it needs a test.

## The dialog

`src/components/planner/TemplateDialog.tsx`, given the current `week` and an
`onApply`. Triggered from a toolbar button beside the search icon, labelled
"Copy a week's shape".

```
┌─ Copy a week's shape ─────────────┐
│ From  17 – 23 Aug 2026            │
│                                   │
│ Will fill    18 empty blocks      │
│              4 empty rows         │
│ Will keep    6 painted blocks     │
│ Won't land   1 row                │
│                                   │
│              [ Cancel ] [ Apply ] │
└───────────────────────────────────┘
```

Lines with a zero count are omitted rather than shown as `0`.

Three states:

- **No source.** "Nothing to copy. No week in the last four has anything painted
  in it." Close only.
- **Nothing would land.** "Every slot this template would use already has
  something in it." Apply disabled.
- **Normal.** The counts, Apply enabled.

The source and the preview are computed when the dialog opens, not held, because
weeks may have changed since it was last closed — including from another tab.

Applying closes the dialog. There is no result summary: the preview already said
what would happen, and the grid visibly changes behind it.

## Wiring

In `StudyPlanner`, following `bringForward` exactly:

```ts
const applyWeekTemplate = useCallback((source: WeekData) => {
  markDirty();
  setWeekData((prev) => applyTemplate(prev, source));
}, [markDirty]);
```

**The updater form is load-bearing.** A `useCallback` with a stable dependency
builds its closure once at mount. Closing over `weekData` instead of `prev`
captures the mount-time week forever: open on week A, navigate to week B, press
Apply, and A's contents are written under B's key. That is not hypothetical —
it is the documented `bringForward` trap, and the whole suite passed under it
until a test was added.

## Changes

| File | Change |
| --- | --- |
| `src/lib/week-template.ts` | New — `findTemplateSource`, `previewTemplate`, `applyTemplate` |
| `src/components/planner/TemplateDialog.tsx` | New — the trigger, the counts, the three states |
| `src/components/planner/StudyPlanner.tsx` | `applyWeekTemplate` callback; renders the dialog in the toolbar |
| `src/test/week-template.test.ts` | New — the copy rules |
| `src/test/template-source.test.ts` | New — the backwards scan |
| `src/test/template-dialog.test.tsx` | New — the dialog, including the navigate-then-apply trap |
| `CLAUDE.md`, `docs/design-notes.md` | Baselines; backlog item 1 replaced by what shipped |

## Testing

`week-template.test.ts`:

- A painted block lands in an empty slot.
- A painted block in the target is never overwritten.
- **Days map by index, not by date** — a source stored under a different Monday
  still lands Monday-on-Monday.
- Rows compact into the first blank row, in source order.
- A landed row is unchecked, keeps its `colorId`, and carries neither `flagged`
  nor `origin`.
- A row whose text already appears in that day does not land again.
- A source day listing the same text twice lands it once — the duplicate check
  sees rows landed earlier in the same pass.
- A source row with no `colorId` lands without one, rather than with `undefined`
  written into the field.
- A day with six full rows drops the remaining source rows.
- `memo`, `weekGoal`, `weekReview`, `weeklyTodos` and `carryResolved` are
  unchanged.
- **Neither the source nor the target is mutated**, asserted by deep-comparing
  each against a clone taken before the call.
- Applying twice changes nothing the second time.
- **`previewTemplate`'s counts equal what `applyTemplate` actually changes**,
  computed by diffing the week before and after. This is what stops the dialog
  lying about what it is about to do.

`template-source.test.ts`:

- Picks the most recent week with a painted block.
- Skips a week that is stored but has nothing painted.
- Gives up after four weeks and returns null.
- Returns null when nothing is stored.

`template-dialog.test.tsx`:

- Names the source week.
- Shows the counts.
- Apply calls `onApply` with the source week and closes.
- The no-source state, and the nothing-would-land state with Apply disabled.
- **Open on week A, navigate to week B, apply: B receives the content and A is
  untouched.** The same shape as the existing `bringForward` test, because it is
  the same closure hazard.

Mutation passes: change the day mapping from index to date and confirm the
mapping test goes red; replace `setWeekData(prev => …)` with a closure over
`weekData` and confirm the navigate-then-apply test goes red.

Browser pass, because jsdom sees no colour and no layout: apply a template to a
part-filled week and confirm the painted blocks land in the right hours with the
right colours, that existing paint is untouched, and that the dialog's counts
matched what actually happened.

## Out of scope

- **Duplicating a single day.** A separate feature; this one does not compose
  down to it.
- **Named or saved templates.** Would need a new stored entity with its own
  repair path.
- **Undo.** The operation cannot overwrite anything, so the worst case is
  content the user must clear rather than work they must recover. An undo stack
  is a larger feature than this one.
- **Choosing which week to copy from.** The most recent painted week within four
  is the rule; a picker is a separate decision if that proves too narrow.
- **Copying across into a future week you are not viewing.** It applies to the
  week on screen and nothing else.

## Risks

- **The source predicate ignores rows.** Someone who plans in priority rows and
  never paints gets "nothing to copy". Accepted: the motivation is the painted
  grid, and widening the predicate later is additive.
- **Compacting does not preserve a timetable's row order.** If the target day
  has a row in position 1, the template's first row lands in position 2. Chosen
  deliberately to keep one row-landing rule in the codebase, but it is the part
  of this design most likely to feel wrong in use.
- **The counts are a second implementation of the copy rules.** `previewTemplate`
  and `applyTemplate` could drift, and a preview that disagrees with the result
  is worse than no preview. The diff-based test is the guard, and it is the one
  test in this feature that must not be weakened.
