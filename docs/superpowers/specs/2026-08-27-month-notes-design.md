# Notes and reflections for the month

Date: 2026-08-27
Status: approved

## Summary

Below "Time blocked by tag" in the month view, a free-text area for notes on the
month — what went well, what to change. The text is stored under its own key per
month, saved as it is typed, printed with the month when it has anything in it,
and carried in a backup.

It is the first thing this app stores that is not a week.

## Motivation

The week already has a `weekReview`, and the month view already answers "where
did the time go" with the calendar wash and the tag bars. What it cannot hold is
the reading of those numbers: that the teaching block ate September, that the
thesis tag only ever appears on Fridays and that is the problem. That belongs
beside the evidence, once per month, not scattered across four weekly reviews.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Storage shape | One entry per month | A small write per month, no read-modify-write of a growing blob, and a damaged August cannot take September with it |
| Key | `daily-log-month-YYYY-MM` | Off the `planner-` prefix, per the rule in "A stored week is repaired, never replaced" — keep new entries out of the overlap rather than trust the shape match to sort them out |
| Encoding | Raw text, not JSON | `readItem` returns a string or null, so `?? ""` *is* the repair path. There is no damaged state to defend against |
| Empty note | Removes the key | Otherwise typing and deleting leaves a dead entry forever, and every backup ships an empty string |
| Module | New `src/lib/month-notes.ts` | A month note is not week data, and `planner-data.ts` is already 817 lines |
| Save timing | On every keystroke | One short string under its own key. Deletes the whole `pendingRef` class of bug rather than reimplementing it |
| Save failure | Warn once per failure episode | `StudyPlanner`'s `saveFailedRef` rule. At one write per keystroke, warning per failure buries itself |
| State seeding | Lazy `useState` initialiser plus `key={monthKey}` | No effect reads storage, so nothing writes on mount |
| Backup | New top-level `monthNotes`, `version: 3` | It is content, not a device preference, so it is a sibling of `weeks` rather than a member of `settings` |
| Import | Merge by month key, validate like `usableLabels` | A file that does not mention September is not an instruction to delete September |
| Print | Prints when non-empty, `no-print` when empty | The month view prints and the week's Goal prints with it. An empty box on a printout is noise |
| Search | Not searchable | Deferred to its own item. See Out of scope |
| CSV | Untouched | `exportAsCSV` is a per-day row format and a month note has no day |

Rejected alternatives:

- **One entry holding every month**, `daily-log-month-notes` as a
  `{ "2026-08": "..." }` map, exactly as `planner-color-labels` is stored. One
  key for export to learn about instead of a scan, and marginally less code.
  Rejected because every keystroke would rewrite every month ever written, and a
  single bad parse would lose all of them at once. The colour labels get away
  with this because there are twelve of them and they are written rarely; notes
  grow without bound and are written continuously.
- **Storing the note inside a week**, on the week containing the 1st or the
  15th. No new storage shape at all, and export, import and search would carry
  it for free. Rejected because a month is not a week: the note would vanish
  when that particular week was damaged, and a month spanning six stored weeks
  would hide its own reflection inside one arbitrary one.
- **A debounced save mirroring the week autosave.** Consistent with the rest of
  the app and fewer writes. Rejected because it imports all three documented
  failure modes — flush on unmount, flush on leaving the month, flush on
  `pagehide` — and the flush would have to write to the month it was typed in
  rather than the month now on screen. That is three tests before the feature
  has any of its own, bought to avoid a `setItem` of a few hundred bytes.
- **Save on blur.** The least machinery of all. Rejected because a tab closed
  mid-sentence does not reliably fire blur, and a reflection on a month is
  exactly the text a user writes once and does not retype.
- **A print-only duplicate of the text** beside a fixed-height textarea, to dodge
  the clipping problem. Rejected as a second copy of something that has to be
  kept true. The textarea auto-grows instead, which is correct on both media with
  one element.
- **Putting `monthNotes` inside `settings`.** Smaller diff, no version bump.
  Rejected because `settings` is documented as what travels *besides* the weeks —
  colour labels are there because they are the mapping the stored numbers are
  read through, not because they are prose. A note is content and belongs at the
  top level with the content.

## The module

`src/lib/month-notes.ts`, in the style of `search.ts` and `week-template.ts`:
one concern, its own file, going through `storage.ts` for everything.

