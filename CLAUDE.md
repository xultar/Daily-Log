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
- **The unreadable-entry backup stays off the `planner-` prefix.** When JSON
  parsing fails outright, the raw text is copied to
  `daily-log-unreadable-<weekKey>`. Settings and weeks already share the
  `planner-` prefix, and that overlap is what broke the exporter once; keep new
  entries out of it rather than relying on the shape match to sort them out.

**Saving in `StudyPlanner` turns on two refs, and they answer different
questions.** `dirtyRef` asks whether `weekData` holds a change the user made.
The autosave effect runs on mount and on every week change, not only on edit, so
without that gate merely opening a week wrote it straight back — which is how an
unreadable week became an empty one 300ms after it was viewed.

`pendingRef` asks whether a write is still waiting out the 300ms debounce, and
**which week it belongs to**. Anything that ends the debounce early has to write
it rather than drop it, and there are three such things:

- **Leaving the week.** React runs the save effect's cleanup, clearing the
  timer, *before* the load effect runs, and the load effect then clears
  `dirtyRef` — so nothing rescheduled the write and the edit was simply lost.
  The load effect now calls `flushPendingSave` first. The date comes from
  `pendingRef`, not from `currentDate`, so it lands on the week it was made in.
- **Unmounting**, covered by the cleanup of the `pagehide` effect. Effects clean
  up in declaration order, so the debounce timer is already cleared by then.
- **The tab closing.** React does not unmount for that, hence the `pagehide`
  listener.

`flushPendingSave` touches only refs, which is what makes it stable enough to
list as an effect dependency without re-registering anything.
`src/test/autosave.test.tsx` and `src/test/pending-save.test.tsx` pin all of it,
including that flushing early does not defeat the debounce — a burst of typing
must still collapse to one write.

Repair happens in memory only. Viewing a damaged week leaves storage untouched
until the user actually changes something.

## Week keys pair an ISO week with an ISO week-year

`getWeekKey` uses `getISOWeek` with `getISOWeekYear`. Both must come from the
ISO calendar. Pairing the ISO week number with the Monday's *calendar* year, as
this once did, files a December week that is ISO week 1 under the current year's
`W01` — the key that year's own first week already uses. Nine weeks between 2015
and 2040 collided that way (2018-12-31, 2019-12-30, 2024-12-30, 2025-12-29,
2029-12-31, 2030-12-30, 2031-12-29, 2035-12-31, 2036-12-29). Opening one showed
January's plan, and editing it overwrote January.

**A week's home is decided by the dates it carries, never by the key it was
found under.** `weekKeyForStoredWeek` reads the first readable `days[].date` and
returns the key that week belongs at, or null when no day carries a usable date.
It is the single decision point, used by both callers below. Do not reintroduce
a second one.

- `migrateWeekKeys` refiles misplaced weeks and runs from `main.tsx` before the
  app reads anything. It is idempotent — a week already at the right key is
  skipped, so a second pass moves nothing — and it never throws, because a
  failure there would white-screen the app before it renders. It refuses to
  overwrite an occupied destination and reports it as a conflict instead.
- `importFromJSON` routes every incoming week through the same function, so
  restoring a backup written before the fix does not reintroduce the old keys.

**Weeks and settings share the `planner-` prefix**, so an entry is identified by
shape, not by prefix. `weekKeyFromEntryKey` matches `planner-YYYY-Www` and
returns the week key inside it, or null for anything else —
`planner-show-weekends`, `planner-color-labels` and `planner-theme` are all
settings. `exportAllData` and `migrateWeekKeys` both use it. Matching the prefix
instead is what made `exportAsCSV` export two settings as weeks and then die on
`week.days is not iterable`, which broke CSV export for every user on every run
until it was fixed. `exportAsCSV` additionally shape-checks each field, because
it reads storage directly rather than through `repairWeek`.

Where a December week and its January twin both held data, one had already
overwritten the other before any of this ran. The migration files whichever
survived; the other is not recoverable.

## A crash must not take the data with it

`ErrorBoundary` wraps everything in `App.tsx`, **outside** the providers —
`ThemeProvider` reads `localStorage` while rendering, so a storage failure has
to be caught above it, not inside. A render-phase throw used to unmount the app
and leave a blank page that survived reload, because the data causing it is
persisted.

The fallback offers a backup download as well as a reload. That is not
decoration: the weeks live only in this browser, so while the app is down the
fallback is the only route to the user's own data. Its handler swallows its own
failures — if storage is what broke, there is nothing to hand over, and throwing
on top of a crash would put the blank page back.

