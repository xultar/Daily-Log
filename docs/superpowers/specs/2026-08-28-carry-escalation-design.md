# Escalating a repeatedly migrated item

Approved 2026-08-28. Built 2026-08-28, as designed — no decision here was
reversed in the building.

One test that the plan called for turned out to exist already: `carry-marker`
pins the sidebar's cap at three weeks and its colour change past two, so the
extraction was guarded before a line of it was written. Both mutations were
killed by those tests rather than by the new ones.

## Summary

The carry-forward bar sorts its candidates oldest first and gives each one a
left rule that thickens with age, reusing the scale `WeeklyTodoSidebar` already
uses. Presentation only: nothing new is stored, and `collectCarryForward` is not
touched.

## Motivation

The Bullet Journal method treats an item that keeps moving as the signal to
question it. Rewriting a task by hand is what forces that question, and
carry-forward keeps the friction deliberately — it copies rather than moves,
never runs by itself, and makes the user choose each item.

What it does not do is say which items have been through that choice before. The
bar lists candidates in a fixed order with a plain age token, so an item pushed
five times looks identical to one pushed once, at exactly the moment the user is
deciding whether to push it again. The signal is absent where the method most
wants it.

**The escalation is not missing everywhere.** `WeeklyTodoSidebar` already
thickens a row's left rule with age and turns it `destructive` past two weeks.
That is the right treatment in the wrong place on its own: the sidebar is where
a carried item lives afterwards, and the bar is where the decision is made.

## What is already true, and was nearly got wrong

**Every carried item lands in Weekly Actions**, including a flagged daily row.
`applyCarryForward` says why: a row that failed to happen on Tuesday no longer
belongs to a day, and re-pinning it to one would be a guess. So a daily row
never receives an `origin`, and "show the age on the row itself" is not a
separate option — the row a carried item lives on *is* a sidebar row, and it
already escalates. An earlier draft of the backlog item offered that as an open
question; it was confused.

**`origin` survives repeated carries on purpose.** `collectCarryForward`'s
`take()` keeps an existing origin rather than restamping it, which is what makes
the age keep counting and a repeated carry idempotent. Nothing here may reset it.

## Decisions

**Sorting happens in the bar, at render.** `collectCarryForward`'s order is part
of its contract and is asserted by existing tests; this feature is presentation,
so it stays presentation. Sorting is by age descending.

**The tick state stays keyed to the original positions.** This is the whole risk
of the change. `excluded` is a `Set<number>` of indices into `candidates`, and
`chosen` is `candidates.filter((_, i) => !excluded.has(i))` — the component's own
comment says the tick state is keyed by position. Sorting the array naively
would glue an untick to a slot rather than to an item, so unticking the third
row would drop a different task than the one the user unticked, silently and
only when ages differ.

The bar therefore builds a view of `{ candidate, originalIndex, age }`, sorts
*that*, and keeps `toggle`, `excluded` and `chosen` addressed by
`originalIndex`. No existing state shape changes.

**Ties keep their existing order.** `Array.prototype.sort` is stable, so items
of equal age preserve the todos-then-days sequence `collectCarryForward`
produces, and the list does not reshuffle between renders. Pinned by a test
rather than trusted to the engine.

**The rule mirrors the sidebar's scale exactly**: 2px through one week, 4px at
two, 6px at three and beyond; `destructive` past two weeks; transparent when
there is no origin. Ordering already separates a twelve-week item from a
three-week one by floating it to the top, so sharing the cap costs little.

Worth recording, because it is the reason the two could legitimately diverge
later: the sidebar caps at three for a *layout* reason its comment gives — a
long-slipped item must not crowd the text out of a 128px column. The bar has
more room. Mirroring is a consistency choice here, not a forced one.

**The scale is extracted, not copied.** One `carryRuleClass(age)` used by both
components, so they cannot drift. This edits `WeeklyTodoSidebar` without
changing any class it emits.

**It lives in a new `src/lib/carry-age.ts`**, matching the repo's habit of small
focused modules — `carry-source.ts`, `week-template.ts`, `month-notes.ts`. The
two obvious homes are both wrong. `planner-data.ts` holds `carriedWeeks` and
would be the neighbourly choice, but it is already 817 lines and the file this
repo names as the big one, and a Tailwind class helper is presentation rather
than week shape. `AgeMarker.tsx` owns how age is *shown* and is imported by both
call sites, but exporting a non-component from a component file trips
`react-refresh/only-export-components` — the lint baseline is 0 errors and
exactly 10 warnings, all pre-existing, and an eleventh would make that baseline
lie.

**Both signals survive the hostile cases.** Order and thickness carry in a mono
print and under all three dichromacies; the `destructive` colour is decorative
on top of thickness, never the only channel. This is the same constraint that
put printed run-numbers on colour tags.

**No new ARIA.** `AgeMarker` already supplies the spoken "carried N weeks"
beside the aria-hidden "3w" token, and ordering improves the screen-reader
experience for free by announcing the worst offender first. The rule is
decorative.

## Changes

| File | Change |
| --- | --- |
| `src/lib/carry-age.ts` | New. `carryRuleClass(age)`, returning the border classes for an age |
| `CarryForwardBar.tsx` | Sort a `{ candidate, originalIndex, age }` view by age descending; render the rule; keep every index reference on `originalIndex` |
| `WeeklyTodoSidebar.tsx` | Use `carryRuleClass` in place of its local `RULE_WIDTH` block; output unchanged |

## Testing

- The bar lists a three-week item before a one-week item, whatever order
  `collectCarryForward` returned them in
- Two items of equal age keep their original relative order
- **Unticking a row that sorting has moved excludes the item the user
  unticked**, not the item now sitting at that index — the trap above, and the
  reason to write this test first
- `Bring N forward` reports the count the ticks imply after sorting
- `carryRuleClass` returns 2px, 4px and 6px at ages 1, 2 and 3, and the same
  6px at 12 — the cap
- `carryRuleClass(0)` is the transparent rule
- `destructive` appears past two weeks and not at two
- The sidebar emits the same classes after the extraction as before it

**Mutation-test each of these,** and confirm each mutation applied — a mutation
that fails to apply and one that survives look identical in the output. The
extraction test is worth particular care: it passes trivially while the
extraction is correct, so it proves nothing until a mutation has killed it.

## Out of scope

- Raising the sidebar's three-week cap.
- Unticking an old item by default. It is the most faithful reading of the
  method, and it was declined for this pass because it changes behaviour rather
  than presentation and can silently drop something the user wanted.
- Any change to `collectCarryForward`, including its order.
- Showing an age on a daily row. Carried items do not land there.

## Risks

**The index bug would be silent and data-affecting.** It drops the wrong task
from a migration, leaves no error, and only appears when candidates have
differing ages — which no existing test creates. This is the one place in the
change where being wrong costs the user something, so its test comes first.

**The extraction can regress the sidebar invisibly.** `carry-marker.test.tsx`
pins the marker's position and the age token, but not every border class. The
extraction test above closes that gap; without a mutation proving it fails, it
is decoration.
