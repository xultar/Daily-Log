# Splitting planner-data.ts

Approved 2026-08-28. Not yet implemented.

## Summary

Move two self-contained blocks out of `src/lib/planner-data.ts` into
`src/lib/palette.ts` and `src/lib/carry.ts`, and update the call sites so every
import names where the thing actually lives. No behaviour changes.

## Motivation

`planner-data.ts` is 969 lines and holds at least six unrelated concerns: week
shape, time totals, the wash, storage and key migration, repair, carry, and the
colour palette. CLAUDE.md already calls it "the big one", and the scheduling
spec written earlier today said it was worth splitting before the next thing
landed in it. Something else always lands in it.

The cost is not aesthetic. The file is the first thing a session opens and the
hardest to hold in context, and its two most dangerous rules — the storage-id
versus display-position distinction, and the cross-week writes — are buried
several hundred lines apart in it.

## The seams, and why these

**`palette.ts`** takes `BlockColor`, `BLOCK_COLORS`, `blockVar`,
`ROW_TINT_ALPHA`, `getBlockColor`, `getBlockTint`,
`COLOR_IDS_IN_DISPLAY_ORDER`, `getPaletteInDisplayOrder`, `legendCellBorders`,
`colorIdForDisplayPosition`, `displayPositionForColorId`, `isTagRunStart`, and
the colour-label load/save with their key.

It is the cleanest cut available: measured before proposing it, that block
references no `WeekData`, `DayData`, `SubjectRow`, `loadWeek`, `saveWeek` or
repair function at all. It is also the block CLAUDE.md calls "the one rule that
can corrupt user data", and it deserves a file whose name says so.

**`carry.ts`** takes `CarryCandidate`, `carriedWeeks`, `carriesForward`,
`collectCarryForward`, `applyCarryForward`, `markMigrated` and
`scheduleToWeek` — the whole Bullet Journal migration surface built today, which
currently sits in the middle of a storage module.

**Dependency direction, verified rather than assumed.** `planner-data` will
import `BLOCK_COLORS` from `palette` because `repairBlockValue` validates a
`colorId` against its length. `carry` will import `WeekData`, `loadWeek`,
`saveWeek` and `hasStoredWeek` from `planner-data`. Neither import runs the
other way: nothing in the palette block touches week shape, and nothing left in
`planner-data` calls a carry function. No cycles.

**`isUsableIsoDate` becomes exported.** `carriedWeeks` uses it, and it is
currently private. Exporting one small validator is the honest fix; copying it
into `carry.ts` would be a second copy of a rule, which is the failure this repo
names repeatedly.

## What deliberately does not move

**The wash constants and `tintAlpha`.** They read as palette-adjacent, but they
map *minutes* to an alpha and sit with `dominantTag` and `calcDayColorMinutes`,
which are week-shape. Moving them would split that group across two files to no
benefit. `WASH_CEILING_DARK` and `WASH_CEILING_LIGHT` stay measured constants
where the code that computes with them lives.

**Repair and storage stay together.** `loadWeek` calls `repairWeek`, and that
coupling is the design — a stored week is repaired, never replaced. Separating
them would put the rule and its enforcement in different files.

**Week shape, totals, keys and migration stay.** They are what `planner-data`
is once the two blocks are gone: roughly 650 lines with one subject.

## Imports are updated, not re-exported

Around 38 files import the moved symbols — 26 for the palette, 12 for carry.
Every one is updated to import from the new module.

A barrel — `planner-data` re-exporting everything — would make the diff nearly
empty, and was rejected. Every import would still say `planner-data`, so nothing
would get easier to find, and the barrel would be a second name for the same
thing. This file already argues that a second copy of something is a second
thing to keep true.

## Verification

The typechecker and the suite carry this refactor; there is nothing to
mutation-test, because nothing about behaviour is being asserted that was not
asserted before.

- `npm test` reports **634 tests across 58 files**, unchanged
- `npm run lint` reports **0 errors, 10 warnings**, unchanged
- `npm run build` is clean
- ~~The built bundle hash is unchanged~~ — **this was wrong, and is corrected
  here rather than quietly dropped.** The JS hash went from `index-BpP8QdaU.js`
  to `index-4G73LRCj.js`. Nothing is wrong: splitting one module into three
  changes the module graph, so Rollup's ordering and minified identifiers
  change even though the behaviour does not. CLAUDE.md's hash trick works for
  *the same source built two ways* — the Node 20 versus Node 24 comparison it
  was written for — and does not survive a structural refactor. Do not reach for
  it again on one.

  What stands in its place: the bundle **size** moved 475.61 kB to 475.67 kB, a
  60-byte delta consistent with three module wrappers rather than with code lost
  or duplicated; and each moved symbol is defined exactly once, in its new
  module, with nothing left behind.

CLAUDE.md's "Where things live" table is updated in the same commit, or it
starts lying the moment this lands.

## Risks

**A missed import is NOT caught by the build, and this bit during the work.**
`npm run build` is `vite build`, which transpiles without typechecking, so
`planner-data` referencing `displayPositionForColorId` after that symbol had
moved compiled perfectly and produced a clean bundle. Ten tests failed at
runtime instead — `dominantTag` breaks ties by display position, which is why it
needed two palette symbols rather than the one obvious `BLOCK_COLORS`.

The lesson is about the gate rather than the refactor: a green `npm run build`
says nothing about whether the imports are right. Run `npx tsc --noEmit -p
tsconfig.app.json` when moving symbols between modules. It is not part of CI —
`deploy.yml` is `npm ci`, `npm test`, `npm run build` — and there are six
pre-existing errors in test fixtures that it reports, unrelated to this and
untouched here.

What no tool catches is a symbol accidentally left behind *and* duplicated, so
the moved blocks were cut rather than copied, and each moved symbol was checked
to be defined exactly once.

**`strict` is off**, so this refactor cannot lean on the compiler as hard as it
looks. The suite is what actually proves nothing changed; the size and
single-definition checks only rule out code having been lost or copied.
