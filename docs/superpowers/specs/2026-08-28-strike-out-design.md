# Striking a task out

Approved 2026-08-28. Built 2026-08-28. Two things below did not survive contact
with the browser; both are corrected here rather than quietly left wrong.

**The 24px target was not achievable and should not have been specified.** These
rows are dense: the existing remove control measures 12x12 and the week column's
flag 12x10, in a sidebar row 20px tall. A 24px control would be twice its
neighbours and would grow the row. The strike button ships at 18x18 in the day
view and 16x16 in the sidebar — the largest control in either row. The 24px
figure in CLAUDE.md belongs to the daily legend cell, which is 25px tall; it was
carried across to a context it does not fit. Expanding the hit area with a
pseudo-element would give the accessibility benefit without the layout cost, but
it would be the only control in the app doing so, and that is a separate
decision about all of these rows rather than part of this feature.

**The sidebar button sits after the age marker, not beside the text.**
`carry-marker.test.tsx` pins the marker's position, on the reasoning that a
control between the marker and the text shoves the text sideways in a 128px
column. That test selected "the first button" in the row, which this feature
made ambiguous; its selector now names the remove control explicitly, so it
keeps meaning what its name says.

## Summary

A third outcome for an open task: struck out, meaning the user has decided it no
longer matters. Stored as one optional row field, toggled by a button in the day
view and in the Weekly Actions sidebar, rendered as a line through the text, and
excluded from carry-forward candidates.

## Motivation

The app is built around the Bullet Journal method, and carry-forward is
migration: it copies rather than moves, never runs by itself, and makes the user
choose each item. That friction is the point.

But the ritual has three outcomes, not two. Reviewing an open task ends with
migrating it, scheduling it, or striking it out because it is no longer
relevant. Daily Log implements the first and has no way to record the third, so
"I have decided this does not matter" and "I have not looked at this yet" are
both an unchecked box — the exact distinction the method exists to force.

The cost is concentrated in the carry bar. It offers every unchecked flagged row
every week, including ones the user has silently abandoned, so its count reads
as "boxes unticked" rather than "decisions outstanding". Items already dismissed
come back indefinitely, which is the failure mode that makes people stop reading
such a prompt at all.

## Decisions

**The field is `struck`, optional, and only literal `true` survives repair.** It
joins `checked`, `flagged`, `colorId` and `origin` on `SubjectRow`, and the same
field goes on `TodoItem`. Both `repairSubject` and `repairTodo` must name it —
they are separate functions, and `repairList` dispatches to them per item, so
adding it to one and not the other loses it on exactly half the rows. CLAUDE.md
is explicit that optional row fields are dropped unless repair knows them, and
with `tsconfig.app.json` setting `"strict": false` nothing would catch the
omission — the field would simply vanish on the next load.

**A struck row is not a checked row.** They are independent booleans. Checking
records that the task was done; striking records that it will not be. A row may
hold both — someone who ticks something and then decides it did not count is not
doing anything incoherent — and the strikethrough wins visually. No code clears
one when the other is set, because a rule like that is a rule to remember.

**Struck rows never become carry candidates.** One more condition in
`collectCarryForward`'s `take()`, alongside the existing checked, blank and
duplicate guards. This is the whole payoff, and the only behavioural change
outside rendering.

**`struck` never copies through a template**, consistent with the existing
decision that `flagged` and `origin` never copy. A template is a shape, and "I
abandoned this" belongs to the week it was decided in. `fillDay` rebuilds rows
from a named field list, so this happens by default — which is precisely why it
needs a test. The rule in CLAUDE.md is to spread the existing row and never
rebuild from a list of fields; here the rebuild produces the behaviour we want,
and an untested coincidence is not a decision.

**Reporting is untouched.** A tagged priority row counts as a use of its tag in
tag history and trends whether or not it is struck. The app reports blocked
time, not spent time — a plan later abandoned was still a plan that was made —
and leaving `eachStoredDay`'s consumers alone keeps the change small and the
existing trends assertions meaningful.

