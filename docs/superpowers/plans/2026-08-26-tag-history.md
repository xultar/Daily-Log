# Tag History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pick a colour tag and get every day it was used, newest first, as a second mode inside the existing search dialog.

**Architecture:** A new `tagHistory(colorId)` in `src/lib/reporting.ts` walks every stored week and returns one `TagUse` per day the tag was painted or listed on a priority row. It shares a day-iterator with `totalsByTag` rather than becoming a third hand-written copy of that loop. A `TagUse` displays the day's own `date` but navigates by a Monday derived from the entry key, so `mondayOfKey` moves from `search.ts` into `planner-data.ts` where both callers can reach it. The UI is a new `TagHistoryPanel` rendered by `SearchDialog` when its mode is `tag`.

**Tech Stack:** TypeScript, React 18, Vite, vitest + @testing-library/react, date-fns, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-26-tag-history-design.md`

**Branch:** `tag-history`, already created off a clean `main`.

**Baseline before starting:** `npm test` 394 tests across 38 files, `npm run lint` 0 errors and 10 warnings, `npm run build` clean. Confirm this before Task 1 and do not proceed if it differs.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/planner-data.ts` | Gains exported `mondayOfKey`, beside `weekKeyForStoredWeek`. The two opposite key/date translations live together. |
| `src/lib/search.ts` | Loses its private `mondayOfKey` and its whole date-fns import; imports the shared one. |
| `src/lib/reporting.ts` | Gains a private `eachStoredDay` iterator, has `totalsByTag` rewritten onto it, and gains `TagUse` and `tagHistory`. |
| `src/components/planner/TagHistoryPanel.tsx` | New. The tag picker and the result list. Knows nothing about dialogs. |
| `src/components/planner/SearchDialog.tsx` | Owns the dialog shell, the mode toggle and the jump; renders one body or the other. |
| `src/test/planner-data.test.ts` | Gains direct tests for `mondayOfKey`. |
| `src/test/tag-history.test.ts` | New. The data layer. |
| `src/test/tag-history-dialog.test.tsx` | New. The panel through the dialog. |
| `CLAUDE.md` | Baselines test count; backlog item 2 replaced by what shipped. |

---

### Task 1: Move `mondayOfKey` into `planner-data.ts`

Pure move. `search.ts` keeps behaving identically, and its seven existing tests are the proof.

**Files:**
- Modify: `src/lib/planner-data.ts` (import line 1; new function after `weekKeyFromEntryKey`, ~line 509)
- Modify: `src/lib/search.ts:1-2` and delete lines 26-48
- Test: `src/test/planner-data.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/test/planner-data.test.ts`. Add `mondayOfKey` to the existing import from `@/lib/planner-data`.

```ts
describe("mondayOfKey", () => {
  it("gives the Monday a week key opens", () => {
    expect(mondayOfKey("2026-W35")).toBe("2026-08-24");
  });

  it("crosses the week-year boundary, where the calendar year is no guide", () => {
    // ISO week 1 of 2026 starts in December 2025. A naive implementation that
    // counted from 1 January would be a week out here and nowhere else.
    expect(mondayOfKey("2026-W01")).toBe("2025-12-29");
  });

  it("returns null for anything that is not a week key", () => {
    // The entry key, rather than the week key, is the likeliest thing to
    // arrive here by mistake.
    expect(mondayOfKey("planner-2026-W35")).toBeNull();
    expect(mondayOfKey("2026-W5")).toBeNull();
    expect(mondayOfKey("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/test/planner-data.test.ts -t "mondayOfKey"`
Expected: FAIL — `mondayOfKey is not a function`, or a TypeScript error that it is not exported.

- [ ] **Step 3: Add the function to `planner-data.ts`**

Change line 1 to add the two date-fns helpers it needs:

```ts
import { startOfWeek, addDays, format, parse, isValid, getISOWeek, getISOWeekYear, differenceInCalendarWeeks, setISOWeek, startOfISOWeek } from "date-fns";
```

Insert after `weekKeyFromEntryKey` (around line 509), immediately before the `loadAllWeeks` doc comment:

```ts
/**
 * The Monday a week key opens, for callers that need to navigate to a stored
 * week rather than file one.
 *
 * Note that this is the opposite of `weekKeyForStoredWeek`, which decides where
 * a week *belongs* from the dates it carries, on the grounds that a key can be
 * wrong. That rule is about filing. This is about navigation, and the question
 * is different: `loadWeek` is key-addressed, so this is the only Monday that
 * opens the week found at this key. Deriving it from the dates inside would,
 * for a week whose key and contents disagree, land the user somewhere other
 * than the week they asked for.
 *
 * It also means a week too damaged to state its own dates can still be opened,
 * which is when reaching it matters most.
 */
export function mondayOfKey(weekKey: string): string | null {
  const m = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  // Jan 4th is always in ISO week 1, so it is a safe anchor to count from.
  const anchor = setISOWeek(new Date(Number(m[1]), 0, 4), Number(m[2]));
  if (!isValid(anchor)) return null;
  return format(startOfISOWeek(anchor), "yyyy-MM-dd");
}
```

- [ ] **Step 4: Point `search.ts` at it**

Replace lines 1-2 of `src/lib/search.ts`:

```ts
import { loadAllWeeks, mondayOfKey } from "./planner-data";
```

The old date-fns import goes entirely — `setISOWeek`, `startOfISOWeek`, `format` and `isValid` were used only by the function being moved. Then delete the local `mondayOfKey` definition and its doc comment (the block running from `/**\n * The Monday to send a click to...` down to its closing `}`), leaving `snippetAround` as the first function in the file.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, 397 tests across 38 files. The three new ones are the addition; `search.test.ts` must still be 10 passing, unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/lib/planner-data.ts src/lib/search.ts src/test/planner-data.test.ts
git commit -m "Move mondayOfKey to planner-data, beside weekKeyForStoredWeek"
```

---

### Task 2: Share the stored-day walk between `totalsByTag` and what follows

A refactor with no behaviour change. `totalsByTag`'s eight existing tests are not edited, and their staying green is the proof.

**Files:**
- Modify: `src/lib/reporting.ts`
- Test: `src/test/reporting.test.ts` (read only — do not edit)

- [ ] **Step 1: Run the tests that must not move**

Run: `npx vitest run src/test/reporting.test.ts`
Expected: PASS, 8 tests. Note the number; it must be identical after this task.

- [ ] **Step 2: Add the iterator**

Insert into `src/lib/reporting.ts` after the `ISO_DATE` constant:

```ts
/** A stored day, with the key of the week it was found under. */
interface StoredDay {
  /** The entry key's week key. Where a navigation target comes from. */
  weekKey: string;
  /** The day's own ISO date, or "" when it does not carry a readable one. */
  date: string;
  /** The ten-minute grid, or [] when the day does not carry one. */
  grid: unknown[];
  /** The day's priority rows, or [] when absent. */
  subjects: unknown[];
}

/**
 * Every day in every stored week, with the shape-defending already done.
 *
 * **Weeks arrive unrepaired**, straight from `loadAllWeeks`, so this is where
 * the defending lives rather than in each caller: `days` may be missing, a day
 * may be a string, `timeBlocks` may not be a grid, `subjects` may be absent.
 * One damaged week costs its own days and nothing else. The last thing to read
 * stored weeks raw was `exportAsCSV`, and a single bad entry took the whole
 * export down for every user.
 *
 * It exists because `totalsByTag` and `tagHistory` are the same walk keeping
 * different bookkeeping, and a third hand-written copy of this loop is exactly
 * what `exportAllData` was rewritten onto `loadAllWeeks` to avoid.
 */
