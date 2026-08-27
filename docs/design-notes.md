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

## Templating copies a shape, and only into empty slots

`applyTemplate` fills a block only when the target's is `0`, and lands a row
only in a blank row. Nothing the user wrote can be overwritten, and that single
safety property is what removes three features: the confirm dialog is a preview
rather than a warning, undo is unnecessary, and applying twice is a no-op that
falls out of the rules rather than being enforced.

**Days map by index, not by date.** The template's Monday is this week's
Monday. Matching on the date would copy nothing at all, because the two weeks
carry different dates by definition — which is why that test exists, and why
mutating the mapping kills it along with five others.

**`previewTemplate` and `applyTemplate` are both wrappers over one `fillDay`
pass**, which returns the filled day *and* the counts of what it did. Two
implementations of the copy rules would be free to drift, and a dialog that
promises numbers the result does not deliver is worse than a dialog with no
numbers. The counts cannot disagree because there is only one pass.

**Rows compact into the first blank row** rather than landing positionally,
matching `applyCarryForward`. The cost is real and was accepted knowingly: a
target day with a row in position 1 pushes the whole template down, so a
timetable's row order does not survive contact with existing content.

**`flagged` and `origin` never copy.** `flagged` is the user saying "this one
matters *this week*", and `origin` drives the age marker — stamping it would
render "1w" on a row created seconds ago. `checked` resets too: a source row
ticked last week arrives unticked.

**`findTemplateSource` is `findCarrySource`'s loop asking a different
question.** Carry stops at the most recent week that *exists*; templating skips
to the most recent week with *paint*, because an empty week is a fine thing to
carry from and a useless thing to copy.

**`applyWeekTemplate` must keep the updater form**, for the reason
`bringForward` must. It is the same closure hazard in a second place, and it
has its own test because every other template test acts on the mount week —
mutation-checked, where closing over `weekData` failed exactly one of the six.

**The toolbar button is rendered after `SearchDialog` deliberately.**
`carry-bar.test.tsx` finds the week chevrons as `querySelectorAll("button")[0]`
and `[1]`, so a button inserted earlier renumbers every one of them and breaks
a file that has nothing to do with templating.

## Renaming tags from the strip is a dialog, and deliberately not the day view's answer

The day view's legend is a two-column grid of ~100px cells with room for a
permanent field beside every swatch. The weekly strip is a horizontal scroller
of twelve entries at 10px text, each sized to its content. Transferring the day
view's answer would need twelve fixed-width fields and would push most of the
palette off screen, so the strip gets one button and a dialog instead.

**The dialog renames and never arms.** Arming stays in the strip, which means a
dialog row contains no `<button>` at all. The rule `legend-cell.test.tsx`
enforces for the day view — no cell nesting one interactive element inside
another — therefore holds here by construction. Its test is written as *the
list contains zero buttons*, not as a loop over buttons checking their
contents: that loop would never execute, and a test that cannot fail reads as
coverage without being any.

**The trigger sits outside the scrolling container.** Inside it, the button
follows twelve entries and is off screen at any normal width. That is invisible
at three tags and obvious at twelve, so a structural test asserts the trigger is
not a descendant of the `overflow-x-auto` element. Mutation-checked: moving it
inside kills that test and nothing else.

**`WeeklyColorLegend` holds its labels in `useState`, not `useMemo`.** Both read
once per mount — a `useState` initialiser runs exactly once — so the reason the
memo existed, that `loadColorLabels()` hits `localStorage` and this re-renders
at drag-paint rate, still holds. State is what lets the strip update itself when
the dialog edits. Everything the old comment said about conditional rendering
remains true and remains recorded. Mutation-checked: dropping the `setLabels`
call kills exactly the test that watches the strip update behind the dialog.

**Lifting the labels to `StudyPlanner` is the tidy-looking wrong answer.** It
would give one source of truth instead of two mounts each reading once — and it
would break day-view renames reaching the strip, because `StudyPlanner` never
remounts on a view switch. It only works if the day view is lifted too.

**Saving happens in the handler, never in an effect**, matching
`DailyView.updateLabel`. The effect version ran on mount as well as on change,
writing `planner-color-labels: {}` for users who had never named a tag. A test
asserts that opening the dialog writes nothing.

**Clearing a name stores an empty string rather than deleting the key.** Every
reader falls back with `labels[id] || c.label`, so an empty entry and a missing
one look identical in the UI — but not in a backup, where a cleared tag travels
as `{"6": ""}`. Harmless, and it matches what the day view already writes to the
same key.