```ts
const PREFIX = "daily-log-month-";
/** A calendar month, not merely four digits and two more: 13 is not a month. */
const MONTH_ENTRY = /^daily-log-month-(\d{4}-(?:0[1-9]|1[0-2]))$/;

export function monthKeyOf(date: Date): string;
export function monthKeyFromEntryKey(entryKey: string): string | null;
export function loadMonthNote(monthKey: string): string;
export function saveMonthNote(monthKey: string, text: string): boolean;
export function loadAllMonthNotes(): Record<string, string>;
```

`monthKeyOf` is `format(date, "yyyy-MM")`.

`loadMonthNote` is `readItem(PREFIX + monthKey) ?? ""`. That single line is the
whole repair path, and it is why the encoding is raw text: a stored month note
cannot be malformed, only absent. Every other reader of storage in this app has
to assume damage because every other reader parses something.

`saveMonthNote` calls `removeItem` when the text is empty *after trimming*, and
otherwise writes the text *untrimmed*. It returns the boolean either call gives
it.

Those two are deliberately not the same test. All-whitespace is the absence of a
note, and storing `"   "` would be a third state meaning what the other two
already mean. But once there is a note, the leading and trailing whitespace is
the user's — prose has blank lines in it, and a save that quietly reformatted
what was typed would be a worse bug than the one it tidied.

`loadAllMonthNotes` walks `listKeys()` through `monthKeyFromEntryKey`, mirroring
`loadAllWeeks`. It exists so export does not reimplement the scan, which is the
same reason `loadAllWeeks` exists.

`monthKeyFromEntryKey` mirrors `weekKeyFromEntryKey` and is the only place the
key format is known.

## The component

`src/components/planner/MonthNotes.tsx`, taking `{ monthKey: string }`.

In `MonthlyView`, a sibling of `TimeByTag` and directly below it. `MonthlyView`
has no month key today, so it derives one from the date it already holds:

```jsx
const monthKey = monthKeyOf(currentDate);
...
<TimeByTag from={monthStart} to={monthEnd} />
<MonthNotes key={monthKey} monthKey={monthKey} />
```

Sibling, not child. `TimeByTag` returns `null` when nothing is blocked in the
range, and the note has to survive that — a month with no painted blocks is
precisely a month worth writing about.

The `key` is what reseeds the field when the user pages to another month. State
is seeded by a lazy `useState(() => loadMonthNote(monthKey))` initialiser and the
`key` remounts the component, so nothing reads storage from an effect and there
is nothing to write back on mount. The carry bar is mounted with `key={monday}`
for the same reason.

`onChange` sets state and calls `saveMonthNote` in the same handler — save where
the change happens, which is the fix applied to `DailyView.updateLabel` and which
leaves nothing to guard. A `saveFailedRef` holds whether the last write was
refused, and the `toast` from `@/hooks/use-toast` fires only on the transition
into failure — the same ref, the same hook and the same destructive variant
`StudyPlanner.flushPendingSave` uses, so a storage outage says one thing whether
the user was editing a week or a month.

The heading matches `TimeByTag`'s: a 10px uppercase muted `h3` reading "Notes and
reflections". The placeholder asks "What went well this month? What would you
change?" and needs no print handling — the print block already renders
placeholders transparent.

## Print

The textarea auto-grows to its content: a layout effect sets `style.height` from
`scrollHeight` on mount and on every change.

This is load-bearing rather than cosmetic. The print block strips borders and
padding from `input, textarea`, and forces `overflow: visible` on the
`.overflow-auto` family — but a textarea scrolls by its own nature, not by those
utility classes, so a fixed-height one prints only the rows that happen to be in
view and silently drops the rest.

**That effect is not the banned pattern and the file must say so.** The rule
learned from `DailyView` is that *an effect which persists state* writes on every
mount. This one measures a DOM node and sets a DOM property; it persists nothing.
Without a comment saying that, the next reader deletes it on sight.

When the note is empty the container carries `no-print`, so an unused month
prints nothing at all rather than an empty frame under the tag bars.

## Backup

```ts
export interface ExportData {
  version: 3;
  exportedAt: string;
  weeks: Record<string, WeekData>;
  /** Keyed "yyyy-MM". Absent months are absent, never empty strings. */
  monthNotes: Record<string, string>;
  settings: ExportSettings;
}

const READABLE_VERSIONS = [1, 2, 3];
```

`exportAllData` gains `monthNotes: loadAllMonthNotes()`, written unconditionally
like `settings` so the shape of an export is predictable.

