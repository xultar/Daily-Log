# Daily Log — working notes

A weekly planner that runs entirely in the browser. All data lives in the user's
`localStorage`; there is no server and no account.

Live at https://xultar.github.io/Daily-Log/

## Before you change anything

**Pushing to `main` deploys.** `.github/workflows/deploy.yml` fires on every push
to `main` and publishes to GitHub Pages. Work on a branch and merge only when the
change has been seen working. Merging is the user's call, not yours.

**The base path is `/Daily-Log/`.** `vite.config.ts` sets it, and it applies in
development too, so the dev server serves at `http://localhost:8080/Daily-Log/`,
not at `/`. If this ever disagrees with the repository name, every asset 404s and
the page renders blank.

## The one rule that can corrupt user data

There are two numbers that both look like "the colour number", and confusing them
writes wrong values into weeks people have already planned.

- **Storage id** — the 1-based position in `BLOCK_COLORS`. It is what gets
  persisted: the values inside `timeBlocks`, the keys of `planner-color-labels`,
  and `SubjectRow.colorId`. It never changes.
- **Display position** — the 1-based position in `COLOR_IDS_IN_DISPLAY_ORDER`
  (`[1,2,3,4,5,7,8,9,6]`). It is what the user sees beside a swatch and what the
  number keys select.

They differ for four of the nine colours. Gray is storage id 6 but display
position 9; yellow is 7 but 6; teal is 8 but 7; magenta is 9 but 8.

Consequences:

- `BLOCK_COLORS` is **append-only**. Never reorder or remove an entry. To change
  how the palette is presented, edit `COLOR_IDS_IN_DISPLAY_ORDER`. A test pins
  every entry to its position; it exists because a reorder plus a tidy
  renumbering of the `id` fields once passed the entire suite green.
- Display position appears **only in rendering**. Translation happens in exactly
  one place, `colorIdForDisplayPosition`.
- `tsconfig.app.json` sets `"strict": false`, so `strictNullChecks` is off. The
  `number | null` return from `colorIdForDisplayPosition` is a documentation
  promise the compiler does not enforce. A missing null guard writes `null` into
  `timeBlocks`, which persists and then fails silently in both directions —
  `getBlockColor(null)` returns null so the block looks unpainted, and
  `calcDayTotal`'s truthiness check skips it so the totals look right.

## Traps that cost time to find

**Do not rewrite `updateSubject`** in `DailyView.tsx` or `DayColumn.tsx`. Its
`{ ...s, [field]: value }` spread is the only thing preserving a row's `colorId`
through a keystroke. Replacing it with explicit setters that list fields drops
the tag with no type error, because the field is optional and strict is off.
`src/test/daily-view.test.tsx` guards this — do not delete it.

**Do not assert on rendered styles in tests.** This project pins jsdom v20, whose
`cssstyle` predates CSS Color 4. Setting `style.backgroundColor = "hsl(213 60%
80%)"` yields an empty string, so a style assertion reads empty and — worse — a
negative assertion passes vacuously. Assert on the `onChange` payload instead.
Real browsers handle the syntax fine; only jsdom drops it.

**Do not add `role="menu"`, `role="dialog"` or `role="listbox"`** to the colour
picker or anything containing it. `TimeGrid`'s keydown guard tests
`closest?.('[role="menu"], [role="dialog"], [role="listbox"]')` so Radix menus can
swallow digits. Adding any of those roles silently disables the number-key
shortcuts whenever focus sits inside. Correct ARIA and the shortcut are in
tension; that needs a deliberate decision.

**Pass `setActiveColor` by identity, never wrapped in a lambda.** `TimeGrid`'s
keydown effect lists it as a dependency. An inline arrow at any call site makes
all seven weekly grids tear down and re-register their `window` listener on every
render — measured at 7 registrations for the app's lifetime versus 7 per render.

**A secondary-button press never fires `click`.** It fires `pointerdown`,
`mousedown`, `contextmenu`, `mouseup`, `auxclick`. `ColorPicker` therefore
dismisses on `mousedown`, and its container stops propagation for both `mousedown`
and `click`. Removing the `onMouseDown` stopPropagation breaks picking entirely,
because mousedown would unmount the button before its click fires.

## Baselines

- `npm test` — 41 tests across 3 files
- `npm run lint` — **0 errors, 10 warnings**. All ten are pre-existing
  `react-refresh/only-export-components` and `react-hooks/exhaustive-deps` in
  `src/components/ui/*`, `MonthlyView.tsx` and `theme-context.tsx`. Do not treat
  them as new; do treat any error as new.
- `npm run build` — clean
- `npm run dev` — serves at `http://localhost:8080/Daily-Log/`

## Known open issues

**Dark mode is half-wired.** `tailwind.config.ts` sets `darkMode: ["class"]` but
nothing in the app ever adds `.dark` to any element, so the `.dark` block in
`index.css` is dead and the chrome is always light. Meanwhile `useIsDark` reads
`prefers-color-scheme`. On an OS-dark machine the palette flips to `hslDark` while
the background stays white, so swatches render dark-on-light and the 16% row wash
reads muddier than designed. Not broken, but wrong. Fixing it means deciding
whether the app should follow the OS, follow a class, or expose a toggle.

**The daily legend's bottom edge** renders doubled across the left half only, since
the lone ninth cell keeps its `border-b` against the container's. Cosmetic.

**The `<input>` inside `<button>`** in the daily legend is invalid HTML and
pre-existing. Assistive tech commonly prunes children of `role="button"`, which can
make the label field unreachable. The `stopPropagation` on that input is what holds
it together for mouse users. Fixing it needs a real restructure.

**`compact` on `DayColumn`** is declared and never used.

## Design docs

`docs/superpowers/specs/` holds the approved designs and `docs/superpowers/plans/`
the implementation plans. They record why decisions were made, including several
that were reversed after review — read the spec before changing behaviour it
describes.

One history note: commit `a51b69e` has a message about plan updates but also
contains `src/hooks/use-is-dark.ts` and a `ColorPicker.tsx` change, because a
`git add -A` ran while other edits were in progress. The code is correct; only the
commit boundary is untidy.