function* eachStoredDay(): Generator<StoredDay> {
  for (const [weekKey, week] of Object.entries(loadAllWeeks())) {
    const days = Array.isArray((week as { days?: unknown })?.days)
      ? (week as { days: unknown[] }).days
      : [];

    for (const day of days) {
      if (!day || typeof day !== "object") continue;
      const d = day as Record<string, unknown>;

      const raw = typeof d.date === "string" ? d.date : "";
      const dated = ISO_DATE.test(raw) && isValid(parse(raw, "yyyy-MM-dd", new Date()));

      yield {
        weekKey,
        date: dated ? raw : "",
        grid: Array.isArray(d.timeBlocks) ? d.timeBlocks : [],
        subjects: Array.isArray(d.subjects) ? d.subjects : [],
      };
    }
  }
}
```

- [ ] **Step 3: Rewrite `totalsByTag` onto it**

Replace the body of `totalsByTag` (keep its doc comment, and keep the note about aggregating day by day):

```ts
export function totalsByTag(from: Date, to: Date): TagTotal[] {
  const start = format(from, "yyyy-MM-dd");
  const end = format(to, "yyyy-MM-dd");
  const minutes: Record<number, number> = {};

  for (const { date, grid } of eachStoredDay()) {
    // A day with no readable date cannot be placed in a range.
    if (!date) continue;
    // ISO dates compare correctly as strings, which avoids building a Date
    // per day and avoids any timezone question about what "in range" means.
    if (date < start || date > end) continue;

    for (const hour of grid) {
      if (!Array.isArray(hour)) continue;
      for (const block of hour) {
        if (typeof block === "number" && block > 0) {
          minutes[block] = (minutes[block] ?? 0) + MINUTES_PER_BLOCK;
        }
      }
    }
  }

  return Object.entries(minutes)
    .map(([colorId, mins]) => ({ colorId: Number(colorId), minutes: mins }))
    .sort((a, b) => b.minutes - a.minutes);
}
```

- [ ] **Step 4: Run the tests that must not have moved**

Run: `npx vitest run src/test/reporting.test.ts`
Expected: PASS, 8 tests, all green, file unedited.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reporting.ts
git commit -m "Extract the stored-day walk; totalsByTag reads through it"
```

---

### Task 3: `tagHistory` — newest first, one row per day per week