**Typing a digit into a rename field does not repaint the grid.** `TimeGrid`'s
window-level handler bails when the target is an `INPUT`, before it ever checks
for `role="menu"`, `role="dialog"` or `role="listbox"`. The test fires the event
on the field rather than on `window`, because firing on `window` sets `target`
to `window` and skips the guard entirely — passing for the wrong reason. It is
paired with a positive case, so deleting the guard cannot leave both green.

## Trends scale per row, and the total carries the magnitude

Each tag's bars are measured against that tag's own busiest month. A single
global scale makes every row comparable — and flattens a tag used an hour a
week into a row of stubs, hiding exactly the trend the feature exists to show.
The cost of the choice is that two rows can look equally busy while being ten
times apart, so every row prints its span total, which is where the magnitude
went.

Only one test can tell the two scales apart, and it needs the right fixture:
**each tag's peak in a different month, and the tags an order of magnitude
apart.** With both peaks in the same month, a global scale still shows the
busiest at 100% and the test passes under either implementation.
Mutation-checked against a global maximum, where it fails alone and the other
six pass.

**`trendsByMonth` makes one pass, not twelve.** Twelve `totalsByTag` calls would
each walk every stored week. It is the third caller of `eachStoredDay`, the
iterator extracted during the templating work — which is the belated argument
for having extracted it.

**It is deliberately not a generalisation of `totalsByTag`.** That one takes an
arbitrary range rather than whole months, which is what lets the month report be
handed any two dates. The two look similar enough that a tidy-up would try to
fold them together.

**Every row is as long as `months`, with zeros.** A hole would be
indistinguishable from a month nobody worked, and the renderer would have to
align rows against the header itself.

**A month with no time draws its track and no bar.** An element at `height: 0%`
still carries its border and rounding, and twelve of those read as a row of
marks that mean nothing.

**No charting library.** The recharts note lists what would earn its weight —
axes, tooltips, zoom, real time series — and this has none of them. Bars in a
table cost 0.5 kB against +102 kB gzipped; the measured cost of this whole
feature was +0.77 kB gzipped.

**A table, not divs.** `scope="col"` and `scope="row"` name the month and the
tag for every cell. The visible month initial is a position marker — twelve of
them contain three Js — and the `sr-only` full month name is the fact.

**The trigger is called "Trends by tag", and must not contain "month".**
`carry-bar.test.tsx` finds the Month view button by accessible name, and a
trigger named "Time across months" matched both. That query is now anchored to
`/^month$/i`, matching the day-view test beside it, so either fix alone would
do — but the label is the one a future rename could undo without noticing.

## The day's free-text box is "Daily Log / Notes", and two other "Memo"s are not

The box was labelled "Memo" in both the day view and the week view, which
described its size rather than its purpose. Both now read "Daily Log / Notes".

**The CSV export column is still called `Memo`, deliberately.** `exportAsCSV`
writes it as a header and `export-import.test.ts` pins the whole header row.
That string is a data format, not a label: renaming it changes what lands in a
spreadsheet someone has already saved and may already have formulas against.
Finishing the rename "for consistency" is the mistake this note exists to stop.

**`SearchDialog` follows too**, in two places. `FIELD_LABEL.memo` names the
field a result matched, so a row now reads "24 – 30 Aug 2026 · Daily Log /
Notes · Friday". The longer label was expected to crowd that dense one-line row
and does not: the slash sits tight while the separators are spaced, so the two
do not compete. The dialog's own description also listed "memos" and now says
"notes" — it was the fourth copy of the word and the one easiest to miss, which
is why the test for it is written as an absence across the whole dialog rather
than an assertion about one string.

The longer placeholder was expected to clip in the week column and does not:
measured in a browser, "Daily Log / Notes..." is 68.9px at 8px against 97px of
available width. There is room for a longer label there if one is ever wanted.

**Today's notes area is washed with `--primary`, and it is the only `dark:`
variant in the app.** The column header already marks today with `bg-primary/80`;
the notes area below it repeats that at low strength so the active day is
distinguishable the whole way down. Riding `--primary` rather than a fixed
colour is what makes it follow all six accent themes as well as light and dark —
verified by switching Lavender to Campus Blue and watching both the header and
the wash move to the same new hue.

The alpha differs per theme, which is why the `dark:` variant exists at all.
Tokens flip themselves, so nothing here had ever needed one — but alpha is not a
token, and `--primary` is a deep purple in dark against a pale lavender in
light. A single 10% wash moved the light page by three of 255, which is
invisible. Measured: `bg-primary/40` composites to `rgb(242, 236, 248)` on
white, `dark:bg-primary/15` to `rgb(25, 24, 41)` on the dark page.

