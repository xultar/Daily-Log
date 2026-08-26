# Design notes

The long-form reasoning behind the rules in `CLAUDE.md`: how numbers were
measured, what failed before, and which alternatives were rejected and why.

Moved here on 2026-08-26 because `CLAUDE.md` had grown to 54 KB and is loaded
into every session. Nothing was deleted — each section below is verbatim, and
`CLAUDE.md` keeps the rule that bites plus a pointer here.

**Read the section covering whatever you are about to change.** Several record
decisions that were reversed after review, and the reversal is usually the
interesting part.

## Time reporting reports blocked time, not spent time

`totalsByTag(from, to)` sums painted blocks per tag over a date range, and the
month view draws it as bars under the calendar.

**It neither knows nor cares which side of today the range falls on.** Navigate
to next month and the same bars report the plan. That is half the point of
having it — the question "does my time match my goals" is asked forwards as
often as back.

Which makes the wording load-bearing: **the app cannot tell a plan from a
record.** A painted block is a painted block. The heading says "Time blocked by
tag", never "spent" or "went", because past tense would be wrong half the time.

**The range is a parameter, not a month.** Which span to show is the caller's
decision, so changing it later is an argument rather than a rewrite. That was
deliberate: the range was chosen before there was a month of real data to look
at, and this is what makes being wrong cheap.

Aggregation is **per day, not per week**, which is the only reason an arbitrary
range works — a week straddles a month boundary and a day does not. A day is in
range when its own `date` says so, never by the week key it was filed under.

Weeks arrive unrepaired from `loadAllWeeks`, so every field access defends
itself, exactly as search does. The test feeds it a week damaged several ways at
once; note that `timeBlocks: "not a grid"` is a **weaker fixture than it looks**,
because a string is iterable and `for...of` walks its characters harmlessly.
Mutation testing caught that: the guard survived until the fixture used a number.

## Not charting with recharts

`recharts` is in `package.json`, is 5.2 MB installed, and contributes **zero
bytes** to the bundle. The only file importing it is `src/components/ui/chart.tsx`,
which nothing imports, so Vite shakes the whole thing out.

Measured before deciding: importing it takes the bundle from 453 kB to 826 kB,
and 139 kB to 241 kB gzipped — a 74% increase. The hand-drawn bars cost 0.5 kB
gzipped.

**"It is already a dependency" is true of the lockfile and false of the
bundle**, and the two look identical from `package.json`. If a future chart
wants axes, tooltips, zoom or real time series, recharts earns its weight — but
measure the bundle before and after rather than assuming it is already paid for.

## The month view's wash has a measured ceiling

A month cell tints with its dominant tag — hue for what, alpha for how much —
and `tintAlpha` takes the ceiling as an argument because **the two themes have
different limits, and by a lot**: `WASH_CEILING_DARK` is 0.45,
`WASH_CEILING_LIGHT` is 0.75. These are contrast limits, not preferences.

The cell carries text over the wash. In dark mode the tags are lighter than the
page, so a strong wash drags the cell toward the colour of its own text.
Measured against `--foreground`: yellow crosses WCAG AA's 4.5:1 at alpha 0.45,
the other eleven tags between 0.65 and 0.70. In light mode the tags are pastel
and the text is near-black, so every tag clears 4.5:1 at *full* opacity; 0.75 is
chosen for looks with margin to spare, and measures 7.99:1 at its worst.

**This is the opposite way round from the palette's own legibility**, where
light is the tight theme because pastels crowd together. The same twelve colours
have opposite worst cases depending on whether the question is "can I tell these
apart" or "can I read text on this". Do not carry one conclusion into the other.

The dark ceiling shipped at 0.75 for about ten minutes, which put the minutes
text at 1.65:1 on a yellow day — perfectly legible in a screenshot and not
legible in use. If you move either ceiling, measure it; the eye passes this and
the numbers do not.

`MonthlyView` resolves the theme through `useTheme` and `resolveScheme` rather
than reading the `.dark` class, so it is not touching the DOM during render, and
a system theme change re-renders the provider and is picked up.

**The tag's name is in the cell for a reason.** Colour alone is the one encoding
this palette is measured to be unable to carry, and a mono print turns every
tint into the same grey. The name is the channel that survives both.

**`dominantTag` breaks ties by display position, not storage id.** Gray is id 6
at position 9 and magenta is id 9 at position 8, so a tie between them resolves
to magenta. A test uses exactly that pair, so comparing ids fails it.

## Search reads raw, and navigates by key

Search is the only feature that reads every stored week **without** repairing
it. Putting every week through `repairWeek` to grep five strings would be a
great deal of work for no benefit, so `searchWeeks` defends every field access
instead: `days` may be missing, `weeklyTodos` may be a string, a subject may be
a number, a memo may be null. One damaged week must cost its own matches and
nothing else. The test for this feeds it a week broken in every way at once,
beside a healthy one that still has to match — because the last thing to read
stored weeks raw was `exportAsCSV`, and one bad entry took the whole export
down for every user.

**A result's Monday comes from the entry key, which is the opposite of
`weekKeyForStoredWeek`, and deliberately.** That function decides where a week
*belongs* from the dates it carries, because a key can be wrong. Search is
answering a different question: `loadWeek` is key-addressed, so the key is the
only Monday that opens the week the match actually came from. Deriving it from
the dates inside would, for a week whose key and contents disagree, land the
user on a different week than their search hit — and would make a week too
damaged to state its own dates unsearchable, which is when finding your text
matters most.

**`loadAllWeeks` is the one place that enumerates stored weeks.** It matches
entries by shape rather than by the `planner-` prefix, which is what stopped
settings being treated as weeks. `exportAllData` was rewritten onto it when
search arrived rather than letting a third hand-written copy of that loop exist.

## Tag history shows the day and navigates by the key

`tagHistory` is the first caller to need both date rules at once, and they are
opposites. A row **displays** `day.date`, because the date is the fact and that
is the question being answered. It **navigates** by `mondayOfKey(weekKey)`,
because `loadWeek` is key-addressed and that is the only Monday that opens the
week the row came from. `mondayOfKey` moved out of `search.ts` into
`planner-data.ts` so it could sit beside `weekKeyForStoredWeek`, the rule it is
the opposite of.

Transposing those two fields is invisible to every test where the key and the
dates agree, which is most of them. The test that catches it stores a week
filed under `2026-W29` carrying August dates and asserts the row says 24 August
and goes to 13 July. Mutation-checked: swapping the fields kills that test and
two others, and leaves the happy-path ones green.

**A day with no readable date is skipped**, which is a deliberate divergence
from search. A week too damaged to state its dates stays searchable, because a
text match can navigate by key alone. It has no tag history, because here the
answer *is* a date and that week cannot supply one.

**The unit is a day within a stored week, not a calendar date.** Two stored
weeks carrying the same date give two rows, ordered by week key descending.
Merging them would add minutes belonging to two different weeks and then have
to pick one of the two to navigate to, making the row untrue either way.

**Blocked time and tagged priority rows are both uses, and are never added.**
`minutes` and `onPriorities` are separate fields for the same reason the month
report says "blocked" rather than "spent": a priority row is intent, not time.
A priority-only day reads "on priorities" rather than `0m`, which would be a lie
about the time rather than a statement about the day.

`totalsByTag` and `tagHistory` read through one `eachStoredDay` iterator in
`reporting.ts`, which is where the unrepaired-week defending now lives. That
extraction was made safe by leaving `reporting.test.ts` untouched: if it had
changed behaviour, those eight tests would have said so.

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