**Files:**
- Modify: `src/lib/reporting.ts`
- Test: `src/test/tag-history.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/test/tag-history.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createEmptyWeek, WeekData } from "@/lib/planner-data";
import { tagHistory } from "@/lib/reporting";

/**
 * The third reader of raw stored weeks, so the same rule applies: weeks arrive
 * unrepaired and every field access defends itself.
 *
 * The load-bearing case here is that a row displays the day's own date but
 * navigates by the entry key. They are different questions and this is the
 * first caller that asks both at once.
 */

const AUG24 = new Date(2026, 7, 24); // Monday of 2026-W35
const AUG17 = new Date(2026, 7, 17); // Monday of 2026-W34

/** Paint `blocks` ten-minute blocks of `colorId` into a day, from midnight. */
function paint(week: WeekData, dayIndex: number, colorId: number, blocks: number) {
  const day = week.days[dayIndex];
  let left = blocks;
  let hour = 0;
  while (left > 0) {
    for (let b = 0; b < 6 && left > 0; b++, left--) day.timeBlocks[hour][b] = colorId;
    hour++;
  }
}

const store = (key: string, week: unknown) =>
  localStorage.setItem(`planner-${key}`, JSON.stringify(week));

beforeEach(() => localStorage.clear());

describe("tagHistory", () => {
  it("returns the days a tag was painted, newest first", () => {
    const older = createEmptyWeek(AUG17);
    paint(older, 0, 1, 6); // Mon 17 Aug, an hour
    store("2026-W34", older);

    const newer = createEmptyWeek(AUG24);
    paint(newer, 0, 1, 3); // Mon 24 Aug, half an hour
    store("2026-W35", newer);

    expect(tagHistory(1).map((u) => u.date)).toEqual(["2026-08-24", "2026-08-17"]);
    expect(tagHistory(1).map((u) => u.minutes)).toEqual([30, 60]);
  });

  it("ignores days painted with a different tag", () => {
    const week = createEmptyWeek(AUG24);
    paint(week, 0, 1, 6);
    paint(week, 1, 2, 6);
    store("2026-W35", week);

    expect(tagHistory(2).map((u) => u.date)).toEqual(["2026-08-25"]);
  });

  it("counts a day where the tag is only on a priority row", () => {
    // No time was blocked, but the goal was on the day. 0m would be a lie
    // about the minutes; absence would be a lie about the day.
    const week = createEmptyWeek(AUG24);
    week.days[0].subjects[0] = { subject: "Thesis chapter 3", checked: false, colorId: 1 };
    store("2026-W35", week);

    expect(tagHistory(1)).toEqual([
      { weekKey: "2026-W35", date: "2026-08-24", monday: "2026-08-24", minutes: 0, onPriorities: true },
    ]);
  });

  it("gives one row for a day that is both painted and on a priority row", () => {
    // The day is the unit. The tag was used that day, once.
    const week = createEmptyWeek(AUG24);
    paint(week, 0, 1, 6);
    week.days[0].subjects[0] = { subject: "Thesis chapter 3", checked: false, colorId: 1 };
    store("2026-W35", week);

    expect(tagHistory(1)).toHaveLength(1);
    expect(tagHistory(1)[0].minutes).toBe(60);
    expect(tagHistory(1)[0].onPriorities).toBe(true);
  });

  it("survives a priority row saved before colorId existed", () => {
    // Rows load unflagged, and a damaged one may not be an object at all.
    const week = createEmptyWeek(AUG24);
    paint(week, 0, 1, 6);
    store("2026-W35", week);
    store("2026-W34", {
      days: [{ date: "2026-08-17", subjects: [{ subject: "no colorId" }, 7, null, "x"], timeBlocks: [] }],
    });

    expect(() => tagHistory(1)).not.toThrow();
    expect(tagHistory(1).map((u) => u.date)).toEqual(["2026-08-24"]);
  });

  it("skips a day with no readable date", () => {
    // The answer here is a date. A day that cannot state one has nothing to
    // put in the column, which is the deliberate divergence from search.
    store("2026-W35", {
      days: [
        { date: "not a date", subjects: [], timeBlocks: [[1, 1, 1, 1, 1, 1]] },
        { subjects: [], timeBlocks: [[1, 1, 1, 1, 1, 1]] },
      ],
    });

    expect(tagHistory(1)).toEqual([]);
  });

  it("survives a week damaged in every way at once, beside a healthy one", () => {
    // The failure mode that broke CSV export: days missing, a day that is a
    // string, timeBlocks that is not a grid, subjects that is not an array.
    store("2026-W29", { weekGoal: 42, days: "not an array" });
    store("2026-W34", {
      days: [{ date: "2026-08-17", timeBlocks: "not a grid", subjects: 9 }, "not a day", null],
    });
    const healthy = createEmptyWeek(AUG24);
    paint(healthy, 0, 1, 6);
    store("2026-W35", healthy);

    expect(() => tagHistory(1)).not.toThrow();
    expect(tagHistory(1).map((u) => u.date)).toEqual(["2026-08-24"]);
  });

  it("navigates by the entry key even when the key and the day dates disagree", () => {
    // The load-bearing case. This week is filed under W29 but carries August
    // dates. The row must SAY 24 August, because that is the day, and must GO
    // to 13 July, because that is the only Monday that opens the week the row
    // came from. Deriving the target from the dates would send the user to a
    // week that does not contain what they clicked.
    const misfiled = createEmptyWeek(AUG24);
    paint(misfiled, 0, 1, 6);
    store("2026-W29", misfiled);

    expect(tagHistory(1)).toEqual([
      { weekKey: "2026-W29", date: "2026-08-24", monday: "2026-07-13", minutes: 60, onPriorities: false },
    ]);
  });

  it("gives two rows when two stored weeks carry the same date", () => {
    // Merging them would add minutes belonging to two different weeks and then
    // have to pick one of the two to navigate to. Ordered by week key
    // descending, so the order is stable rather than incidental.
    const a = createEmptyWeek(AUG24);
    paint(a, 0, 1, 6);
    store("2026-W35", a);

    const b = createEmptyWeek(AUG24);
    paint(b, 0, 1, 3);
    store("2026-W29", b);

    expect(tagHistory(1).map((u) => u.weekKey)).toEqual(["2026-W35", "2026-W29"]);
    expect(tagHistory(1).map((u) => u.monday)).toEqual(["2026-08-24", "2026-07-13"]);
  });

  it("answers an unknown tag with an empty list rather than throwing", () => {
    // A question with no uses, not an error.
    const week = createEmptyWeek(AUG24);
    paint(week, 0, 1, 6);
    store("2026-W35", week);

    expect(tagHistory(0)).toEqual([]);
    expect(tagHistory(-1)).toEqual([]);
    expect(tagHistory(99)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/tag-history.test.ts`