**Unlike the month view's wash, nothing here threatens text contrast** — the
wash is weak in both themes and the note text sits on an all-but-unchanged
background. The constraint is the opposite one: that the wash be seen at all.
Do not carry the month view's ceilings into this.

**The wash carries no `aria-current`.** The header alone is the semantic marker,
and `today.test.tsx` asserts exactly one such element across the week — adding a
second would break that count and announce the same day twice.

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


## Month notes: the first stored thing that is not a week

### Why the export version stayed at 2

Adding `monthNotes` to the export shape did not move the version number, and
that was a choice between two losses rather than an oversight.

Bumping to 3 makes a backup written after the change *refused outright* by any
older cached build: `READABLE_VERSIONS` would not contain 3, so `importFromJSON`
returns "That file was written by an unsupported version" and the weeks do not
land either. Staying at 2 lets that build read the file, restore every week and
every colour label, report success, and drop the notes silently.

The second is the smaller loss, and it only reaches someone restoring from a tab
cached before the change. But it is the failure mode this feature was written to
prevent, pointed the other way, so it is worth naming: **a build older than this
one restores a new backup minus the month notes and says nothing.**

That balance shifts as the unversioned surface grows. If a third stored shape is
ever added, re-decide this rather than inheriting it.

### Why the save is not debounced

`StudyPlanner` debounces at 300ms and needs `pendingRef` to answer *which week* a
pending write belongs to, plus three separate flushes — on leaving the week, on
unmount, and on `pagehide`. Every one of those exists because the debounce
exists.

A month note is one short string under its own key, so it writes on every
keystroke and none of that machinery is needed: there is no timer to flush, so
there is nothing to lose. That is the whole argument. The debounce in
`StudyPlanner` is not there for elegance — it is there because re-serialising a
whole `WeekData` on every keystroke is genuinely expensive — and copying it here
would have bought three failure modes to avoid a cost that is not being paid.

If a month note ever grows large enough for this to matter, the answer is a
debounce *with* the three flushes, not a quiet change of save timing.

### The auto-grow effect is not the mount-write bug

`MonthNotes` has a `useLayoutEffect` that runs on mount, which is the shape this
repo has twice been burned by — `DailyView` writing back every label it read, and
`StudyPlanner` turning an unreadable week into an empty one 300ms after it was
opened.

It is not the same thing. The rule is about effects that **persist state**. This
one reads `scrollHeight` and sets `style.height`; it touches no storage and no
React state. It cannot write anything.

It also cannot be removed. The print block resets `overflow` on the
`.overflow-auto` family of utility classes, but a `<textarea>` scrolls by its own
nature rather than through those classes, so a fixed-height one prints only the
lines that happen to be in view and drops the rest without a mark. The
alternative was a print-only duplicate of the text, rejected as a second copy of
something that has to be kept true.

### `scrollHeight` alone is one border too short

The first version of that effect set `el.style.height = el.scrollHeight + "px"`,
which is the idiom every answer on the subject gives. It is wrong here, and the
browser is the only place it shows.

Tailwind sets `box-sizing: border-box`, so `height` covers the borders as well as
the content. Setting it to the content height therefore leaves the field one
border-width short of its own text, permanently: measured in the running app at
`clientHeight: 139, scrollHeight: 140`. On screen that single pixel is invisible.
In print it shaves the descenders off the last line — which is exactly the
failure the effect exists to prevent, arriving by a different route.

The fix measures the border rather than assuming it:

```ts
const border = el.offsetHeight - el.clientHeight;
el.style.height = `${el.scrollHeight + border}px`;
```

Measuring matters more than it looks. The rendered border here totalled **1px,
not the 2px** a 1px border on each edge implies — subpixel rounding at this
element's size — so a hardcoded `+ 2` would have over-sized the box instead. It
also means changing the border width in the class list cannot quietly bring the
clipping back.

**jsdom cannot see this.** It does no layout, so `scrollHeight`, `clientHeight`
and `offsetHeight` are all 0 and the field's real height is unobservable. The
test pins the *arithmetic* instead, by defining those three properties on
`HTMLTextAreaElement.prototype` and asserting the resulting `style.height`. That
is a genuine test of the thing that was wrong, and it is the most a
layout-less DOM can give.

### The two mutations that mattered

Both produce a green suite and wrong behaviour, and neither is visible by reading
the diff.

**Dropping `key={monthKey}` from the `MonthNotes` element in `MonthlyView`.**
Without it the component keeps its state across a month change, so paging from
August to September shows August's text — and the next keystroke saves it under
`daily-log-month-2026-09`. One month's reflection is overwritten by another's.
Guarded by "shows the month it is looking at, not the one before", which
re-renders rather than mounting twice precisely so it can catch this.