Boundaries catch rendering, lifecycle and constructor errors only. Throws inside
event handlers do not reach it; React 18 leaves those to `window`. `TimeGrid`'s
paint path is an event handler, so a throw there still fails silently.

**A week is importable only when its own days say which week it is.**
`importFromJSON` stages and validates every week before writing any of them, so
a file that turns out to be unusable leaves storage exactly as it was rather
than half replaced. The date rule doubles as the shape check — anything that is
not really a week carries no readable date, so it cannot displace a real one —
and it is why the key always comes from the data rather than from the file. A
week that cannot say which week it is gets skipped and counted, not written
under whatever key the file claimed.

## Nothing calls localStorage directly

`src/lib/storage.ts` is the only module that touches it, and `grep localStorage
src --include=*.ts --include=*.tsx` outside that file should stay empty.

The reason is that storage does not fail by being empty — it throws. A
sandboxed frame or a browser with cookies blocked raises a `SecurityError` from
every call including reads, and a full quota raises `QuotaExceededError` from
writes. Those throws used to escape from `loadWeek`, which wrapped only the JSON
parse, and from the autosave timeout, where nothing caught them at all.

- **Reads degrade to "nothing is there".** `readItem` and `listKeys` return null
  and `[]`. Callers already handle an absent week, so no caller needed changing.
- **Writes report whether they landed.** `writeItem`, `saveWeek` and
  `saveColorLabels` return a boolean. `saveWeek`'s return value is not
  decoration: it is what stops a save failure from being silent.

**`StudyPlanner` warns once per failure episode, not once per keystroke.**
`saveFailedRef` holds whether the last autosave was refused, and the toast fires
only on the transition into failure — a storage failure persists, so warning
every 300ms would bury the message under itself. It warns again if saving fails
after recovering. `src/test/storage-failures.test.tsx` pins all three cases.

`migrateWeekKeys` copies before it removes: `removeItem` runs only after
`writeItem` reports success, so a refused write leaves the week where it was
rather than dropping it.

## Optional row fields are dropped unless repairSubject knows them

`SubjectRow` carries two optional fields beyond the text and checkbox:
`colorId` and `flagged`. Both are optional so that rows written before the
field existed load without a migration — and both are therefore invisible to
the compiler, because `strict` is off.

`repairSubject` rebuilds every row from a fixed list of fields on load. **A
field it does not list is silently dropped on the next read**, with no type
error and no failing test unless one exists for that field specifically. Adding
a third optional field means adding it there too. `src/test/priority-flag.test.tsx`
guards `flagged` the way `src/test/daily-view.test.tsx` guards `colorId`.

`flagged` is stored only when true; clearing a flag removes the field rather
than storing `false`, so a never-flagged row and a cleared row are identical on
disk.

## The hour column's last row reads 00

`HOURS` runs 6..24 and must keep doing so — those values size `timeBlocks` and
drive `repairTimeBlocks`, so changing them is a stored-data change. `24` is not
an hour that appears on a clock, so `formatHourLabel` renders that last row as
`00`. It is presentation only, applied in `TimeGrid`; nothing else should read
it.

**The Today button sits after the next chevron, and has to stay there.**
`src/test/autosave.test.tsx` and `src/test/pending-save.test.tsx` reach the next
week with `container.querySelectorAll("button")[1]`, so a control inserted
before either chevron silently repoints those tests at the wrong button. They
fail in a way that looks like a save bug rather than a layout change.

## Traps that cost time to find

**Do not rewrite `updateSubject`** in `DailyView.tsx` or `DayColumn.tsx`. Its
`{ ...s, [field]: value }` spread is the only thing preserving a row's `colorId`
**and `flagged`** through a keystroke. Replacing it with explicit setters that list fields drops
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

- `npm test` — 162 tests across 16 files
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

**Two tabs overwrite each other.** Nothing listens for the `storage` event, and
every edit serialises and writes the whole week from in-memory state. A second
tab holding a stale copy therefore reverts the first tab's work on its next
keystroke. Last writer wins, silently. Fixing it means either reloading on the
`storage` event or merging per field; neither is obviously right for a planner
that is normally open once.

## Design docs

`docs/superpowers/specs/` holds the approved designs and `docs/superpowers/plans/`
the implementation plans. They record why decisions were made, including several
that were reversed after review — read the spec before changing behaviour it
describes.

One history note: commit `a51b69e` has a message about plan updates but also
contains `src/hooks/use-is-dark.ts` and a `ColorPicker.tsx` change, because a
`git add -A` ran while other edits were in progress. The code is correct; only the
commit boundary is untidy.
