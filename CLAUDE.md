# Daily Log — working notes

A weekly planner that runs entirely in the browser. All data lives in the user's
`localStorage`; there is no server and no account.

Live at https://xultar.github.io/Daily-Log/

## Before you change anything

**Pushing to `main` deploys.** `.github/workflows/deploy.yml` fires on every push
to `main` and publishes to GitHub Pages. Work on a branch and merge only when the
change has been seen working. Merging is the user's call, not yours.

**A red suite now blocks the deploy.** `deploy.yml` is `npm ci` → `npm test` →
`npm run build` → Pages. The test step was added on 2026-08-26; until then
nothing verified this repo before it published, and 300 failing tests would have
deployed as cheerfully as 300 passing ones. Because the step sits before the
build, a failure stops the artifact ever being uploaded, so the live site goes
on serving the last good build rather than a broken one.

Two consequences. A flaky test can now hold up a deploy, which is the price of
the gate and the reason `startup-migration.test.tsx` carries its own timeout —
see Baselines. And the runner is smaller and colder than a dev machine, so a
test that depends on wall-clock speed will show it here first.

**The base path is `/Daily-Log/`.** `vite.config.ts` sets it, and it applies in
development too, so the dev server serves at `http://localhost:8080/Daily-Log/`,
not at `/`. If this ever disagrees with the repository name, every asset 404s and
the page renders blank.

## Where things stand

`main` is deployed and carries the data-integrity work: week repair on load, the
week-key migration, the export fix, the error boundary, import validation,
storage guards and the autosave flush.

Everything below merged into `main` and **deployed on 2026-08-25**: the priority
flag, dark mode with the print fix, native widgets following the colour scheme,
the whole of carry-forward, and the cross-tab reload notice.

Carry-forward shipped as eight tasks — schema, rules, the backwards scan, the
review bar, the `StudyPlanner` wiring, the sidebar age marker — verified by
tests and seen working in a browser in both light and dark. Spec and plan are in
`docs/superpowers/`.

Merged into `main` on **2026-08-26**: carry-forward's four non-blocking review
items (the review bar's height bound, an ordering assertion for the age marker,
a test for the quarantine write, and the shared `AgeMarker`), the scoped timeout
on `startup-migration.test.tsx`, and the `npm test` step in `deploy.yml`.

**`main` is ahead of what is live.** GitHub Actions was in a major outage on
2026-08-26 and cancelled two queued runs without executing a single step, so the
Pages site still serves the build from before those merges. Nothing is wrong
with the commits. Re-run the workflow — it has `workflow_dispatch`, so no empty
commit is needed — and confirm the live bundle hash changes.

That also means **the test gate has never actually run in CI**. The first run
that completes will be its first real exercise.

**Unmerged: branch `twelve-color-tags`.** Takes the palette from nine tags to
twelve — red, chartreuse and brown — with `0` selecting the tenth and the last
two reachable only by picker. Spec and plan are in `docs/superpowers/`. 307
tests green, lint and build clean, and the palette was measured rather than
eyeballed; see the palette section below for the numbers.

## Pick up here next

Nothing is half-finished. Every item below can start cold, and they are grouped
in the order they are wanted: clear the small polish, then add new functions.

### 1. Small polish
- **The `<input>` inside `<button>`** in the daily legend is invalid HTML, and
  assistive tech commonly prunes children of `role="button"`, which can make the
  label field unreachable. The `stopPropagation` on that input is what holds it
  together for mouse users. **This blocks "edit colour labels from the weekly
  strip"**, which would replicate the same mistake in a second place — so do
  this first if that feature is wanted. Needs a real restructure, not a patch.

### 2. New functions

Least specified, most freedom. Each needs a design pass before code — see the
working rhythm below.

