# Lining the week's priority rows up across days

Date: 2026-08-27
Status: approved

## Summary

Every column in the week view renders the same number of priority rows: the
longest visible day. Columns with fewer real rows are padded with inert spacers.
Nothing about what is stored changes.

## Motivation

The 2026-08-27 shakedown opened a week damaged in every way at once and found
Monday rendering three priority rows while the other six rendered six. Monday's
time grid then started higher than its neighbours, and the week's rows stopped
lining up across days — which is most of what makes the grid readable.

**The backlog recorded this as a repair bug. It is not, and the fix it proposed
would have made things worse.** Three things were established before any code was
written:

1. **`repairList` preserving length is deliberate, and says so.** Its comment
   reads: *"Both views let a user delete rows down to one, so padding a
   short-but-real list would resurrect rows they removed on purpose."*
   `DailyView.removeSubject` really does delete subject rows. Padding at the
   `subjects` call site — the backlog's suggested fix — would resurrect deleted
   rows on the next load, trading a documented data rule for a cosmetic one.
2. **No damage is needed to reproduce it.** Delete three rows on Monday in the
   day view, switch to the week view, and Monday's grid sits higher than the
   rest. The shakedown found it through a corrupted week, which made it look like
   a repair problem; it is reachable by ordinary use.
3. **Padding to six would not have fixed it.** `DailyView.addSubject` has no cap,
   so a day with *eight* rows throws the other six columns out in the opposite
   direction. A fix pinned to the number six cannot address that.

The actual defect is that `DayColumn` renders `day.subjects.map(...)` with no
shared height, so each column sizes itself independently, while the grid below
only reads correctly when every column agrees.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Where the fix lives | The week view, not repair | Storage is the user's only copy and the stored lengths are correct; it is the rendering that assumes they match |
| Row count | The longest **visible** day | `visibleDays` already exists and is weekend-aware. Padding weekdays to match a Saturday nobody can see reads as unexplained empty space |
| Floor | None | If every day has three rows, three is right. A floor of six shows blank rows to a user who deliberately trimmed every day |
| Padding | Inert spacers | Nothing stored, nothing focusable, and no way to create a row from a view that has never created one |
| Spacer semantics | `aria-hidden` | They are alignment, not content. Seven columns of empty rows in the accessibility tree is noise |
| Where the count is computed | `StudyPlanner` | It owns `visibleDays`. A column cannot know the longest day without being told |
| `planner-data.ts` | Untouched | `repairList` keeps its rule and its comment stays true |
| `addSubject` | Uncapped, as now | Capping it would be a second behaviour change to fix a rendering bug |

Rejected alternatives:

- **Pad `subjects` to six at the `repairList` call site**, which is what the
  backlog item asked for. Rejected on both counts above: it resurrects
  deliberately deleted rows, and it cannot handle a day with more than six.
- **A fixed six rows everywhere**, dropping add and remove from the day view and
  normalising stored days. The simplest model, and the grid becomes rigid by
  construction — but it removes a feature people may rely on and rewrites stored
  days, which is the thing this repo is most careful about.
- **Each column padding itself to six.** Local, no prop threading, and wrong for
  the same reason as the repair fix: it is a constant where the requirement is an
  agreement between columns.
- **Giving the subjects block a fixed pixel height** and letting rows overflow or
  underfill. No prop needed, but it either clips a day with eight rows or leaves
  a gap that the grid lines do not cross.

## The count

```tsx
// StudyPlanner, beside the other derived week values
const subjectRows = useMemo(
  () => Math.max(1, ...visibleDays.map((d) => d.subjects.length)),
  [visibleDays]
);
```

`Math.max(1, ...)` rather than a bare spread. `repairWeek` rebuilds an empty
`subjects` to six so a repaired day always has at least one row, but this value
is read straight from `weekData` and a bare `Math.max()` over an empty list
returns `-Infinity`, which would render nothing at all. The floor costs one
argument and removes that whole class of outcome.

It is passed to `DayColumn` as `rowCount`.

## The spacers

`DayColumn` renders its real rows unchanged, then `rowCount - day.subjects.length`
spacers. A spacer carries the same wrapper classes as a real row — including
`border-b border-campus-grid last:border-b-0`, so the horizontal rules stay
continuous and the final row still has no trailing border — and mirrors the row's
children as empty equivalents rather than repeating its controls.

**Height matching is the whole job, and it is the one thing a test cannot
check.** A real row's height is whichever of its children is tallest: the 12px
checkbox (`h-3`), the 9px text input with `py-[1px]`, or the 10px flag icon. A
spacer has to reproduce that without reproducing the controls.

`aria-hidden="true"` on each spacer. They contain no checkbox, no colour stripe,
no input and no flag button, so nothing is focusable and the accessibility tree
is exactly what it was before.

## Verification

jsdom performs no layout, so **no test in this suite can confirm the columns
actually line up.** Every test below checks the row *count* and the absence of
controls; none of them can see a pixel.

The acceptance check is therefore a measurement in a browser: with one day
holding fewer rows than the others, `TimeGrid`'s `offsetTop` must be identical in
every column. This is the same lesson the month-notes work learned the expensive
way — a `scrollHeight` bug that no test could have caught, found only by looking.

## Testing

`src/test/week-row-alignment.test.tsx`

- Monday with three rows and the rest with six: every column renders six row
  slots.
- A day with eight rows: every column renders eight. This is the case a
  pad-to-six fix could never address, so it is asserted first.
- All seven days with three rows: every column renders three, not six. There is
  no floor.
- Weekends hidden, Saturday holding eight rows: the weekday columns render six,
  not eight.
- A spacer exposes no textbox, no checkbox and no button, and carries
  `aria-hidden`.
- The real rows are still editable, and typing into the last real row of a padded
  column edits that row rather than a spacer.

`src/test/week-repair.test.ts`

- A stored day whose `subjects` array is short is repaired to **the same length**,
  not padded to six. The backlog asked for a test here; this is that test,
  asserting the opposite of what the item expected, because the behaviour it
  wanted to change is deliberate.

`src/test/daily-view.test.tsx`

- Deleting a subject row and reloading the week leaves it deleted. A regression
  guard against someone reinstating the padding fix later.

## Out of scope

**Capping `addSubject`.** A day may hold as many rows as the user makes.

**Any change to what is stored.** No migration, no repair change, no new key.

**The day view's own layout.** It renders one day and has nothing to line up
against.

## Risks

**The spacer's height is matched by construction, not by assertion.** If someone
changes a real row's markup — a taller checkbox, a different font size — the
spacer can silently stop matching and the columns drift apart again, with the
whole suite green. The spacer's comment says this, and the browser measurement in
Verification is the only thing that would catch it.

**`rowCount` is a prop that must not go stale.** It is derived from
`visibleDays`, so toggling weekends recomputes it. If a future change memoises it
against something narrower than the days themselves, a column can render against
last render's count.