Import gains a `usableMonthNotes` filter modelled line for line on
`usableLabels`: the key must match the month pattern, the value must be a string,
and empty values are dropped. It runs after the weeks have landed and is merged
into whatever is already stored, so a file that names August does not delete
September.

A failed month-note write does not fail the restore, for the reason the labels do
not: the weeks are what the user came for, and a restore that saved every week
must not be reported as a failure because a note would not fit.

## Changes

| File | Change |
| --- | --- |
| `src/lib/month-notes.ts` | New. The five functions above |
| `src/components/planner/MonthNotes.tsx` | New. The field |
| `src/components/planner/MonthlyView.tsx` | Mount `MonthNotes` below `TimeByTag` |
| `src/lib/export-import.ts` | `version: 3`, `monthNotes` in export, `usableMonthNotes` on import |

Nothing in `planner-data.ts` changes. `loadAllWeeks` already ignores the new key
by construction — its regex is anchored on `^planner-(\d{4}-W\d{2})$` — and that
is asserted rather than assumed. See Testing.

## Testing

TDD throughout, then mutation-test each assertion, then look at the month view in
a browser: jsdom sees no layout, so the auto-grow and the placement under the tag
bars are not verifiable from the suite.

`src/test/month-notes.test.ts`

- A saved note loads back.
- An absent month loads as `""`.
- Saving `""` removes the key rather than storing an empty string.
- Saving whitespace only also removes the key.
- `monthKeyFromEntryKey` returns the month for `daily-log-month-2026-08`.
- It returns null for `planner-2026-W35`, for `daily-log-month-2026-13`, for
  `daily-log-month-2026-00` and for `daily-log-unreadable-2026-W35`.
- `loadAllMonthNotes` collects only month entries, ignoring weeks and settings.
- Storage that throws on read gives `""`; storage that throws on write gives
  `false`.

`src/test/month-notes-backup.test.ts`

- Export → clear → import round-trips notes byte-identical alongside weeks.
- A `version: 2` file with no `monthNotes` imports without error and touches no
  stored note.
- A file whose `monthNotes` holds a non-string value, or a key like `2026-13`,
  skips that entry and imports the rest.
- A month stored locally but not named in the file survives the import.
- A refused note write does not turn a successful week restore into a failure.

`src/test/month-notes-view.test.tsx`

- The field renders below the tag bars in the month view.
- It renders even when `TimeByTag` renders nothing.
- Typing writes to storage immediately — no timer advance needed.
- Paging to the next month shows that month's note, not the previous one's.
- The container carries `no-print` when empty and does not when it has text.
- A storage failure warns once across several keystrokes, and warns again after a
  recovery and a second failure.

`src/test/all-weeks.test.ts`

- One added case: `loadAllWeeks()` ignores a `daily-log-month-*` entry. The prefix
  overlap is what made `exportAsCSV` export two settings as weeks and die on the
  first one, for every user on every run. This key is deliberately clear of that
  prefix, and the test is what keeps it clear.

## Out of scope

**Search.** `searchWeeks` iterates `loadAllWeeks()`, and every `SearchMatch`
carries a `weekKey` and a `monday` because clicking one navigates to a week. A
month note has neither. Making it searchable means widening the match shape and
the dialog's navigation contract to open the month view at a month — and this
codebase already holds two deliberately opposite date rules, `mondayOfKey` for
navigation and `weekKeyForStoredWeek` for filing. A month result needs a third.
That is its own design, not a rider on this one.

**A month entity.** This adds a stored string keyed by month, not a month object.
Nothing else about a month is stored, and `totalsByTag` aggregates per day
precisely so it never needs one.

**Carrying a note forward, or templating it.** A reflection is about the month it
names.

## Risks

**The version bump refuses old readers.** A backup written by this build is
rejected outright by a build from before it, rather than restored minus the
notes. That is the intended trade — silently dropping user-typed prose is the
failure this item exists to prevent — but it is a real regression for anyone
holding a stale cached tab, and worth stating rather than discovering.

**One `setItem` per keystroke.** Cheap for a few hundred bytes under its own key,
and it is what buys the absence of the whole flush-on-unmount problem. If a month
note ever grows to a size where this matters, the answer is a debounce with the
three flushes, not a quiet change of save timing.

**The auto-grow effect looks like the mount-write bug.** Mitigated by a comment at
the effect and by this section, and by nothing else. It persists nothing.