- **Duplicate a day, or template a week.** The natural follow-on from
  carry-forward, and the other copy-shaped idea: recurring schedules get retyped
  every week. Much of the machinery already exists — `applyCarryForward` is a
  worked example of copying into a week without mutating the source, and the
  `origin` field shows how to mark where something came from. The design
  questions are what a template *is* (a named saved week? last week? a specific
  week you point at?), whether it copies time blocks as well as text, and what
  happens to a day that already has content.
- **Search across weeks.** The most-wanted of the older backlog. `exportAllData`
  already enumerates every stored week, so the data access is solved and this is
  mostly UI plus a result-to-week jump.
- **Colour in the month view.** A month cell shows total minutes and an
  intensity shade — how much, never what. `calcDayColorMinutes` already exists.
- **Trends over time.** `recharts` is a dependency and entirely unused.
  Per-colour minutes per week across a term is the natural payoff for all this
  logging.
- **Edit colour labels from the weekly strip.** Blocked on the a11y restructure
  above; doing it naively replicates the `<input>`-inside-`<button>` problem.

### The working rhythm in this repo

Design before code, and write both down. `docs/superpowers/specs/` holds
approved designs, `docs/superpowers/plans/` the task-by-task plans. Several
specs record decisions that were reversed after review — read the spec before
changing behaviour it describes.

Two habits earned their keep repeatedly and are worth keeping:

- **Mutation-test the tests.** Break the line the test claims to defend and
  check that test actually fails. This repeatedly caught tests that were green
  for a reason unrelated to their own name — including one that passed because
  its fixture was outside the code path entirely.
- **Verify the mutation applied.** A mutation that silently fails to apply and a
  mutation that survives look identical in the output. Check the file changed.

## The one rule that can corrupt user data

There are two numbers that both look like "the colour number", and confusing them
writes wrong values into weeks people have already planned.

- **Storage id** — the 1-based position in `BLOCK_COLORS`. It is what gets
  persisted: the values inside `timeBlocks`, the keys of `planner-color-labels`,
  and `SubjectRow.colorId`. It never changes.
- **Display position** — the 1-based position in `COLOR_IDS_IN_DISPLAY_ORDER`
  (`[1,2,3,4,5,7,8,9,6,10,11,12]`). It is what the user sees beside a swatch and
  what the number keys select.

They differ for four of the twelve colours. Gray is storage id 6 but display
position 9; yellow is 7 but 6; teal is 8 but 7; magenta is 9 but 8. Red,
chartreuse and brown were appended after the reordering, so 10, 11 and 12 mean
the same thing on both sides.

**Display positions 1-9 are frozen.** Changing the display order costs nothing
in stored data, which is exactly what makes it tempting — and moving gray off
position 9 to tidy the list would silently retrain anyone who types 9 for gray.
Gray sits mid-list now that three colours follow it; that is the accepted price.
A test asserts it, and the permutation test does not catch a reordering on its
own.

**Positions 11 and 12 have no key.** Twelve colours outran the number row: 1-9
select the first nine, `0` selects position 10, and chartreuse and brown are
reachable only from the legend or the right-click picker.

**The palette's ceiling is perceptual, not arithmetic, and hue degrees are a bad
proxy for it.** Chartreuse was specified at hue 95 on the reasoning that it sat
45 degrees from both yellow and green. Measured as CIE Lab ΔE against the
actually-rendered tokens, it was twice as close to green as to yellow, because
the yellow-green region is perceptually compressed. Moving it to 85 improved
both themes at once. Measure the next colour; do not reason about the wheel.

Two numbers worth keeping. The tightest pair in the whole palette is
**Lavender/Magenta at ΔE 7.6 in light and 21.9 in dark**, and it predates the
twelve-tag change — every pair involving red, chartreuse or brown is better
separated than that. And **light mode is about three times tighter than dark
throughout**, so a new colour that survives light will survive dark, not the
other way round.

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