Expected: FAIL — `tagHistory is not a function` / not exported from `@/lib/reporting`.

- [ ] **Step 3: Implement it**

Add to `src/lib/reporting.ts`. Import `mondayOfKey` alongside `loadAllWeeks`:

```ts
import { loadAllWeeks, mondayOfKey } from "./planner-data";
```

Then, after `totalsByTag`:

```ts
/** One day on which a tag was used. */
export interface TagUse {
  /** The week key the day was found under. Its identity, with the date. */
  weekKey: string;
  /** The day's own date. The fact, and what the row displays. */
  date: string;
  /** ISO Monday from the entry key. Where a click goes, and nothing else. */
  monday: string;
  /** Minutes painted against this tag that day. 0 when priority-only. */
  minutes: number;
  /** A priority row that day carries this tag. */
  onPriorities: boolean;
}

/**
 * Every day a tag was used, newest first, so the first row answers "when did I
 * last work on this".
 *
 * A day counts when time was painted against the tag or when one of its
 * priority rows carries it. Both are the goal being touched; only one of them
 * is time, which is why they are reported in separate fields and never added.
 *
 * **The unit is a day within a stored week, not a calendar date.** Two stored
 * weeks can carry the same date — that is the mis-filing `mondayOfKey` exists
 * to survive — and merging them would add minutes from two different weeks and
 * then have to pick one of the two to navigate to.
 *
 * **`date` comes from the day and `monday` from the key**, which are opposite
 * rules and both correct. The date is the fact, so it is what the row shows.
 * The key is what `loadWeek` is addressed by, so it is the only Monday that
 * opens the week the row came from.
 */
export function tagHistory(colorId: number): TagUse[] {
  if (!Number.isInteger(colorId) || colorId <= 0) return [];

  const uses: TagUse[] = [];

  for (const { weekKey, date, grid, subjects } of eachStoredDay()) {
    // The answer is a date; a day that cannot state one has nothing to show.
    if (!date) continue;
    const monday = mondayOfKey(weekKey);
    if (!monday) continue;

    let minutes = 0;
    for (const hour of grid) {
      if (!Array.isArray(hour)) continue;
      // Strict equality: a block stored as "1" is damage, not this tag.
      for (const block of hour) if (block === colorId) minutes += MINUTES_PER_BLOCK;
    }

    const onPriorities = subjects.some((row) => {
      if (!row || typeof row !== "object") return false;
      // colorId is optional: rows saved before the field existed load unflagged.
      return (row as Record<string, unknown>).colorId === colorId;
    });

    if (minutes === 0 && !onPriorities) continue;
    uses.push({ weekKey, date, monday, minutes, onPriorities });
  }

  // Newest first. Rows sharing a date are ordered by key, so two weeks holding
  // the same day come back in a stable order rather than storage order.
  return uses.sort(
    (a, b) => b.date.localeCompare(a.date) || b.weekKey.localeCompare(a.weekKey)
  );
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/test/tag-history.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Mutation-check the load-bearing test**

Temporarily swap the two fields in the pushed object so it reads `{ weekKey, date: monday, monday: date, ... }`.

Run: `npx vitest run src/test/tag-history.test.ts`
Expected: FAIL, specifically on "navigates by the entry key even when the key and the day dates disagree". If that test still passes, it is not defending the line it exists for — fix the test before going on.

Then revert the swap and re-run: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reporting.ts src/test/tag-history.test.ts
git commit -m "Add tagHistory: every day a tag was used, newest first"
```

---

### Task 4: `TagHistoryPanel`

The picker and the list. It takes `onJump` and knows nothing about dialogs, so it can be rendered anywhere later.

**Files:**
- Create: `src/components/planner/TagHistoryPanel.tsx`

- [ ] **Step 1: Write it**

There is no separate test step here: the panel is only reachable through the dialog, and Task 5 tests it there rather than mounting it twice. Create `src/components/planner/TagHistoryPanel.tsx`:

```tsx
import React from "react";
import { format, parse } from "date-fns";
import {
  BLOCK_COLORS,
  COLOR_IDS_IN_DISPLAY_ORDER,
  formatMinutes,
  getBlockColor,
  loadColorLabels,
} from "@/lib/planner-data";
import { TagUse, tagHistory } from "@/lib/reporting";

/** "Tue 19 Aug 2026" — the day, since that is the answer being given. */
const dayLabel = (iso: string) =>
  format(parse(iso, "yyyy-MM-dd", new Date()), "EEE d MMM yyyy");

/**
 * When a tag was last used, and every time before that.
 *
 * The tags are the user's goals, so this is "when did I last touch this goal".
 * It reads `timeBlocks` and priority rows and answers with dates, which is why
 * it is not part of text search: that reads prose and answers with passages.
 *
 * Every entry carries its **name** beside its swatch. Several pairs in this
 * palette are one colour to a deuteranope and all of them are grey in a mono
 * print, and the name is the thing being tracked.
 */
const TagHistoryPanel: React.FC<{ onJump: (monday: string) => void }> = ({ onJump }) => {
  const labels = React.useMemo(() => loadColorLabels(), []);
  const [colorId, setColorId] = React.useState<number | null>(null);

  // Recomputed on selection rather than held: weeks may have changed since the
  // dialog was last opened, including from another tab.
  const uses = React.useMemo<TagUse[]>(
    () => (colorId === null ? [] : tagHistory(colorId)),
    [colorId]
  );

  const nameOf = (id: number) => labels[id] || BLOCK_COLORS[id - 1]?.label || `Tag ${id}`;

  return (
    <>
      <ul className="flex flex-wrap gap-1">
        {COLOR_IDS_IN_DISPLAY_ORDER.map((id) => (
          <li key={id}>
            <button
              type="button"
              aria-pressed={colorId === id}
              onClick={() => setColorId(id)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] transition-colors ${
                colorId === id
                  ? "border-foreground/40 bg-muted/60 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm border border-border/50 shrink-0"
                style={{ backgroundColor: getBlockColor(id) ?? undefined }}
              />
              {nameOf(id)}
            </button>
          </li>
        ))}
      </ul>

      <div className="max-h-80 overflow-y-auto -mx-1 px-1">
        {colorId === null ? (
          <p className="text-xs text-muted-foreground py-2">Pick a tag.</p>
        ) : uses.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No time blocked or priorities tagged {nameOf(colorId)}.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {uses.map((u) => (
              <li key={`${u.weekKey}-${u.date}`}>
                <button
                  type="button"
                  onClick={() => onJump(u.monday)}
                  className="w-full flex items-baseline justify-between gap-3 text-left px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm text-foreground">{dayLabel(u.date)}</span>
                  {/* A priority row carries no minutes, and 0m would be a lie
                      about the time rather than a statement about the day. */}
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {u.minutes > 0 ? formatMinutes(u.minutes) : "on priorities"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};

export default TagHistoryPanel;
```

- [ ] **Step 2: Check it compiles**

Run: `npm run build`
Expected: clean. It is not rendered by anything yet, so nothing changes on screen.

- [ ] **Step 3: Commit**

```bash
git add src/components/planner/TagHistoryPanel.tsx
git commit -m "Add TagHistoryPanel: tag picker and the days it was used"
```

---

### Task 5: Give `SearchDialog` a mode