**Backups carry it for free.** The field lives on the row, so `exportAllData`
and `importFromJSON` need no change. A backup written before this feature loads
with `struck` absent, which repair reads as not struck.

## The control

A button on the row, toggling between striking and restoring, with `aria-label`
"Strike out" and "Restore" respectively. It appears in two places:

- **The day view row**, which already carries four controls — tag, checkbox,
  text field, flag — and has the width for a fifth.
- **The Weekly Actions sidebar row**, which is wider than a day column.

Both are needed because both are sources of carry candidates. Covering only
daily rows would leave the carry bar still offering struck weekly actions, so
its count would stay partly misleading.

**The week view's day columns render the strikethrough but cannot toggle it.** A
column is about 160px holding four controls at 9px type; a fifth would fall
under the 24px minimum target that the daily legend button was widened to meet.
Striking out is a deliberate review action, not something done while scanning a
week, so read-only rendering there is sufficient.

**The button is a sibling of the text field, never a parent.** A button may not
contain interactive content, and assistive tech commonly prunes the children of
`role="button"`. This repo has already fixed exactly that bug once in the daily
legend; the structure must not reintroduce it.

## Rendering

Line-through plus reduced opacity on the row's text, in the day view, the week
columns and the Weekly Actions sidebar.

**Tests assert the class, not the computed style.** This project pins jsdom v20,
whose `cssstyle` predates CSS Color 4 and silently drops values, so a style
assertion can pass vacuously. The visual result is confirmed in a browser
instead, which is also the only way to check the button clears 24px.

## Changes

| File | Change |
| --- | --- |
| `src/lib/planner-data.ts` | `struck?: boolean` on `SubjectRow` and `TodoItem`; `repairSubject` and `repairTodo` preserve `true` only; `collectCarryForward` skips struck items |
| `DailyView.tsx` | The toggle button on each row |
| `WeeklyTodoSidebar.tsx` | The same button on each todo |
| `DayColumn.tsx` | Strikethrough rendering, read-only |
| `src/lib/week-template.ts` | No change; `fillDay` already omits unnamed fields, pinned by a new test |

## Testing

- `repairSubject` preserves `struck: true`, and drops `false`, `"true"`, `1` and
  `null` — the same shape the `flagged` tests use
- A struck row survives a round trip through `saveWeek` / `loadWeek`
- A struck flagged row is not offered as a carry candidate
- A struck weekly action is not offered as a carry candidate
- An unstruck flagged row still is — the negative case, or the test above passes
  for the wrong reason
- `applyTemplate` never copies `struck`
- Editing a struck row's text keeps `struck` — the `{ ...s, [field]: value }`
  spread trap, which is how `colorId`, `flagged` and `origin` are already lost
- The toggle button has an accessible name in both places
- Toggling twice returns the row to its original state

**Mutation-test each of these.** Break the line the test defends and confirm
that test fails, then confirm the mutation actually applied — a mutation that
silently fails to apply and one that survives look identical in the output.

## Out of scope

- Striking from the carry bar itself. It would have to write the decision back
  into a past week, which is the cross-week write behind the `bringForward` bug.
- Any change to reporting, the month wash, or trends.
- A `>` migrated marker on the source row, and scheduling to a chosen week. Both
  are on the backlog separately.

## Risks

**A dropped field is silent in both directions.** `strict` is off, so a typo in
the repair function's field name compiles, loads, and quietly discards the
user's decision on every read. The repair tests are the only thing standing
between that and lost data, which is why they are mutation-tested rather than
merely written.

**The strikethrough must not be the only signal in print.** Print reduces the
palette to grey, and a line through 9pt text at A4 landscape may not survive.
Check it against the existing print CSS; if it does not read, the fix belongs
with the run-number treatment that already exists for tags, not with a colour.