`SubjectRow` carries three optional fields beyond the text and checkbox:
`colorId`, `flagged` and `origin`. `TodoItem` carries `origin`. `WeekData`
carries `carryResolved`. All are optional so that records written before the
field existed load without a migration — and all are therefore invisible to the
compiler, because `strict` is off.

`repairSubject`, `repairTodo` and `repairWeek` each rebuild from a fixed list
of fields on load. **A field they do not list is silently dropped on the next
read**, with no type error and no failing test unless one exists for that field
specifically. Adding a fourth optional field means adding it there too.

The guards, one per field: `src/test/daily-view.test.tsx` for `colorId`,
`src/test/priority-flag.test.tsx` for `flagged`, `src/test/carry-schema.test.ts`
for `origin` and `carryResolved`. The `origin` test asserts a row's **whole**
shape with `toEqual` rather than checking one field, because the combination is
what a fixed-list rebuild breaks.

**Why this section exists in the shape it does:** when `origin` was added,
`repairTodo` was a complete literal — `return { text, checked }` — and dropping
`origin` would have left the feature *looking* like it worked. Items would
carry, the bar would behave, and only the age marker would quietly read zero
forever.

`flagged` is stored only when true, and `carryResolved` likewise; clearing a
flag removes the field rather than storing `false`, so a never-flagged row and
a cleared row are identical on disk. `origin` is absent when an item originated
in the week it is sitting in.

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

**The colour legend's grid lines belong to the grid, not the cells.** It is a
two-column grid inside a bordered box, so a cell draws a bottom border only when
a row follows it and a right border only when a cell sits beside it. Nine
entries leave the last row holding one cell; giving it either border puts a
doubled line on the container's own edge, or a stub into the empty half of the
row. Both rules are derived from the palette length, so they still hold when
`BLOCK_COLORS` is appended to. `src/test/legend-borders.test.tsx` pins them, and
asserts exact class tokens rather than substrings — `border-border/50` contains
the characters `border-b`, so a substring check discriminates nothing.

## Traps that cost time to find

**Do not rewrite `updateSubject`** in `DailyView.tsx` or `DayColumn.tsx`, or
`update` in `WeeklyTodoSidebar.tsx`. Their `{ ...s, [field]: value }` spread is
the only thing preserving a row's `colorId`, `flagged` **and `origin`** through
a keystroke. Replacing it with explicit setters that list fields drops them with
no type error, because the fields are optional and strict is off.
`src/test/daily-view.test.tsx` and `src/test/carry-marker.test.tsx` guard this —
do not delete them.

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

## Printing is a real use case, and the print CSS is thinner than it looks

The weekly and daily sheets get printed on a **black-and-white laser**. The whole
`@media print` block is about twenty lines in `src/index.css`, and only two
elements anywhere carry `no-print`: the top toolbar and the Goal/Review row.

What the current output gets right, confirmed from printed sheets: A4 landscape
at 6mm margins, all seven days with per-day totals and the full legend on one
page, nothing clipped or reflowed. The month and day sheets land cleanly too.
`print-color-adjust: exact` is already set, so backgrounds do print — the light
row tints come out as pale gray. Do not "fix" that.

All five defects recorded here were fixed on 2026-08-25: placeholders no longer
print, the four UI-only controls carry `no-print`, the view container's
scrollbar is gone, the week's Goal and Review now print deliberately, and
painted blocks carry their tag number. **Confirmed on the laser on 2026-08-25:
the sheets print correctly and the numbers are clear, including in a
10-minute run** (roughly 6mm wide at A4). The hatch-pattern alternative was
considered and is not needed; if it is ever revisited, it is a change to
`.tag-run-start` in `index.css` and nothing else.

**The printed number is the display position, not the storage id.** They differ
for gray, yellow, teal and magenta, so printing the storage id labels a block 6
that the legend calls 9. `displayPositionForColorId` is the translation, and it
is the inverse of `colorIdForDisplayPosition` — the two must stay a pair.

