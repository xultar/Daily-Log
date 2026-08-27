# Naming the priority-row delete control

**Date:** 2026-08-27
**Status:** approved
**Touches:** `src/components/planner/DailyView.tsx`, `src/test/daily-view.test.tsx`

## The problem

The button that removes a priority / action row rendered a bare `<X>` icon and
carried no `aria-label` and no `title`. Assistive technology announced it as an
unnamed "button", which is the whole of what it said.

It was the only unnamed control on the row. Its two neighbours — the colour
stripe and the flag — both carry an `aria-label` and a `title`, and both switch
that text on state. The delete control was the odd one out, not the norm.

The gap had already leaked into the tests. `src/test/daily-view.test.tsx` found
the button positionally, as the last button in the row, with a comment saying
why: there was no name to query by. A positional query is a symptom, not a
style choice, and it breaks the moment a fourth control joins the row.

## The second problem, which is not a naming problem

`removeSubject` refuses when a day is down to its last row:

```ts
if (day.subjects.length <= 1) return;
```

That guard is right — see `repairList` and the week-row-alignment spec for why a
day may legitimately hold one row — but the button looked identical either way.
Clicking it did nothing and said nothing. A control that silently no-ops is its
own defect, and naming it "Delete priority row" without qualification would have
made the lie more fluent rather than less.

## Decision

Name the control, and announce the refusal with `aria-disabled` rather than
`disabled`.

```tsx
aria-disabled={!canRemoveSubject}
aria-label={canRemoveSubject
  ? "Delete priority row"
  : "Delete priority row (a day keeps at least one)"}
title={canRemoveSubject
  ? "Delete priority row"
  : "A day keeps at least one row"}
```

`canRemoveSubject` is `day.subjects.length > 1`, derived once and read by both
the label and the guard, so the announcement cannot drift from the behaviour.

State-switching text matches the flag button beside it. That was the existing
idiom; this follows it rather than inventing a second one.

## Why not the real `disabled` attribute

It was the obvious choice and it is the wrong one, for two reasons.

**It removes the button from the tab order.** A keyboard or screen-reader user
would find nothing at that position and get no explanation of why. The point of
the change was to make the control speak; `disabled` makes it silent in a
different way. `aria-disabled` keeps it reachable, so the reason is audible.

**It would hollow out the test that already exists.** `disabled` suppresses the
click before any handler runs, so `fireEvent.click` would never reach
`removeSubject`. The existing test "refuses to delete the last remaining row"
asserts `onChange` was not called — and it would keep passing with the guard
deleted outright, because the attribute, not the guard, would be doing the
refusing. Mutation-testing confirmed this: adding `disabled` alongside
`aria-disabled` kills only the new focusable-and-clickable test and leaves the
refusal test green.

With `aria-disabled` the click still reaches `removeSubject`, the guard still
does the work, and its test still tests the guard.

## Tests

Four added to the `DailyView row deletion` block, and the positional helper
replaced with `getByRole("button", { name: /^Delete priority row/ })` — matched
loosely because the name grows an explanation on the last row.

- names the delete control (`toHaveAccessibleName`, `title`, `aria-disabled="false"`)
- announces the delete control as unavailable on the last row
- reveals the delete control on keyboard focus
- keeps the delete control focusable and clickable on the last row

All five mutations killed the test that claims to defend them:

| mutation | test killed |
| --- | --- |
| drop `aria-label` | names / announces-unavailable / (helper query fails) |
| freeze `aria-disabled` to `false` | announces the delete control as unavailable |
| add a real `disabled` | keeps the delete control focusable and clickable |
| freeze `title` to the available text | announces the delete control as unavailable |
| delete the `removeSubject` guard | refuses to delete the last remaining row |
| drop `focus-visible:!opacity-100` | reveals the delete control on keyboard focus |
| downgrade it to `focus:` | reveals the delete control on keyboard focus |
| drop the `!` | reveals the delete control on keyboard focus |

## Revealing it on keyboard focus

The button is `opacity-0` until its row is hovered. That hides the browser's own
focus outline along with the icon, so before this change a keyboard user could
reach the control and hear its name and still see nothing at all — the outline
was not missing, it was merely being rendered at zero opacity.

`focus-visible:!opacity-100` fixes both at once: revealing the button reveals the
outline that was already there. No focus ring was added; none was needed.

Two details are deliberate.

**`focus-visible` rather than `focus`.** A plain `:focus` also fires on
mouse-down, which would reveal the button under the cursor and undo the
hover-only design the row already has.

**The `!`, mirroring the neighbouring `hover:!opacity-100`.** The base is
`opacity-0` with `group-hover:opacity-50`. An unforced `focus-visible:opacity-100`
has the same specificity as `group-hover:opacity-50`, so which one won would be
decided by Tailwind's variant source order rather than by intent. The important
modifier settles it.

Three mutations, each killed by `reveals the delete control on keyboard focus`:
dropping the class, downgrading it to `focus:`, and dropping the `!`.

### The test can only assert the class, and why

jsdom loads no stylesheet, so the test asserts the class is present and cannot
assert that anything is revealed. This is the same limit the week-row-alignment
work ran into — measure it in a browser or not at all.

### The browser measurement, and the trap in it

Measured with a real Tab keypress: the delete button takes focus, matches
`:focus-visible`, and resolves to `opacity: 1` while its unfocused siblings stay
at `0`.

That reading is not straightforward to take, and the first attempt was wrong.
With the class present, the rule present, `:focus-visible` matching, no inline
style and the parent at opacity 1, `getComputedStyle` still reported **0**.

The cause was the harness, not the CSS. The browser pane was not displayed, so
the page was not compositing frames — `document.visibilityState` was `"hidden"`
— and **a page producing no frames does not advance CSS transitions**. The
element carries `transition-opacity`, so the transition sat frozen at its start
value forever.

Setting `style.transition = "none"` and re-reading gives `1` immediately.

Anything measuring a transitioned property in a headless or hidden pane must
suppress the transition first, or it will read the start value and conclude the
rule does not work.
