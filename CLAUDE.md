# Daily Log — working notes

A weekly planner that runs entirely in the browser. All data lives in the user's
`localStorage`; there is no server and no account.

Live at https://xultar.github.io/Daily-Log/

## Start here — and what not to read

**This file is already in your context.** It loads automatically every session,
so never open it again to "check" something; scroll it. The outstanding work is
in "Pick up here next" below, where each item is written to be started cold —
and where an empty list means there is genuinely nothing queued, not that you
should go looking elsewhere.

Two habits keep a session cheap:

**Read one design note, not the file.** `docs/design-notes.md` is 51 KB —
*larger than this file* — and reading it end to end is the single most expensive
mistake available here. Every bullet under "Area notes" names the note that
explains it. Open that one section and stop.

**Specs and plans are history, not orientation.** `docs/superpowers/specs/` holds
eighteen approved designs and `plans/` twelve task lists. Read one when you are
about to change behaviour it describes. Never read them to find out what the app
does — this file already says.

### Where things live

| To change | Go to |
| --- | --- |
| Week/day shape, repair, load/save, palette, colour labels | `src/lib/planner-data.ts` (817 lines — the big one) |
| Anything touching `localStorage` | `src/lib/storage.ts` — nothing else may call it directly |
| Month totals, tag history, trends | `src/lib/reporting.ts` |
| Text search across weeks and months | `src/lib/search.ts` |
| Notes on a month | `src/lib/month-notes.ts`, `MonthNotes.tsx` |
| Copying a week's shape | `src/lib/week-template.ts` |
| Which past week to carry from | `src/lib/carry-source.ts` |
| Backup and restore | `src/lib/export-import.ts` |
| App state, autosave, cross-tab, the toolbar | `src/components/planner/StudyPlanner.tsx` |
| A week column / the day view / the paint grid / the month | `DayColumn` / `DailyView` / `TimeGrid` / `MonthlyView` |
| The four dialogs | `SearchDialog`, `TemplateDialog`, `TrendsDialog`, `RenameTagsDialog` |
| The weekly colour strip | `WeeklyColorLegend.tsx` |

Tests sit in `src/test/` named for the behaviour, not the module — `carry-bar`,
`legend-cell`, `tag-history`, `trends`. Grep the behaviour, not the file.

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

A flaky test can now hold up a deploy. That is the price of the gate, and the
reason the test timeout was raised in `vitest.config.ts` — see Baselines.

**The runner is not the slow environment.** This said the opposite until the
gate actually ran: 342 tests took **19s** on the runner against 70s on an
8-core dev machine, because `npm ci` leaves a warm cache and nothing there
competes for cores. A wall-clock-sensitive test will show itself on a loaded
dev machine first, which is exactly where `today.test.tsx` timed out. Do not
reason about CI being slower; it measured faster on every step.

**The base path is `/Daily-Log/`.** `vite.config.ts` sets it, and it applies in
development too, so the dev server serves at `http://localhost:8080/Daily-Log/`,
not at `/`. If this ever disagrees with the repository name, every asset 404s and
the page renders blank.

## Where things stand

`main` is deployed, `origin/main` is level with it, and there is no unmerged
work. The backlog below is empty.

**What shipped, and when, is `git log` — not this section.** It used to carry a
hand-written list of every feature and its date. That list drifted within a day
of being written, which is the same failure this file records under
"Deliberately not doing": a second copy of something is a second thing to keep
true, and it will not be. For what a feature does and why it was built that way,
read `docs/superpowers/specs/`; for the reasoning behind a rule, read
`docs/design-notes.md`.

One operational note kept, because it is nowhere else and it cost time: GitHub
Actions was in a major outage on 2026-08-26 and cancelled two queued runs
without executing a step, reporting one as
`failure` and one as `startup_failure`. Neither was a real failure. A superseded
or cancelled run in this repo does not always say so.

## Pick up here next — the backlog

**This section is the backlog, and it is currently empty.** If you were asked
for "the backlog", "what's next", "the todo list" or "outstanding work", the
answer is that there is none, and this is the only list there would be. One
other paragraph in this file mentions a backlog being retired; that refers to a
duplicate of this one deleted on 2026-08-26, not to this.

Nothing is half-finished and nothing is known-broken. The last three items were
closed on 2026-08-27: month notes shipped, the week's row alignment was fixed in
the view, and backing up the show-weekends preference was decided against. See
"Deliberately not doing" for that last one — it is a decision, not a gap.

**An empty backlog is not an invitation to invent work.** Ask what is wanted.
If something is agreed, write it here first, in the form described below, and
then start it.

**Each item here is written to be started cold** — what it is, where the code
is, what is already there to build on, the open questions, and the traps. If you
find yourself exploring the codebase to understand an item before starting it,
the item is underwritten; fix the item.