**Only the first block of a run prints its number.** `isTagRunStart` compares a
block to the one before it within the same hour row, so a full hour of one tag
prints one digit rather than six. Runs deliberately do not cross hour rows: each
row renders separately, so a two-hour block prints one digit per hour, which is
what you want when reading a sheet back.

## Colour is decided by the cascade, not at paint time

`getBlockColor` used to take an `isDark` argument read from
`prefers-color-scheme`, and printing never changed it — which is why an OS-dark
machine sent `hsl(213 50% 40%)` to a printer that the design expects to receive
`hsl(213 60% 80%)`. **The near-black printed sheet was a palette bug, not the
laser.**

The nine tags are now CSS custom properties. `src/lib/tag-palette.ts` generates
one stylesheet from `BLOCK_COLORS` and installs it in a `<style>` element:
`:root` holds the light triplets, `.dark` the dark ones, and an `@media print`
block restores light. `getBlockColor` returns `hsl(var(--tag-N))` and
`getBlockTint` returns `hsl(var(--tag-N) / 0.16)`. `BLOCK_COLORS` stays the
single source of truth and stays append-only; a test asserts every emitted value
matches it, so the sheet cannot drift.

**The print block must be emitted last.** `:root` and `.dark` have equal
specificity (0,1,0), so order alone decides the winner. Emitting print before
`.dark` sends dark values to the printer again, silently.
`src/test/tag-palette.test.ts` pins the ordering for both the tag block and the
theme block.

**`ThemeProvider` must never write inline styles.** It used to call
`root.style.setProperty` for its seven variables. Inline styles on `<html>`
outrank class rules, so the six accent themes would clobber `.dark` — dark mode
applying to backgrounds and text but not to headers, grid lines or filled cells
— and `@media print` could not override them without `!important` on every
property. It emits into the same generated stylesheet instead, and each theme
carries a `dark` variant of its seven values.

`planner-color-scheme` holds `light`, `dark` or `system`, defaulting to
`system`. It is a setting, so `weekKeyFromEntryKey` already excludes it by
shape; nothing needs adding to the exporter or the key migration. `main.tsx`
installs the stylesheet **and** applies the `.dark` class before the first
paint — doing either from an effect shows a frame of light mode on every load,
because effects run after paint. `ThemeProvider` keeps both in sync afterwards,
and registers the media listener only while the setting is `system`.

`useIsDark` is deleted. Nothing should need the scheme at paint time again;
`grep hslDark src --include=*.tsx` should stay empty.

## Carrying unfinished work forward copies; it never moves

When a week opens with unfinished work behind it, a review bar lists what was
left over and lets the user tick what comes across. The rules are pure functions
in `planner-data.ts`; `carry-source.ts` does the storage-facing scan.

**Carrying copies.** Last week genuinely ended with those items unfinished, and
ticking one off in the new week must leave that record true. `applyCarryForward`
returns a new week and mutates neither argument.

**Age is derived, never stored.** An item's `origin` is the ISO date of the
Monday of the week it was first written in; `carriedWeeks` computes the gap to
the week being viewed. A stored counter was rejected: it can be
double-incremented by a re-run, inflated by an import, and there is no way to
tell that it is wrong. A date can only be right or absent. An existing `origin`
survives a second carry, which is what makes a repeated carry idempotent.

**`findCarrySource` never writes planner data — but it is not "read only".**
`hasStoredWeek` returns true for corrupt JSON, because the stored string is
non-null, so the scan goes on to call `loadWeek`, whose catch branch quarantines
the raw text to `daily-log-unreadable-<key>`. Do not shorten the comment there:
the wording was corrected once already, and the wrong version is what a future
reader would rely on to justify calling the scan during render.

**The scan stops at the first week that exists, not the first with work.** An
existing week means the user was there; if they left nothing unfinished, nothing
carries. Scanning past it would resurrect older items they had moved on from.
`hasStoredWeek` exists precisely because `loadWeek` returns an empty week for a
missing key and so cannot tell absent from empty.

