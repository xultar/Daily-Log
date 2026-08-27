# Renaming colour tags from the weekly strip

Date: 2026-08-26
Status: approved

## Summary

A button pinned to the right of the weekly colour strip opens a dialog listing
all twelve tags with an editable name each. Renaming saves as you type and the
strip updates behind the dialog. Arming a colour stays in the strip; the dialog
only renames.

## Motivation

The colour tags are the user's goals, and the only place to name them is the day
view's legend. Anyone working in the week view who wants to rename a tag has to
leave the week, rename, and come back.

The weekly strip could not simply copy the day view's answer. That legend is a
two-column grid of roughly 100px cells with room for a permanent text field
beside each swatch. The strip is a horizontal scroller of twelve entries at 10px
text, each sized to its content, and twelve always-visible inputs would need a
fixed width each and push most of the palette off screen.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Where renaming happens | One dialog listing all twelve | Adds one control to the strip instead of twelve, and gives the fields room the strip does not have |
| What the dialog does | Renaming only, never arming | A row then contains no `<button>` at all, so nested interactive content is impossible rather than merely avoided |
| Where the labels live | `WeeklyColorLegend`, `useMemo` → `useState` | Read once per mount either way, so the drag-paint cost is unchanged, but the strip can now update itself |
| Trigger placement | Pinned outside the scrolling container | Anything among the twelve entries scrolls off screen, which is where a feature goes to be undiscovered |
| Saving | On change, in the handler | Copies `DailyView.updateLabel`. An effect would write on mount, which is the bug that put `planner-color-labels: {}` into storage for users who had never named a tag |
| Clearing a field | Reverts to the palette default | The same rule as the day view, with the default shown as the placeholder so the fallback is visible |
| Draft state | None | No Save button and nothing to lose by closing |

Rejected alternatives:

- **Always-visible inputs in the strip**, transferring the day view's answer
  directly. Rejected on space: twelve fields each needing a width turns a strip
  you can read at a glance into one you must scroll to read at all. It also
  splits each entry's single arm-button into a button plus a field, shrinking
  the arm target to a swatch and a number — the 24px-minimum problem the day
  view already had to solve with `self-stretch` and negative margins.
- **Click the name to edit in place.** Keeps the strip's width and the common
  case at one click, but puts two controls that look like one inside each entry,
  and renaming stays invisible until found by accident.
- **Lifting the labels to `StudyPlanner`.** Superficially the tidy answer — one
  source of truth instead of two reads. It is a trap: `StudyPlanner` never
  remounts on a view switch, so a rename made in the day view would stop
  reaching the strip. It only works if the day view is lifted too, which is a
  larger change than this feature needs and rewrites a handler carrying its own
  hard-won comment.
- **The dialog owning a draft, with the strip re-reading on close.** Introduces
  a third copy of the labels and leaves the strip visibly wrong while the dialog
  sits open over it.
- **Arming as well as renaming in the dialog.** It would duplicate the strip's
  own job, and it would put buttons back into the rows, turning a structural
  guarantee back into a rule that needs a test to enforce.

## The strip

`WeeklyColorLegend` currently reads its labels once per mount:

```ts
const labels = useMemo(() => loadColorLabels(), []);
```

with a comment explaining that `loadColorLabels()` hits `localStorage` and the
component re-renders at drag-paint rate, and that this stays correct only
because the weekly branch is conditionally rendered — switching to the day view
and back genuinely remounts it, so a label edited there shows up here.

It becomes state:

```ts
const [labels, setLabels] = useState<Record<number, string>>(() => loadColorLabels());
```

A `useState` initialiser runs exactly once, so the read-once-per-mount property
and the remount behaviour are both unchanged. What changes is that the strip can
now update itself when the dialog edits. **The existing comment stays**, because
every reason in it is still true; it gains a line saying the strip is now also
an editor.

```ts
const updateLabel = (id: number, value: string) => {
  const next = { ...labels, [id]: value };
  setLabels(next);
  saveColorLabels(next);
};
```

This is `DailyView.updateLabel`'s shape on purpose. Saving in the handler rather
than from an effect on the labels is the whole point: the effect version ran on
mount as well as on change, so opening the view wrote back the labels it had
just read. Writing where the change happens leaves nothing for a mount to
trigger.

## The layout

The strip's outer element currently both scrolls and styles. It splits, so the
trigger can sit outside the scroller and stay reachable at any scroll position:

```
<div className="shrink-0 border-t border-border bg-muted/20 flex items-center">
  <div className="overflow-x-auto flex-1 min-w-0">
    <div className="flex items-center gap-3 px-2 py-1 w-max"> …twelve entries… </div>
  </div>
  <RenameTagsDialog labels={labels} onRename={updateLabel} />
</div>
```

The inner scroller keeps `w-max` on its row for the reason already recorded
there: it guards the trailing padding from being clipped at the container edge.

## The dialog

