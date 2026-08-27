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

Three added to the `DailyView row deletion` block, and the positional helper
replaced with `getByRole("button", { name: /^Delete priority row/ })` — matched
loosely because the name grows an explanation on the last row.

- names the delete control (`toHaveAccessibleName`, `title`, `aria-disabled="false"`)
- announces the delete control as unavailable on the last row
- keeps the delete control focusable and clickable on the last row

All five mutations killed the test that claims to defend them:

| mutation | test killed |
| --- | --- |
| drop `aria-label` | names / announces-unavailable / (helper query fails) |
| freeze `aria-disabled` to `false` | announces the delete control as unavailable |
| add a real `disabled` | keeps the delete control focusable and clickable |
| freeze `title` to the available text | announces the delete control as unavailable |
| delete the `removeSubject` guard | refuses to delete the last remaining row |

## Known, and deliberately out of scope

The button is `opacity-0` until the row is hovered, and nothing reveals it on
keyboard focus. It is now reachable and named but still invisible to a sighted
keyboard user who tabs to it — a focus-visibility gap that predates this change
and is not fixed by it.