**"Skip" discards, and the button is named for that.** Skipping marks the week
resolved *and* dirty, so week N gets written — and the scan then stops at week N
from week N+1, a week that never received the items. So skipping once removes
last week's unfinished work from the feature for good, as does simply typing
anything in the new week without answering the bar. This falls directly out of
the stop-at-the-first-stored-week rule above; the two cannot both hold. The
button read "Not now" until 2026-08-25, which promised a later that does not
come. The spec's Risks section claimed the opposite and was corrected, not the
code.

**Opening a week still writes nothing.** Looking up candidates is a read, gated
behind `isCurrentOrFutureWeek` so reviewing a past week never offers to write to
it. Only the user's click marks the week dirty. `src/test/carry-bar.test.tsx`
asserts this directly, and settles the debounce first so it cannot pass
vacuously.

**`CarryForwardBar` is mounted with `key={monday}`, and that is load-bearing.**
It keys its tick state by array position, so without the key, moving between two
weeks that both have candidates reuses the bar and leaves an outstanding untick
glued to position 1 rather than to the item.

**`bringForward` must keep the updater form.** It is a `useCallback` with a
stable dependency, so its closure is created once at mount. Closing over
`weekData` instead of `prev` captures the mount-time week forever: open on week
A, navigate to week B, press Bring, and A's contents are written under B's key.
The whole suite passed under that mutation until a test was added for it.

**The age marker lives in `AgeMarker.tsx`, and both the bar and the sidebar use
it.** The visible token is `aria-hidden` because "1w" is announced as "one w",
and the `sr-only` phrase says it in words. The two drifting apart — the token
silently unhidden, or the phrase deleted — is what keeping them in one component
prevents. Styling arrives as a prop rather than being unified: the sidebar's
column is 128px at 9px text and the bar's rows are not. There is no test file
for the component itself; the call sites' tests cover it, and each of the three
mutations tried against it — pluralisation, the zero guard, the `aria-hidden` —
fails tests in **both** files.

**Where the marker sits in a sidebar row is pinned by an index assertion.**
Every other test there asks whether it renders, never where, so moving the block
above the text input left all of them green while shoving each row's text
sideways in a 128px column.

**The bar's rows are capped at `max-h-24 overflow-y-auto`.** The bar is
`shrink-0` inside a `h-screen` column, so every row it renders comes out of the
time grid's height. At the worst case the feature can produce — 8 weekly actions
plus 42 flagged daily rows — the list wants 134px at desktop width and 168px at
tablet, and the cap holds the bar at 154px instead, handing 38px and 55px back
to the grid. jsdom does no layout, so the test can only pin the classes that
impose the bound; those numbers were measured in a browser.

## A second tab reloads, or says so — it never overwrites in silence

Nothing used to listen for the `storage` event, so a stale second tab reverted
the first tab's work on its next keystroke, silently. `onExternalChange` in
`storage.ts` now reports cross-tab writes, and `StudyPlanner` uses `dirtyRef` to
pick between two responses: a clean tab reloads, a tab that has edited the week
keeps its work and shows `CrossTabNotice`.

**`saveWeek` writes one key**, so the failure was always narrower than "two tabs
open": only two tabs on the *same* week can lose data. The settings are single
values where last write wins harmlessly, and are deliberately ignored.

**The `storage` event fires only in other documents**, never in the tab that
wrote — which is why the tests dispatch a synthetic `StorageEvent` rather than
writing to `localStorage`. That is not a jsdom workaround; no environment would
fire it for the writing document.

**`event.key` is null when another tab calls `clear()`.** That counts as
relevant. Filtering it out is a mutation the tests catch.

**Reload drops the pending write before bumping `refreshKey`.** The load effect
calls `flushPendingSave` first, so a bare bump writes this tab's stale copy over
the other tab's work and then reads back its own write — the button doing the
opposite of its label. Two tests fail with `expected 'Mine' to be 'Theirs'` if
that line goes. It is race-free rather than lucky: `flushPendingSave` returns
early on a null `pendingRef`, so a debounce timer firing in the gap is a no-op.