**Files:**
- Modify: `src/components/planner/SearchDialog.tsx`
- Test: `src/test/tag-history-dialog.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/test/tag-history-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SearchDialog from "@/components/planner/SearchDialog";
import { createEmptyWeek } from "@/lib/planner-data";

const AUG = new Date(2026, 7, 26); // Wed 26 Aug 2026, week 2026-W35

function seed() {
  const week = createEmptyWeek(AUG);
  // Six ten-minute blocks on Monday 24 Aug = an hour of tag 1.
  for (let b = 0; b < 6; b++) week.days[0].timeBlocks[0][b] = 1;
  localStorage.setItem("planner-2026-W35", JSON.stringify(week));
  localStorage.setItem("planner-color-labels", JSON.stringify({ 1: "Thesis", 2: "Admin" }));
}

const open = (onJump = vi.fn()) => {
  render(<SearchDialog onJump={onJump} />);
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
  return onJump;
};

const toTagMode = () => fireEvent.click(screen.getByRole("button", { name: "Tag" }));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("the tag mode of the find dialog", () => {
  it("swaps the text box for the tag picker", () => {
    seed();
    open();

    expect(screen.getByRole("textbox", { name: /search/i })).toBeInTheDocument();
    toTagMode();

    expect(screen.queryByRole("textbox", { name: /search/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Thesis/ })).toBeInTheDocument();
  });

  it("lists the days a tag was used, with the time blocked against it", () => {
    seed();
    open();
    toTagMode();

    fireEvent.click(screen.getByRole("button", { name: /Thesis/ }));

    expect(screen.getByText(/Mon 24 Aug 2026/)).toBeInTheDocument();
    expect(screen.getByText("1h")).toBeInTheDocument();
  });

  it("jumps to the week the day belongs to", () => {
    seed();
    const onJump = open();
    toTagMode();

    fireEvent.click(screen.getByRole("button", { name: /Thesis/ }));
    fireEvent.click(screen.getByRole("button", { name: /Mon 24 Aug 2026/ }));

    expect(onJump).toHaveBeenCalledWith("2026-08-24");
  });

  it("names the tag when it has never been used, rather than saying nothing", () => {
    // "No results" would leave the user unsure which tag was even asked about.
    seed();
    open();
    toTagMode();

    fireEvent.click(screen.getByRole("button", { name: /Admin/ }));

    expect(screen.getByText(/tagged Admin/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/tag-history-dialog.test.tsx`
Expected: FAIL — no button named "Tag"; `getByRole` reports it cannot find it.

- [ ] **Step 3: Add the mode**

In `src/components/planner/SearchDialog.tsx`, add the import:

```tsx
import TagHistoryPanel from "./TagHistoryPanel";
```

Add the mode state beside the existing state:

```tsx
const [mode, setMode] = useState<"text" | "tag">("text");
```

Narrow the existing `matches` memo so text search does not run while the tag panel is showing:

```tsx
const matches = useMemo<SearchMatch[]>(
  () => (open && mode === "text" ? searchWeeks(query) : []),
  [query, open, mode]
);
```

Replace the `DialogHeader` and add the toggle above the input:

```tsx
<DialogHeader>
  <DialogTitle className="text-sm">Find</DialogTitle>
  <DialogDescription className="text-xs">
    {mode === "text"
      ? "Goals, reviews, weekly actions, priorities and memos."
      : "When you last used a tag, and every time before that."}
  </DialogDescription>
</DialogHeader>

{/* aria-pressed rather than a tabs primitive: two options, and this is the
    idiom the legend cell already uses for an armed state. */}
<div className="flex gap-1">
  {(["text", "tag"] as const).map((m) => (
    <button
      key={m}
      type="button"
      aria-pressed={mode === m}
      onClick={() => setMode(m)}
      className={`px-2 py-1 rounded border text-[11px] transition-colors ${
        mode === m
          ? "border-foreground/40 bg-muted/60 text-foreground"
          : "border-border text-muted-foreground hover:bg-muted/40"
      }`}
    >
      {m === "text" ? "Text" : "Tag"}
    </button>
  ))}
</div>
```

Then wrap the existing input and result list so they render only in text mode, with the panel as the alternative. The input, the `tooShort` branch and the results `div` are unchanged — they move inside the conditional as they stand:

```tsx
{mode === "text" ? (
  <>
    {/* the existing <input> and the existing results <div>, unchanged */}
  </>
) : (
  <TagHistoryPanel onJump={jump} />
)}
```

Leave `jump`, the trigger's `aria-label="Search all weeks"` and the input's `aria-label` exactly as they are. The existing search tests find both by `/search/i`, and text is the default mode, so they keep passing untouched.

- [ ] **Step 4: Run the new tests**