**Dropping the merge-sort in `searchAll`.** Month matches are then appended after
every week match rather than interleaved by date, so a note filed in August
appears below a week from the previous July. Guarded by the three-way ordering
assertion in `month-notes-search.test.tsx`.

### A mutation that cannot be killed, and why the plan was wrong to ask for one

The implementation plan claimed a third mutation: that sorting a month match on
`monthKey` rather than `` `${monthKey}-01` `` would file the note outside its own
month and break the ordering test. It does not, and no test can make it.

`"2026-08"` is a *prefix* of every `2026-08-..` date, and a prefix sorts before
the strings it prefixes. So the bare month key and the `-01` form compare
identically against every `yyyy-MM-dd` string there is — including dates in their
own month, in earlier months, and in later ones. The two are order-equivalent by
construction.

The `-01` stays, because every sort key having the same shape is worth something
and because the line survives the comparison ever ceasing to be a string compare.
But the comment on `sortKey` now says outright that it is legibility rather than
behaviour, so that nobody writes a test claiming to pin it and believes the green
tick.

## The week's priority rows line up in the view, not in storage

### The backlog item was wrong, and wrong in an instructive way

The 2026-08-27 shakedown opened a week damaged in every way at once and found
Monday rendering three priority rows while the other six rendered six, so
Monday's time grid started higher than its neighbours. It was written up as a
repair bug with a named root cause — `repairList` pads only when the incoming
value is missing or empty — and a named fix: pad at the `subjects` call site.

Every part of that was wrong, and each part was checkable before writing code.

**`repairList` preserving length is deliberate, and its own comment says so.**
*"Both views let a user delete rows down to one, so padding a short-but-real
list would resurrect rows they removed on purpose."* `DailyView.removeSubject`
really does delete rows. The proposed fix would have traded a documented data
rule for a cosmetic one.

**The test the item asked for already existed**, and forbids the fix the item
proposed. `week-repair.test.ts` has carried "does not resurrect priority rows the
user deleted" — a stored day sliced to two rows must load as two — since before
the item was written. The item claimed there was no such case; there was, and it
was a characterisation test pinning exactly the behaviour the item wanted to
break.

**No damage is needed to reproduce the symptom.** Delete three rows on Monday in
the day view and the week view misaligns. The shakedown reached it through a
corrupted week, which is what made it look like a repair problem.

**Padding to six could not have worked anyway.** `addSubject` is uncapped, so a
day with eight rows throws the other six columns out in the direction six cannot
reach. Measured in the browser: with a day at eight rows, every column settles at
a grid top of 246.43px; a fix pinned to six leaves five of them at the six-row
height.

The lesson is not that the backlog was sloppy — it was written from a real
observation. It is that a root cause stated in a backlog item is a hypothesis,
and the file it names is the place to check it. The comment that refuted the
whole item was four lines above the function the item accused.

### What the fix actually is

One row count for the week, computed in `StudyPlanner` from `visibleDays` and
passed to every `DayColumn` as `rowCount`. A column renders its real rows, then
inert `aria-hidden` spacers up to that count. Nothing stored changes.

`Math.max(1, ...)` rather than a bare spread: `repairWeek` guarantees a repaired
day has rows, but this reads `weekData` directly and `Math.max()` over an empty
list is `-Infinity`, which would render no rows at all.

**Visible days, not all seven.** Padding the weekdays out to match a hidden
Saturday reads as unexplained empty space. `visibleDays` already existed and is
weekend-aware, so this cost nothing.

**No floor.** If every day holds three rows, three is right. A floor of six shows
blank rows to someone who deliberately trimmed every day.

### The measurement is the test, because jsdom has no layout

The suite counts row slots and checks that spacers carry no controls. **Not one
of its assertions can see whether the columns line up** — jsdom performs no
layout, so every offset is zero.

What confirms the fix is a browser measurement, and it is worth recording
because it also demonstrates the bug:

| | Monday's grid top | others |
| --- | --- | --- |
| spacers suppressed | 166.64px | 214.29px |
| spacers present | 214.29px | 214.29px |

47.65px of misalignment, three rows' worth, reduced to a single distinct value
across all seven columns.

**The spacer's height is matched by construction, not by assertion.** Its
children are empty equivalents of a real row's — the colour stripe, the checkbox,
the text input — and if a real row's markup changes, the spacer can silently stop
matching with the whole suite green. Re-measure `TimeGrid`'s `offsetTop` across
columns after touching either.
