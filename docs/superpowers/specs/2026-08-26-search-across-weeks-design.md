# Search across weeks

Date: 2026-08-26
Status: approved

## Summary

Text search over everything the user has written, across every stored week, from
a dialog in the toolbar. Clicking a result jumps to that week.

## Motivation

Months of memos, priorities and weekly actions are reachable only by clicking
week by week. There is no way to answer "where did I write that" except to
remember roughly when.

The data access is already solved: every stored week is enumerable, and
`exportAllData` has been doing it since the exporter was fixed.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| What is searched | The five text fields the user types into | Searching what you wrote is the whole request |
| Matching | Case-insensitive substring | Least surprising; fuzzy invents relevance nobody asked for |
| Minimum query | 2 characters | One letter matches most weeks and answers nothing |
| Where a click lands | Always the week view | One rule, no exceptions to remember |
| Result rows | Week, field, day, snippet | The day is what makes landing on the week workable |
| How many results | All of them, scrolled | A cap reads as "that is everything" when it is not |
| Shell | `Dialog` | Already used here, and the paint shortcuts are already suppressed inside one |

Rejected alternatives:

- **Landing where the match lives** — a memo opening its day, a week goal
  opening its week. More precise and more rules; the day name in the result row
  recovers most of the benefit for none of the branching.
- **Landing on the week with the match highlighted.** Best of both and the most
  plumbing: a highlight prop threaded through the week view and every field that
  can match.
- **Searching colour tags in the same box.** A different query — it reads
  `timeBlocks` rather than prose and answers with dates rather than passages.
  Backlogged, along with time reporting. The result list should leave room for a
  tag filter beside it.
- **Capping results.** Rejected in favour of scrolling: this repo already has a
  note that a silent cap reads as complete coverage.

## What is searched

Five fields, two levels:

| Level | Field |
| --- | --- |
| Week | `weekGoal` |
| Week | `weekReview` |
| Week | `weeklyTodos[].text` |
| Day | `days[].subjects[].subject` |
| Day | `days[].memo` |

Nothing else is text the user typed. Colour labels are excluded deliberately:
they are settings, they live outside any week, and finding one would have
nowhere to jump to.

## A result

    { weekKey, monday, field, dayIndex?, snippet }

- **weekKey** identifies the week; **monday** is what the click sets
  `currentDate` to.
- **field** is shown as a human label — "Memo", "Priority", "Weekly action",
  "Goal", "Review".
- **dayIndex** is present only for day-level matches, and renders as the day
  name. This is what makes the always-land-on-the-week rule workable: the week
  view truncates a memo to one line, so the row has to say which day to look at.
- **snippet** is the matching text with context either side.

Ordered by week, newest first: what you are looking for is usually recent.

## Reading every stored week

This is the **third** consumer of "iterate every stored entry that is a week",
after `exportAllData` and `migrateWeekKeys`. The last time that loop was written
by hand it matched on the `planner-` prefix rather than the entry shape,
exported two settings as weeks, and killed `exportAsCSV` on `week.days is not
iterable` — for every user, on every run, until it was fixed.

So the enumeration moves into `planner-data.ts` as `loadAllWeeks()`, returning
`Record<weekKey, unknown>` for entries that parse, and `exportAllData` is
rewritten to use it. Search becomes the second caller rather than the third
implementation.

**Search reads unrepaired weeks.** Running every stored week through
`repairWeek` to grep text would do a great deal of work to read five strings,
and repair is a load-time concern rather than a read-one-field concern. The
consequence is that every field access must defend itself: a week whose `days`
is missing, or whose `weeklyTodos` is a string, must yield no matches rather
than throw. One malformed week must not take the whole search down.

## Testing

The search is a pure function over week data, so most of this needs no
component:

- Each of the five fields matches.
- Matching is case-insensitive, and a two-character query works while a
  one-character query returns nothing.
- Results are ordered newest week first.
- A day-level match carries its `dayIndex`; a week-level match does not.
- The snippet contains the match.
- A malformed week — `days` missing, `weeklyTodos` a string, a subject that is a
  number — yields no matches and does not throw, and a good week beside it still
  matches. This is the one that matters: it is the failure mode that broke CSV
  export.
- Colour labels are not searched.
- `exportAllData` still behaves exactly as before once it is rewritten on
  `loadAllWeeks` — its existing tests are the guard, and they must not be
  edited as part of this change.

Then one component test: clicking a result sets the week and closes the dialog.

Every new test is mutation-tested.

## Out of scope

- Searching by colour tag, and time reporting. Both backlogged.
- Highlighting the match in the destination view.
- Fuzzy matching, regular expressions, or ranking by relevance.
- Searching colour labels.
- Any change to how weeks are stored.

## Risks

**Unrepaired data is the whole risk.** Search is the first feature to read every
stored week without repairing it. The mitigation is defensive field access and a
test built from a genuinely malformed week rather than a tidy one.

**Scanning is synchronous.** Every keystroke past two characters re-scans every
stored week. At a few hundred weeks of a few kilobytes this is unmeasurable; it
would not be at tens of thousands, which this app has no way to produce. If it
ever bites, the answer is to debounce rather than to index.

**Rewriting `exportAllData` touches working code.** It is worth it — the
alternative is a third copy of a loop that has been got wrong before — but the
exporter's tests are the safety net, and this change is only correct if they
pass untouched.