Run: `npx vitest run src/test/tag-history-dialog.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Confirm search did not move**

Run: `npx vitest run src/test/search-dialog.test.tsx src/test/search.test.ts`
Expected: PASS, 17 tests, neither file edited.

- [ ] **Step 6: Commit**

```bash
git add src/components/planner/SearchDialog.tsx src/test/tag-history-dialog.test.tsx
git commit -m "Give the find dialog a tag mode"
```

---

### Task 6: Look at it, then write down what shipped

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run everything**

```bash
npm test && npm run lint && npm run build
```

Expected: 411 tests across 40 files; lint 0 errors and the same 10 pre-existing warnings; build clean. If the test count differs because a test was split or merged during implementation, use the number `npm test` actually reports — the point is that the recorded baseline matches reality, not that it matches this plan.

- [ ] **Step 2: Look at it in a browser**

Run: `npm run dev`, then open `http://localhost:8080/Daily-Log/`.

jsdom sees no colour and no layout, so check by eye: the twelve swatches read as twelve distinct entries with their names; the mode toggle shows which mode is active; a long list scrolls inside the dialog rather than growing it; the date and the duration do not collide at the dialog's width; and it is legible in both light and dark.

Paint some blocks against a tag, then use Tag mode to find that day and click it — confirm it lands on the right week.

- [ ] **Step 3: Update the Baselines section**

In `CLAUDE.md`, under **Baselines**, change `394 tests across 38 files` to the number from Step 1.

- [ ] **Step 4: Replace backlog item 2**

Delete the `### 2. Find when you last used a tag` block. Renumber items 3 and 4 to 2 and 3, and update the sentence under "Pick up here next" that says "the four numbered items below" to say three.

Add a section in the body of `CLAUDE.md`, after "Search reads raw, and navigates by key", since it is the counterpart to it:

```markdown
## Tag history shows the day and navigates by the key

`tagHistory` is the first caller to need both date rules at once, and they are
opposites. A row **displays** `day.date`, because the date is the fact and that
is the question being answered. It **navigates** by `mondayOfKey(weekKey)`,
because `loadWeek` is key-addressed and that is the only Monday that opens the
week the row came from. `mondayOfKey` moved to `planner-data.ts` so it could sit
beside `weekKeyForStoredWeek`, the rule it is the opposite of.

A day with no readable date is skipped, which is a deliberate divergence from
search: a week too damaged to state its dates stays searchable, because a text
match can navigate by key alone, but it has no tag history, because here the
answer *is* a date.

**The unit is a day within a stored week, not a calendar date.** Two stored
weeks carrying the same date give two rows. Merging them would add minutes from
two different weeks and then have to pick one of the two to navigate to.

Blocked time and tagged priority rows are both uses and are never added
together — `minutes` and `onPriorities` are separate fields for the same reason
the month report says "blocked" rather than "spent".

`totalsByTag` and `tagHistory` read through one `eachStoredDay` iterator in
`reporting.ts`, which is where the unrepaired-week defending lives.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "Record tag history in the working notes; update baselines"
```

- [ ] **Step 6: Stop and ask**

Do not merge. Push the branch if the user wants it pushed, and ask them whether to open a PR or merge — pushing `main` deploys, and merging is the user's call.

---

## Self-review

**Spec coverage:** answer shape (Task 3, first test); blocks and priority rows counted separately (Task 3); one row per day per week, and two rows for a duplicated date (Task 3); surface as a second dialog mode (Task 5); display-date versus navigation-key (Tasks 1 and 3); undated days skipped (Task 3); no cap (Task 4, the list scrolls); picker with swatch and name (Task 4); shared walk with `totalsByTag`'s tests untouched (Task 2); unknown `colorId` (Task 3); empty state naming the tag (Tasks 4 and 5); mutation pass (Task 3, Step 5); browser pass and `CLAUDE.md` (Task 6).

**Types:** `TagUse` gains `weekKey` beyond the four fields in the spec's sketch — it is needed for the documented `weekKey`-descending tie-break and serves as the row's React key. The spec's prose already requires the tie-break; this records where the field comes from.

**Naming:** `tagHistory`, `TagUse`, `eachStoredDay`, `mondayOfKey`, `TagHistoryPanel` are used identically in every task.
