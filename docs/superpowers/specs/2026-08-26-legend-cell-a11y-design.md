# The daily legend cell

Date: 2026-08-26
Status: approved

## Summary

Each cell of the daily colour legend is a `<button>` with a text `<input>` inside
it. Split them into siblings, so the cell becomes a plain container holding a
button that arms the colour and a field that renames it.

Add the `aria-pressed` the daily legend has never had, which is the second
accessibility defect in the same twenty lines.

## Motivation

A `<button>` may not contain interactive content. It is invalid HTML, and the
practical consequence is that assistive technology commonly prunes the children
of `role="button"` and announces the button by its name alone — so the field
that renames a tag can be unreachable and unannounced. What holds it together
for mouse users is `onClick={(e) => e.stopPropagation()}` on the input, which
stops a click landing on the label from also arming the colour.

The weekly legend is the same shape and has none of this: it renders the label
as a `<span>`, so its cell is a plain button and is correct. Only the daily
legend, where labels are editable, has the problem.

It also blocks a wanted feature. Editing labels from the weekly strip would
reproduce the same mistake in a second place, so the strip has been left
read-only until this is fixed.

The daily cell is also missing `aria-pressed`, which the weekly cell has. A
screen reader user in the day view is not told which colour is armed.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Structure | Sibling button and input inside a plain `div` | The only arrangement that is valid HTML and keeps inline renaming |
| Renaming | Stays inline, one click and type | Labels get tweaked through a term, not set once |
| Arming target | The swatch and number cluster | Everything else in the cell is the field or its total |
| `aria-pressed` | Added | The weekly cell has it; the daily one never did |
| Key hint | In the button's accessible name | Positions 11 and 12 have no key and say nothing |
| `stopPropagation` | Removed | It exists only to hold the invalid nesting together |

Rejected alternatives:

- **A `<div>` with an `onClick` for the whole cell.** Restores the large click
  target and is exactly the anti-pattern this change exists to remove: a
  clickable thing that is not reachable by keyboard.
- **Putting the minutes inside the arming button** to widen the target. The
  layout puts minutes to the right of the label, so the button would have to be
  split in two or the cell reordered. A second button per cell is worse than a
  smaller one.
- **Renaming behind an edit affordance** — a pencil, or double-click. Cleanest
  possible structure, one control per cell, and wrong for something adjusted
  through a term rather than set once.

## The structure

    <div className={cell classes, from legendCellBorders}>
      <button
        type="button"
        aria-pressed={activeColor === c.id}
        aria-label={`Use ${name}${keyHint}`}
      >
        <span swatch />
        <span>{displayPosition}</span>
      </button>
      <input aria-label={`Rename ${name}`} … />
      {minutes > 0 && <span>{formatMinutes(minutes)}</span>}
    </div>

`name` is the custom label if one is set, otherwise the palette's own — the same
value the weekly legend already shows, so the two agree.

`keyHint` is ` (key 1)` through ` (key 9)`, ` (key 0)` for display position 10,
and empty for 11 and 12, which have no key. The digit is the **display
position**, never the storage id: it is what the keyboard actually selects.

`aria-label` on the button overrides its contents for naming purposes, so the
swatch and the number inside it need no further treatment.

## What this breaks

`legend-borders.test.tsx` selects cells with `.grid.grid-cols-2 > button`. The
cell is no longer a button, so that selector finds nothing and every test in the
file fails at once. They are re-pointed at the container, not deleted — the
border behaviour they describe is unchanged, and `legendCellBorders` already
owns the arithmetic.

This is the one place where the palette change and this change genuinely
interact, and it is why this was left until twelve cells existed: re-pointing
the selector twice would have been wasted work.

## Testing

Behaviour that has no test today and gets one here, because the restructure is
otherwise unprotected:

- Clicking the swatch arms that colour.
- Typing in the field renames that colour and does not arm it — the behaviour
  `stopPropagation` used to provide, now provided by the structure.
- The armed cell reports `aria-pressed`, and the others report it false.
- The button is named for the colour and its key: `Use Blue (key 1)`.
- A renamed colour is named by its new name in both controls.
- Positions 11 and 12 are named without a key hint.
- The field is reachable as a textbox in its own right — `getAllByRole("textbox")`
  finds twelve of them, which is the assertion that fails if anything nests them
  back inside a button.
- No cell contains a nested interactive element. A structural assertion, so a
  future edit cannot quietly reintroduce the defect.

Each is mutation-tested.

## Out of scope

- Editing colour labels from the weekly strip. This unblocks it; it is its own
  change, and the pattern established here is what it should copy.
- The arming click target's size beyond making the button comfortably clickable.
- Any change to how labels are stored.

## Risks

**The arming click target shrinks.** Today the whole cell arms except the label
field; afterwards only the swatch-and-number cluster does, and clicks on the
minutes total do nothing. Keys 1-9 and 0 are unaffected and the right-click
picker still reaches everything.

It lands hardest on chartreuse and brown, which have no key, so their only
affordances become that small button and the picker. If it proves annoying, the
answer is a wider button rather than a clickable container.

**The label field becomes a tab stop in its own right.** It already was one —
an input inside a button is still focusable — so the tab order does not change.
Worth stating because it looks like it should.