**`dirtyRef` is deliberately not cleared in that handler.** The load effect does
it and nothing reads the flag in between, so a second assignment would be dead
code dressed as a safeguard. Mutation-tested: removing it changes nothing.

**`dirtyRef` means edited-since-loaded, not unsaved.** It is never cleared by a
successful write, so the notice can appear for a tab whose own edits are already
stored — which is exactly the tab whose work the other one may have just
overwritten. Hence the wording "This week was changed in another tab" and not
"you have unsaved changes"; a test pins the difference.

**Accepted residue:** a user who ignores the notice and keeps typing still wins.
Withholding their writes would mean the typing lived only in memory, and closing
the tab would lose it with no trace — worse than the problem being solved.

## Baselines

- `npm test` — 307 tests across 27 files. One of them,
  `startup-migration.test.tsx`, carries its own 20s timeout, because it is the
  only test that dynamically imports the app root and so pays the whole module
  graph's transform inside the timed body. Measured at 1.3s cold and alone and
  0.9s cold inside the full suite on an 8-core machine; the margin is for a
  slower runner. Nothing here is known to flake.
- **`eslint` ignores `.claude`.** Background tasks create git worktrees at
  `.claude/worktrees/<name>`, which are full copies of the codebase. Without
  the ignore, lint reports all ten warnings twice, which reads exactly like a
  change having introduced ten new ones.
- `npm run lint` — **0 errors, 10 warnings**. All ten are pre-existing
  `react-refresh/only-export-components` and `react-hooks/exhaustive-deps` in
  `src/components/ui/*`, `MonthlyView.tsx` and `theme-context.tsx`. Do not treat
  them as new; do treat any error as new.
- `npm run build` — clean
- `npm run dev` — serves at `http://localhost:8080/Daily-Log/`

## Known open issues

**The `<input>` inside `<button>`** in the daily legend is invalid HTML and
pre-existing. Assistive tech commonly prunes children of `role="button"`, which can
make the label field unreachable. The `stopPropagation` on that input is what holds
it together for mouse users. Fixing it needs a real restructure.

## Discussed but not started

From a review of the app in August 2026, roughly by value. None of these are
specified; each needs a design pass before any code.

- **Search across weeks.** Months of memos and priorities are reachable only by
  clicking week by week. `exportAllData` already enumerates every stored week, so
  the data access is solved and this is mostly UI. See "Pick up here next".
- **Colour in the month view.** A month cell shows total minutes and an intensity
  shade, so it says how much but never what. `calcDayColorMinutes` already
  exists. The weekly-legend spec listed this out of scope at the time; worth
  revisiting now that labels exist.
- **Trends over time.** `recharts` is a dependency and entirely unused. Per-colour
  minutes per week across a term is the natural payoff for all this logging.
- **Edit colour labels from the weekly strip.** Small on the surface, but doing it
  naively replicates the `<input>` inside `<button>` problem into a second place.
  Do the a11y restructure first.
- **Duplicate a day, or template a week.** Written up under "Pick up here next".

Deliberately not doing: **cloud sync or accounts.** The localStorage-only design
is why this repo can be public with no user data in it, and why there is no
server to run. Export/import into a synced folder gets most of the value for none
of the architecture.

## Design docs

`docs/superpowers/specs/` holds the approved designs and `docs/superpowers/plans/`
the implementation plans. They record why decisions were made, including several
that were reversed after review — read the spec before changing behaviour it
describes.

One history note: commit `a51b69e` has a message about plan updates but also
contains `src/hooks/use-is-dark.ts` and a `ColorPicker.tsx` change, because a
`git add -A` ran while other edits were in progress. The code is correct; only the
commit boundary is untidy.
