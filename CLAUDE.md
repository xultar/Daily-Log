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

## A stored week is repaired, never replaced

`loadWeek` runs everything it reads through `repairWeek`. The rule is that a
stored week is the user's only copy, so damage is repaired *around* whatever
survived — it is never swapped for an empty week just because one field is
wrong. Two things follow, and both are easy to undo by accident:

- **Rebuild only a list that is missing or empty.** `DailyView.removeSubject`
  and `WeeklyTodoSidebar.removeTodo` both let a user delete rows down to one, so
  padding every short list back up to its default length would resurrect rows
  they deleted on purpose. `repairList` encodes this; do not "fix" it into an
  unconditional pad.
- **The unreadable-entry backup must not start with `planner-`.** When JSON
  parsing fails outright, the raw text is copied to
  `daily-log-unreadable-<weekKey>`. `exportAllData` treats *every* `planner-*`
  key as a week, so parking the backup under that prefix would feed it straight
  into the exporter (see the CSV bug below).

**Saving is gated on `dirtyRef` in `StudyPlanner`.** The autosave effect runs on
mount and on every week change, not only on edit, so before the gate existed
merely opening a week wrote it straight back — which is how an unreadable week
became an empty one 300ms after it was viewed. The load effect clears the flag,
which is also what stops a pending edit to the week just left from being written
under the new week's key. `src/test/autosave.test.tsx` pins all of this.

Repair happens in memory only. Viewing a damaged week leaves storage untouched
until the user actually changes something.

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

- `npm test` — 65 tests across 5 files
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

**`getWeekKey` can give two different weeks the same key.** It pairs
`getISOWeek` with `getYear(startOfWeek(...))`, and those disagree when a
December Monday belongs to ISO week 1 of the next year. The week of
2024-12-30 and the week of 2024-01-01 both key to `planner-2024-W01`; the next
occurrence is 2029-12-31. Editing one silently overwrites the other. The fix is
`getISOWeekYear`, but it relabels those December weeks, so it needs a migration
rather than a one-line change.

**CSV export always throws.** `exportAllData` treats every `planner-*` key as a
week, and `planner-show-weekends` (written on every mount) and
`planner-color-labels` both match, so `exportAsCSV` dies on `week.days is not
iterable`. It also quietly pollutes the JSON export. Match the key shape
instead of the prefix.

**There is no error boundary.** A render-phase throw unmounts the whole app and
leaves a white screen that survives reload, because the data that caused it is
persisted. `repairWeek` closes the paths reachable through `loadWeek`, but
`importFromJSON` still writes unvalidated objects straight to storage.

## Design docs

`docs/superpowers/specs/` holds the approved designs and `docs/superpowers/plans/`
the implementation plans. They record why decisions were made, including several
that were reversed after review — read the spec before changing behaviour it
describes.

One history note: commit `a51b69e` has a message about plan updates but also
contains `src/hooks/use-is-dark.ts` and a `ColorPicker.tsx` change, because a
`git add -A` ran while other edits were in progress. The code is correct; only the
commit boundary is untidy.