### Starting a session here

1. **Confirm the tree before changing it.** `npm test`, `npm run lint` and
   `npm run build` should all match **Baselines** below. If any of them differ,
   find out why before writing anything. The numbers live in one place on
   purpose: this step used to carry its own copy, which said 394 across 38 files
   long after the suite had passed 450.
2. **Read the section that governs what you are about to touch.** "The one rule
   that can corrupt user data" before anything with colours. "A stored week is
   repaired, never replaced" and "Nothing calls localStorage directly" before
   anything with storage. "The colour tags are the user's goals" before deciding
   a tag name is decoration.
3. **Design before code, and write it down.** Brainstorm the open questions with
   the user, put the agreed design in
   `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, commit it, then build.
   Larger pieces also get a task-by-task plan in `docs/superpowers/plans/`.
4. **TDD, then mutation-test, then look at it in a browser.** Write the failing
   test first. Then break the line each test defends and confirm *that* test
   fails. Then check the thing in the app, because jsdom sees no colour and no
   layout.
5. **Work on a branch.** Pushing `main` deploys, and the deploy is gated on
   `npm test`. Merging is the user's call.

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

**A daily legend cell is two controls, not one.** A button arms the colour and a
field beside it renames the colour; the cell itself is a plain container. The
field used to sit *inside* the button, which is invalid — a button may not
contain interactive content, and assistive tech commonly prunes the children of
`role="button"`, so the field could be unreachable. An `onClick` with
`stopPropagation` was what held it together for mouse users; it is gone, because
the structure now does that job.

Two things follow, and both are easy to undo by accident:

- **The button's `aria-label` carries the key hint, and the digit in it is the
  display position.** Positions 11 and 12 name no key, because they have none.
  A test asserts `Use Gray (key 9)`, and using `c.id` there fails it twice over.
- **Do not make the cell container clickable.** It would restore the large click
  target and reintroduce exactly what this removed: something clickable that the
  keyboard cannot reach. The button instead stretches to the cell's full height,
  which brings the target to 25px — the 24px minimum — without moving anything.

**The palette's ceiling is perceptual, not arithmetic, and hue degrees are a bad
proxy for it.** Chartreuse was specified at hue 95 on the reasoning that it sat
45 degrees from both yellow and green. Measured as CIE Lab ΔE against the
actually-rendered tokens, it was twice as close to green as to yellow, because
the yellow-green region is perceptually compressed. Moving it to 85 improved
both themes at once. Measure the next colour; do not reason about the wheel.

**Light mode is about three times tighter than dark throughout**, so a colour
that survives light will survive dark and not the other way round. Judge light
first.

`src/test/palette-distance.test.ts` now enforces this rather than leaving it to
whoever remembers. It computes ΔE from the HSL strings — pure arithmetic, no
browser — and reproduces the in-browser measurements to three significant
figures. The floors are a ratchet: raise them when the palette improves, never
lower them to make a new colour fit. The instrument has its own tests, because
an untested ruler measures nothing.

Current worst pairs: **Orange/Brown at 12.1 in light, Green/Chartreuse at 23.5
in dark**. Lavender/Magenta used to hold both at 7.6 and 21.9 — the tightest in
the palette, separated on hue alone with identical saturation and lightness.
Magenta moved to `305 45% 76%` / `305 45% 52%` rather than lavender, because
lavender is a system colour elsewhere in the user's setup and because magenta
was the one squeezed between two neighbours.

**Under colourblindness the palette collapses, and now there are numbers for
it.** `src/test/palette-colourblind.test.ts` simulates the three dichromacies:

| | light | dark |
| --- | --- | --- |
| protanopia | 4.2 Gray/Teal | 6.7 Blue/Lavender |
| deuteranopia | 2.8 Lavender/Magenta | 6.0 Red/Brown |
| tritanopia | 1.1 Blue/Teal | 2.4 Magenta/Red |

Deuteranopia read **0.7 Pink/Gray** until pink moved to `340 65% 76%` /
`340 65% 48%`. Pink at `340 55% 82%` kept almost no chroma once the red-green
axis was gone and landed straight on gray, which is to say the two were the same
colour. Gray did not move: it is the neutral tag, and a neutral that has to
carry a hue to be legible is not neutral. Nothing else regressed — every other
vision measured identically before and after.

**Pink's lightness is load-bearing, and not in an obvious direction.** At 54% in
dark it drops tritanopia from 2.4 to 0.2. Re-measure rather than nudge.

Light now bottoms out at Lavender/Magenta. Going further means moving magenta
again, because lavender cannot move.

The printed run-numbers remain the only mitigation that survives a mono print.
These floors are a ratchet like the others: they do not demand the palette
improve, only that it stop getting quietly worse.

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

## The colour tags are the user's goals

Not categories, not colours. The user names each tag after a goal or project —
Thesis, Teaching, Supervision — and reads time against those names. The app
holds no separate notion of a goal or a project, and does not need one: the
palette is it.

That is the reason behind several things that otherwise look like polish, and
they should not be undone without understanding it:

- **The tag's name appears wherever its colour does** — month cells, report
  bars, the legends. A swatch alone says nothing when the thing it stands for is
  "Thesis".
- **Colour labels travel in a backup.** Losing them does not lose a preference,
  it loses the mapping from colours to the user's goals, which is the only thing
  that makes the stored numbers mean anything.
- **Twelve tags rather than nine.** The ceiling was a real constraint, because
  the number of tags is the number of things being tracked.

There is deliberately no feature aligning time against the `weekGoal` text. The
alignment happens in what the tags are called.

## Area notes — the rules, with the reasoning in docs/design-notes.md

Each rule that bites is below. The measurements, the failure histories and the
rejected alternatives live in `docs/design-notes.md`, because this file is
loaded into every session and the long form had grown past 50 KB. **Nothing was
deleted; it moved.** Read the matching note before changing anything in that
area.

- **Time reporting reports blocked time, not spent time.** The app cannot tell a
  plan from a record, so never write "spent" or "went" — a future month is a
  plan. `totalsByTag(from, to)` takes a range and aggregates **per day**, never
  per week, which is the only reason an arbitrary range works.
- **Do not import `recharts` without measuring.** It is in `package.json` and
  contributes **zero bytes** today; anything importing it costs +103 kB gzipped,
  a 74% increase. "Already a dependency" is true of the lockfile and false of
  the bundle.
- **The month wash caps at 0.45 dark, 0.75 light.** Both are measured WCAG
  contrast limits, and **dark is the tighter theme — the opposite way round from
  the palette's own legibility**, where light is tight because pastels crowd.
  Do not carry one conclusion into the other. Measure before moving either.
- **Search reads unrepaired weeks**, so every field access defends itself, and a
  result's Monday comes from the **entry key**, not the day dates — the opposite
  of the filing rule, and deliberately so.
- **Tag history shows the day but navigates by the key.** It needs both date
  rules at once — `day.date` for the label, `mondayOfKey` for the click — and
  transposing them is invisible unless the key and the dates disagree. Blocked
  time and tagged priority rows are both uses and are never added together.
  `totalsByTag` and `tagHistory` share one `eachStoredDay` iterator.
- **A crash must not take the data with it.** `ErrorBoundary` wraps everything
  *outside* the providers, because `ThemeProvider` reads storage while
  rendering. Its fallback offers a backup download; that is not decoration.
- **Optional row fields are dropped unless `repairSubject` names them.** Spread
  the existing row; never rebuild it from a list of fields. `strict` is off, so
  nothing catches a dropped tag.
- **Printing is a real use case** and the print CSS is thinner than it looks.
- **Colour is decided by the cascade**, not at paint time.
- **Carry-forward copies; it never moves.** `findCarrySource` never writes
  planner data, the bar is mounted with `key={monday}`, and `bringForward` must
  keep the updater form — closing over `weekData` once wrote one week's contents
  under another week's key with the whole suite green.
- **Templating fills empty slots and never overwrites**, which is what lets the
  dialog be a preview rather than a warning, and why there is no undo. Days map
  by index, not date. `previewTemplate` and `applyTemplate` are wrappers over
  one `fillDay` pass, so the counts cannot drift from the result.
- **The weekly strip renames through a dialog, not inline fields.** Twelve
  entries at 10px in a scroller have no room for the day view's answer. The
  dialog renames and never arms, so its rows contain no button and nothing can
  nest. Its trigger sits *outside* the scroller or it is off screen.
- **Trends scale per row, not globally.** Each tag's bars are measured against
  its own busiest month, so a small tag's shape stays readable; the span total
  printed beside the row is what carries the magnitude that hides. One pass over
  `eachStoredDay` buckets all twelve months at once.
- **The week's columns share one priority-row count**, the longest visible day,
  computed in `StudyPlanner` and passed to `DayColumn` as `rowCount`; shorter
  columns pad with inert `aria-hidden` spacers. The alignment lives in the view
  because the stored lengths are *correct* — a day may hold any number of rows,
  since the day view deletes down to one and adds without limit. Padding stored
  `subjects` instead would resurrect deleted rows; `repairList` says so. No test
  can confirm the columns line up, because jsdom has no layout — measure
  `TimeGrid`'s `offsetTop` across columns in a browser.
- **A month note is the only stored thing that is not a week.** It lives at
  `daily-log-month-YYYY-MM`, deliberately off the `planner-` prefix, and is
  stored as raw text so its whole repair path is `?? ""`. One key per month is
  what makes an import merge free: writing the months a backup names leaves the
  ones it does not name alone. It saves on every keystroke, which is affordable
  precisely because it is one short string — that is what buys the absence of
  the whole `pendingRef` flush problem. A search result for one carries
  `kind: "month"` and no Monday, and routes through `onJumpToMonth` rather than
  `onJump`; transposing those lands the user in the right date and the wrong
  view. The field auto-grows, and it must add the **border** to `scrollHeight` or
  it clips its own last line in print.
- **A second tab reloads, or says so.** It never overwrites in silence.
- **The hour column's last row reads 00**, deliberately.

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

## Baselines

- `npm test` — 534 tests across 52 files. `vitest.config.ts` sets
  `testTimeout: 15000` against a 5s default, and that is load-bearing: several
  tests render the whole app and click through it, sitting at 3-4s alone. Under
  full-suite contention they cross 5s — `today.test.tsx` timed out at 5597ms on
  a run where the identical code had passed minutes earlier.

  The ceiling was briefly scoped to `startup-migration.test.tsx` alone, on the
  theory that only it was exposed because only it imports the app root
  dynamically. That mechanism is real but the scope was wrong, and the override
  came off when a second test proved it. Do not re-scope it without evidence
  that the class has shrunk to one.

  For comparison, the same suite on a GitHub runner: `npm ci` 5s, `npm test`
  19s, `npm run build` 3s, whole workflow 90s including the Pages deploy. The
  runner is the comfortable environment, not the constrained one.
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

None.

Both 2026-08-27 shakedown findings are closed, and neither was the bug it was
filed as. The short `subjects` array was not a repair fault: a day may hold any
number of rows, and the fix the backlog proposed would have resurrected rows
users deleted on purpose — it was fixed in the view instead. The absent
show-weekends preference was not an omission: leaving it out of a backup is a
decision, reviewed on 2026-08-27 and kept.

The pattern is worth more than either finding. **Twice, a deliberate decision
recorded in a code comment was re-filed as a defect.** Both comments sat in the
file the item named. A root cause written into a backlog item is a hypothesis
with a citation; read the citation before building anything.

Before those, the last two — the `<input>` nested inside a `<button>` in the
daily legend, and the label write that happened on mount — were both fixed on
2026-08-26 and both have tests that fail if they come back.

The second is worth remembering as a pattern rather than as a bug. `DailyView`
held its labels in state seeded from storage and saved them from an effect on
that state; effects run on mount, so opening the day view wrote back the value
it had just read. It was fixed by deleting the effect and saving where the
change happens, which leaves nothing to guard. **An effect that persists state
is a write on every mount unless something stops it** — `StudyPlanner`'s
`dirtyRef` is the same lesson, learned the expensive way when a read that wrote
turned an unreadable week into an empty one.

## Deliberately not doing

**Cloud sync or accounts.** The localStorage-only design is why this repo can be
public with no user data in it, and why there is no server to run.
Export/import into a synced folder gets most of the value for none of the
architecture.

**Backing up the show-weekends preference, or the theme.** `ExportSettings`
carries the colour labels and nothing else. Decided on 2026-08-27 after a
shakedown filed the absence as a defect, and the argument against was real:
export/import is the only migration path this app has, so anything a user would
otherwise re-set by hand has some claim to travel. It loses because weekend
visibility costs one click and carries no information, where losing the colour
labels loses what the colours stand for — the stored numbers stop meaning
anything without them. A restore should also not silently repaint an app
someone opened to get their data back.

`export-import.test.ts` asserts the whole `settings` object by equality, so a
preference cannot drift into it without someone deciding to. If this is ever
revisited: applying a restored preference only to a device that has never set
one is *not* available, because `StudyPlanner` writes `planner-show-weekends`
from an effect on mount, so the key exists from first launch.

**The live list is "Pick up here next" and there is no other.** This heading
once held a second copy of the outstanding work and drifted, describing shipped
features as future work. A second copy is a second thing to keep true, and it
will not be. This section is for decisions *not* to build something, not for
things not yet built.

## Design docs

- **`docs/design-notes.md`** — the long-form reasoning behind the rules in this
  file: how the numbers were measured, what failed before, which alternatives
  were rejected. Read the note covering whatever you are about to change.
- **`docs/superpowers/specs/`** — the approved design for each feature, written
  before it was built.
- **`docs/superpowers/plans/`** — task-by-task implementation plans, for the
  larger pieces.

They record why decisions were made, including several that were reversed after
review — read the spec before changing behaviour it describes.