`src/components/planner/RenameTagsDialog.tsx`, taking `labels` and `onRename`.

The trigger is a ghost icon button carrying lucide's `Pencil`, sized to match
the strip's row rather than the toolbar's icons, `aria-label="Rename colour
tags"`. The content lists `getPaletteInDisplayOrder()` — swatch, display
position, input. **No minutes**: the strip already reports those, and a rename
list is not a report.

```
┌─ Rename colour tags ──────────┐
│ ■ 1  [Teaching            ]   │
│ ■ 2  [Admin               ]   │
│ ■ 3  [Supervision         ]   │
│ ■ 4  [Lavender            ]   │
│ …                             │
└───────────────────────────────┘
```

The position number is the display position, never the storage id — the same
distinction the strip and the day view both make, and the number the keyboard
shortcuts actually select.

Each input is `value={labels[c.id] ?? ""}` with `placeholder={c.label}` and an
`aria-label` of `Rename ${labels[c.id] || c.label}`. Editing calls `onRename`
directly, so the strip behind the dialog updates as the user types.

**Clearing stores an empty string rather than deleting the key**, which is what
the day view already does. Every reader falls back with `labels[id] || c.label`,
so an empty entry and a missing one are indistinguishable in the UI. This is
worth stating because the two are *not* indistinguishable in a backup: a cleared
tag travels as `{"1": ""}`. That is harmless, and matching the existing shape
matters more than tidiness, since both views write the same key.

**No row contains a button.** Arming stays in the strip, which means the rule
`legend-cell.test.tsx` enforces for the day view — that no cell nests one
interactive element inside another — holds here by construction. There is
nothing to nest.

## The keyboard guard

`TimeGrid` binds number keys on `window` to switch the armed colour, and bails
early when the event target is an `INPUT`, `TEXTAREA`, `SELECT`, is
`contentEditable`, or sits inside `[role="menu"]`, `[role="dialog"]` or
`[role="listbox"]`.

Typing "3" into a rename field is therefore safe twice over: the target is an
`INPUT`, and the field sits inside a portalled `role="dialog"`. The backlog's
warning — never put those roles on anything *in the strip* — is respected,
because the dialog renders in a portal at the end of `body` rather than inside
the scroller.

## Changes

| File | Change |
| --- | --- |
| `src/components/planner/WeeklyColorLegend.tsx` | `useMemo` → `useState`; `updateLabel`; layout split; renders the dialog |
| `src/components/planner/RenameTagsDialog.tsx` | New — trigger, twelve rows, inputs |
| `src/test/rename-tags-dialog.test.tsx` | New — the dialog and its effect on the strip |
| `CLAUDE.md`, `docs/design-notes.md` | Baselines; backlog item 2 replaced by what shipped |

## Testing

`rename-tags-dialog.test.tsx`:

- The trigger opens the dialog from the strip.
- All twelve tags are listed, in display order, under their current names.
- Typing a new name saves it to `planner-color-labels`.
- **The strip behind the dialog shows the new name**, which is the whole reason
  the memo became state.
- Clearing a field reverts that tag to its palette default, and the default is
  shown as the placeholder.
- **Opening the dialog writes nothing.** Asserted directly against storage,
  because a read that writes on mount is the exact bug `DailyView`'s handler
  shape exists to prevent.
- A number key typed into a rename field does not change the armed colour.
- No row nests one interactive element inside another.
- **The trigger is not a descendant of the scrolling container** — the structural
  assertion that stops someone tidying it back inside, where twelve entries
  would push it off screen.

Mutation passes: revert `useState` to `useMemo` and confirm the strip-updates
test goes red; move the trigger inside the scroller and confirm the structural
test goes red.

Browser pass, because jsdom sees no layout: confirm the trigger stays visible
with the strip scrolled fully right, that the dialog's twelve rows fit without
the fields being cramped, and that a rename is visible in the strip the moment
the dialog closes.

## Out of scope

- **Arming a colour from the dialog.** The strip already does it.
- **Lifting labels to `StudyPlanner`.** A larger change, and a regression risk
  for day-view edits, as recorded above.
- **Renaming from the month view.** It has no colour strip.
- **Reordering tags, or changing their colours.** Display order is frozen for
  muscle-memory reasons already recorded, and the palette is a storage contract.

## Risks

- **Two components now hold labels** — `DailyView` and `WeeklyColorLegend` —
  each reading once per mount. This is the state before this change, not a new
  problem, and the conditional rendering of the weekly branch is what keeps them
  agreeing. The comment recording that dependency must survive, because deleting
  it is how the fragility becomes invisible.
- **The trigger's placement is load-bearing but easy to "tidy".** It sits
  outside the scroller for a reason that is invisible at three tags and obvious
  at twelve. The structural test is the only thing that will say so.
- **A dialog for renaming is heavier than the day view's inline fields**, so the
  two views now answer the same question differently. Accepted: the strip has no
  room for the day view's answer, which is what the backlog note anticipated.
