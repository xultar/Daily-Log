# Week Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A toolbar button copies the shape of the most recent painted week into the week being viewed, filling only empty slots.

**Architecture:** A new `src/lib/week-template.ts`, sibling to `carry-source.ts`. A single internal `fillDay` does the copying and returns both the new day and the counts of what it did; `applyTemplate` takes the day, `previewTemplate` sums the counts. That is one implementation of the rules rather than two, so the dialog cannot drift from the result. `TemplateDialog` shows the counts and calls back into `StudyPlanner`, which writes with the updater form.

**Tech Stack:** TypeScript, React 18, Vite, vitest + @testing-library/react, date-fns, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-26-week-template-design.md`

**Branch:** `week-template`, already created off a clean `main`.

**Baseline before starting:** `npm test` 411 tests across 40 files, `npm run lint` 0 errors and 10 warnings, `npm run build` clean. Confirm before Task 1 and do not proceed if it differs.

---

## Deviation from the spec, applied deliberately

The spec describes `previewTemplate` and `applyTemplate` as separate implementations whose agreement is guarded by a test, and lists that drift as the feature's main risk. This plan removes the risk instead: `fillDay` returns `{ day, blocksToFill, blocksKept, rowsToFill, rowsDropped }`, and both public functions are thin wrappers over it. The diff-based test is still written, now as a cheap guard rather than the only defence.

## A landmine to avoid

`src/test/carry-bar.test.tsx` locates the week-navigation chevrons positionally:

```tsx
fireEvent.click(container.querySelectorAll("button")[0]); // previous week
fireEvent.click(container.querySelectorAll("button")[1]); // next week
```

The new toolbar button **must** be rendered beside `SearchDialog` (`StudyPlanner.tsx:299`), which sits well after those chevrons. Inserting it earlier in the toolbar renumbers every button and breaks tests in a file unrelated to this feature.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/week-template.ts` | New. The backwards scan, the copy rules, and the counts. Knows nothing about React. |
| `src/components/planner/TemplateDialog.tsx` | New. The trigger, the counts, the three states. Knows nothing about how a week is stored. |
| `src/components/planner/StudyPlanner.tsx` | Adds `applyWeekTemplate` and renders the dialog beside `SearchDialog`. |
| `src/test/template-source.test.ts` | New. The backwards scan. |
| `src/test/week-template.test.ts` | New. The copy rules and the counts. |
| `src/test/template-dialog.test.tsx` | New. The dialog, plus the navigate-then-apply trap through `StudyPlanner`. |
| `CLAUDE.md`, `docs/design-notes.md` | Baselines; backlog item 1 replaced by what shipped. |

---

### Task 1: `findTemplateSource`

**Files:**
- Create: `src/lib/week-template.ts`
- Test: `src/test/template-source.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/template-source.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { startOfWeek, subWeeks } from "date-fns";
import { createEmptyWeek, saveWeek, WeekData } from "@/lib/planner-data";
import { findTemplateSource } from "@/lib/week-template";

/**
 * The same backwards scan as findCarrySource, with one different question.
 * An existing-but-blank week is a perfectly good carry source and a useless
 * template, so this looks for paint rather than for existence.
 */

const NOW = new Date(2026, 7, 26); // Wed 26 Aug 2026
const thisMonday = () => startOfWeek(NOW, { weekStartsOn: 1 }); // 2026-08-24

/** A week with an hour painted on its Monday. */
function painted(monday: Date): WeekData {
  const w = createEmptyWeek(monday);
  for (let b = 0; b < 6; b++) w.days[0].timeBlocks[0][b] = 1;
  return w;
}

beforeEach(() => localStorage.clear());

describe("findTemplateSource", () => {
  it("returns the most recent week with something painted", () => {
    const one = subWeeks(thisMonday(), 1);
    saveWeek(one, painted(one));

    expect(findTemplateSource(NOW)?.monday).toBe("2026-08-17");
  });

  it("skips a week that is stored but has nothing painted", () => {
    // A blank week is not a schedule. This is the whole difference from
    // findCarrySource, which would stop at the blank one.
    const one = subWeeks(thisMonday(), 1);
    const two = subWeeks(thisMonday(), 2);
    saveWeek(one, createEmptyWeek(one));
    saveWeek(two, painted(two));

    expect(findTemplateSource(NOW)?.monday).toBe("2026-08-10");
  });

  it("gives up after four weeks rather than becoming an archaeology tool", () => {
    const five = subWeeks(thisMonday(), 5);
    saveWeek(five, painted(five));

    expect(findTemplateSource(NOW)).toBeNull();
  });

  it("returns null when nothing is stored", () => {
    expect(findTemplateSource(NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/test/template-source.test.ts`
Expected: FAIL — cannot resolve `@/lib/week-template`.

- [ ] **Step 3: Create the module**

Create `src/lib/week-template.ts`:

```ts
import { startOfWeek, subWeeks, format } from "date-fns";
import { WeekData, hasStoredWeek, loadWeek } from "./planner-data";

/** How far back the scan will look before giving up. */
const MAX_WEEKS_BACK = 4;

export interface TemplateSource {
  /** Repaired, via loadWeek. */
  week: WeekData;
  /** ISO Monday of that week, for the dialog's label. */
  monday: string;
}

/** Whether a week is a schedule rather than merely an entry in storage. */
function hasPaintedBlock(week: WeekData): boolean {
  return week.days.some((day) => day.timeBlocks.some((hour) => hour.some((b) => b > 0)));
}

/**
 * The week to copy a shape from: the most recent stored week with something
 * painted in it, scanning back from the previous week.
 *
 * This is `findCarrySource`'s loop asking a different question. That one stops
 * at the most recent week that *exists*, because an empty week can still be
 * carried from — there is simply nothing in it. Here an empty week is useless:
 * a template with no paint copies nothing.
 *
 * Four weeks is enough to cross a normal break without turning a dormant
 * planner into an archaeology tool.
 *
 * Never writes planner data.
 */
export function findTemplateSource(currentWeekDate: Date): TemplateSource | null {
  const thisMonday = startOfWeek(currentWeekDate, { weekStartsOn: 1 });
  for (let back = 1; back <= MAX_WEEKS_BACK; back++) {
    const monday = subWeeks(thisMonday, back);
    if (!hasStoredWeek(monday)) continue;
    const week = loadWeek(monday);
    if (!hasPaintedBlock(week)) continue;
    return { week, monday: format(monday, "yyyy-MM-dd") };
  }
  return null;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/test/template-source.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/week-template.ts src/test/template-source.test.ts
git commit -m "Add findTemplateSource: the most recent painted week"
```

---

### Task 2: `applyTemplate` — the painted grid

**Files:**
- Modify: `src/lib/week-template.ts`
- Test: `src/test/week-template.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/week-template.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { startOfWeek, subWeeks } from "date-fns";
import { createEmptyWeek, WeekData } from "@/lib/planner-data";
import { applyTemplate } from "@/lib/week-template";

/**
 * Copying fills empty slots and never overwrites, so nothing the user wrote
 * can be lost. Days map by index — the template's Monday is this week's
 * Monday, and the dates differ by definition.
 */

const NOW = new Date(2026, 7, 26);
const TARGET_MONDAY = startOfWeek(NOW, { weekStartsOn: 1 }); // 2026-08-24
const SOURCE_MONDAY = subWeeks(TARGET_MONDAY, 1); // 2026-08-17

/** Paint one ten-minute block. */
const paint = (w: WeekData, day: number, hour: number, block: number, colorId: number) => {
  w.days[day].timeBlocks[hour][block] = colorId;
};

describe("applyTemplate — the grid", () => {
  it("copies a painted block into an empty slot", () => {
    const source = createEmptyWeek(SOURCE_MONDAY);
    paint(source, 0, 3, 2, 5);

    const result = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);

    expect(result.days[0].timeBlocks[3][2]).toBe(5);
  });

  it("never overwrites a block the user has already painted", () => {
    const source = createEmptyWeek(SOURCE_MONDAY);
    paint(source, 0, 3, 2, 5);
    const target = createEmptyWeek(TARGET_MONDAY);
    paint(target, 0, 3, 2, 9);

    const result = applyTemplate(target, source);

    expect(result.days[0].timeBlocks[3][2]).toBe(9);
  });

  it("maps days by index, not by date", () => {
    // The load-bearing case: the two weeks carry different dates by
    // definition, so anything matching on date would copy nothing at all.
    const source = createEmptyWeek(SOURCE_MONDAY);
    paint(source, 4, 0, 0, 7); // the source's Friday

    const result = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);

    expect(result.days[4].timeBlocks[0][0]).toBe(7); // the target's Friday
    expect(result.days[4].date).toBe("2026-08-28"); // still the target's date
  });

  it("mutates neither the target nor the source", () => {
    // Carry-forward's first rule: the source week genuinely happened the way
    // it happened, and applying a template must leave that record true.
    const source = createEmptyWeek(SOURCE_MONDAY);
    paint(source, 0, 3, 2, 5);
    const target = createEmptyWeek(TARGET_MONDAY);
    const sourceBefore = JSON.stringify(source);
    const targetBefore = JSON.stringify(target);

    applyTemplate(target, source);

    expect(JSON.stringify(source)).toBe(sourceBefore);
    expect(JSON.stringify(target)).toBe(targetBefore);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/week-template.test.ts`
Expected: FAIL — `applyTemplate is not a function`.

- [ ] **Step 3: Add `fillDay` and `applyTemplate`**

Append to `src/lib/week-template.ts`, and extend the import to bring in `DayData`:

```ts
import { DayData, WeekData, hasStoredWeek, loadWeek } from "./planner-data";
```

```ts
/** What applying would do, computed without doing it. */
export interface TemplatePreview {
  /** Empty here, painted there. */
  blocksToFill: number;
  /** Painted here and there — the user's paint wins. */
  blocksKept: number;
  /** Source rows that will land. */
  rowsToFill: number;
  /** Source rows that will not: duplicate text, or no blank row left. */
  rowsDropped: number;
}

/** A filled day, and what filling it did. */
interface DayFill extends TemplatePreview {
  day: DayData;
}

/**
 * Fill one day's empty slots from another day, reporting what it did.
 *
 * **The counts come from the same pass that does the work**, so the preview
 * shown in the dialog cannot disagree with the result. Two implementations of
 * these rules would be free to drift, and a preview that lies is worse than no
 * preview at all.
 *
 * Both days must already have been through `repairWeek` — this does not guard
 * against a missing grid.
 */
function fillDay(target: DayData, source: DayData): DayFill {
  let blocksToFill = 0;
  let blocksKept = 0;

  const timeBlocks = target.timeBlocks.map((hour, h) =>
    hour.map((block, b) => {
      const from = source.timeBlocks[h]?.[b] ?? 0;
      if (from <= 0) return block;
      if (block === 0) {
        blocksToFill++;
        return from;
      }
      blocksKept++;
      return block;
    })
  );

  return {
    day: { ...target, timeBlocks },
    blocksToFill,
    blocksKept,
    rowsToFill: 0,
    rowsDropped: 0,
  };
}

/**
 * Copy a week's shape into another week, returning a new week.
 *
 * Only empty slots are filled, so nothing the user has written can be lost —
 * which is what lets the dialog be a preview rather than a warning.
 *
 * Days map by index. The template's Monday is this week's Monday; matching on
 * the date would copy nothing, because the two weeks carry different dates by
 * definition.
 *
 * Applying twice is a no-op, and falls out of the rules rather than being
 * enforced: after the first pass there are no empty slots left to fill.
 *
 * `memo`, `weekGoal`, `weekReview`, `weeklyTodos` and `carryResolved` are the
 * target's own. Those record a particular week rather than a repeating shape.
 */
export function applyTemplate(target: WeekData, source: WeekData): WeekData {
  return {
    ...target,
    days: target.days.map((day, i) => {
      const from = source.days[i];
      return from ? fillDay(day, from).day : day;
    }),
  };
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/test/week-template.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/week-template.ts src/test/week-template.test.ts
git commit -m "Add applyTemplate: fill empty blocks from another week"
```

---

### Task 3: the priority rows

**Files:**
- Modify: `src/lib/week-template.ts`
- Test: `src/test/week-template.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/test/week-template.test.ts`:

```ts
describe("applyTemplate — the priority rows", () => {
  it("lands a row in the first blank row, compacting rather than by position", () => {
    // Matches applyCarryForward, which fills a blank before appending.
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].subjects[3] = { subject: "Teaching", checked: false };
    const target = createEmptyWeek(TARGET_MONDAY);

    const result = applyTemplate(target, source);

    expect(result.days[0].subjects[0].subject).toBe("Teaching");
    expect(result.days[0].subjects[3].subject).toBe("");
  });

  it("keeps source order when several rows land", () => {
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].subjects[1] = { subject: "Teaching", checked: false };
    source.days[0].subjects[4] = { subject: "Supervision", checked: false };

    const result = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);

    expect(result.days[0].subjects.map((r) => r.subject).slice(0, 2)).toEqual([
      "Teaching",
      "Supervision",
    ]);
  });

  it("lands a row unchecked and keeps its colour tag", () => {
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].subjects[0] = { subject: "Teaching", checked: true, colorId: 3 };

    const result = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);

    expect(result.days[0].subjects[0]).toEqual({
      subject: "Teaching",
      checked: false,
      colorId: 3,
    });
  });

  it("never copies flagged or origin", () => {
    // flagged is the user saying "this one matters THIS week"; origin drives
    // the age marker, and a templated row is new work rather than a commitment
    // that has been slipping. Stamping it would render "1w" on a fresh row.
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].subjects[0] = {
      subject: "Teaching",
      checked: false,
      flagged: true,
      origin: "2026-08-10",
    };

    const result = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);

    expect(result.days[0].subjects[0].flagged).toBeUndefined();
    expect(result.days[0].subjects[0].origin).toBeUndefined();
  });

  it("lands a row with no colour tag without writing the field", () => {
    // colorId is optional, and rows saved before it existed load unflagged.
    // Writing undefined into the field is what repairSubject exists to stop.
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].subjects[0] = { subject: "Teaching", checked: false };

    const result = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);

    expect("colorId" in result.days[0].subjects[0]).toBe(false);
  });

  it("does not land a row whose text is already in that day", () => {
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].subjects[0] = { subject: "Teaching", checked: false };
    const target = createEmptyWeek(TARGET_MONDAY);
    target.days[0].subjects[2] = { subject: "Teaching", checked: false };

    const result = applyTemplate(target, source);

    expect(result.days[0].subjects.filter((r) => r.subject === "Teaching")).toHaveLength(1);
  });

  it("lands text listed twice in the source only once", () => {
    // The duplicate check must see rows landed earlier in the same pass, not
    // only the rows the target started with.
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].subjects[0] = { subject: "Teaching", checked: false };
    source.days[0].subjects[1] = { subject: "Teaching", checked: false };

    const result = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);

    expect(result.days[0].subjects.filter((r) => r.subject === "Teaching")).toHaveLength(1);
  });

  it("drops what will not fit when the day has no blank row left", () => {
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].subjects[0] = { subject: "Teaching", checked: false };
    const target = createEmptyWeek(TARGET_MONDAY);
    target.days[0].subjects = target.days[0].subjects.map((_, i) => ({
      subject: `Mine ${i}`,
      checked: false,
    }));

    const result = applyTemplate(target, source);

    expect(result.days[0].subjects.map((r) => r.subject)).toEqual([
      "Mine 0", "Mine 1", "Mine 2", "Mine 3", "Mine 4", "Mine 5",
    ]);
  });

  it("leaves memos, the goal, the review, weekly actions and carryResolved alone", () => {
    const source = createEmptyWeek(SOURCE_MONDAY);
    source.days[0].memo = "Source memo";
    source.weekGoal = "Source goal";
    source.weekReview = "Source review";
    source.weeklyTodos[0] = { text: "Source action", checked: false };
    paint(source, 0, 0, 0, 1);

    const target = createEmptyWeek(TARGET_MONDAY);
    target.weekGoal = "My goal";
    target.carryResolved = true;

    const result = applyTemplate(target, source);

    expect(result.days[0].memo).toBe("");
    expect(result.weekGoal).toBe("My goal");
    expect(result.weekReview).toBe("");
    expect(result.weeklyTodos.every((t) => t.text === "")).toBe(true);
    expect(result.carryResolved).toBe(true);
  });

  it("changes nothing the second time it is applied", () => {
    // Emergent rather than enforced: after the first pass there are no empty
    // slots left to fill. Tested because emergent properties are the ones a
    // later change breaks without noticing.
    const source = createEmptyWeek(SOURCE_MONDAY);
    paint(source, 0, 3, 2, 5);
    source.days[0].subjects[0] = { subject: "Teaching", checked: false };

    const once = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);
    const twice = applyTemplate(once, source);

    expect(twice).toEqual(once);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/week-template.test.ts -t "priority rows"`
Expected: FAIL — rows are not copied at all, so the first assertion finds `""`.

- [ ] **Step 3: Fill the rows in `fillDay`**

Replace the body of `fillDay` in `src/lib/week-template.ts`:

```ts
function fillDay(target: DayData, source: DayData): DayFill {
  let blocksToFill = 0;
  let blocksKept = 0;

  const timeBlocks = target.timeBlocks.map((hour, h) =>
    hour.map((block, b) => {
      const from = source.timeBlocks[h]?.[b] ?? 0;
      if (from <= 0) return block;
      if (block === 0) {
        blocksToFill++;
        return from;
      }
      blocksKept++;
      return block;
    })
  );

  let rowsToFill = 0;
  let rowsDropped = 0;

  const subjects = target.subjects.map((r) => ({ ...r }));
  // Seeded from the target's own rows, then added to as rows land, so text
  // listed twice in the source arrives once.
  const present = new Set(subjects.map((r) => r.subject.trim()).filter((t) => t !== ""));

  for (const from of source.subjects) {
    const text = from.subject.trim();
    if (text === "") continue;
    if (present.has(text)) {
      rowsDropped++;
      continue;
    }
    const blank = subjects.findIndex((r) => r.subject.trim() === "");
    // Counted rather than broken out of, so the number is right for every
    // remaining row instead of only the first one that could not land.
    if (blank === -1) {
      rowsDropped++;
      continue;
    }
    present.add(text);
    rowsToFill++;
    // colorId is optional. Writing the key as undefined is exactly what
    // repairSubject exists to prevent, so the field is omitted instead.
    subjects[blank] =
      from.colorId === undefined
        ? { subject: text, checked: false }
        : { subject: text, checked: false, colorId: from.colorId };
  }

  return {
    day: { ...target, timeBlocks, subjects },
    blocksToFill,
    blocksKept,
    rowsToFill,
    rowsDropped,
  };
}
```

- [ ] **Step 4: Run the whole file**

Run: `npx vitest run src/test/week-template.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/week-template.ts src/test/week-template.test.ts
git commit -m "Template the priority rows, compacting into blank rows"
```

---

### Task 4: `previewTemplate`

**Files:**
- Modify: `src/lib/week-template.ts`
- Test: `src/test/week-template.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/test/week-template.test.ts`:

```ts
describe("previewTemplate", () => {
  it("counts exactly what applying actually changes", () => {
    // The dialog acts on these numbers. previewTemplate and applyTemplate are
    // wrappers over one pass so they cannot drift, and this proves the wiring
    // rather than trusting it.
    const source = createEmptyWeek(SOURCE_MONDAY);
    paint(source, 0, 0, 0, 1);
    paint(source, 0, 0, 1, 1);
    paint(source, 1, 5, 3, 2);
    source.days[0].subjects[0] = { subject: "Teaching", checked: false };
    source.days[1].subjects[0] = { subject: "Supervision", checked: false };

    const target = createEmptyWeek(TARGET_MONDAY);
    paint(target, 0, 0, 1, 9); // one collision
    target.days[1].subjects[0] = { subject: "Supervision", checked: false }; // one duplicate

    const preview = previewTemplate(target, source);
    const after = applyTemplate(target, source);

    let blocksChanged = 0;
    let rowsChanged = 0;
    target.days.forEach((day, i) => {
      day.timeBlocks.forEach((hour, h) =>
        hour.forEach((block, b) => {
          if (block !== after.days[i].timeBlocks[h][b]) blocksChanged++;
        })
      );
      day.subjects.forEach((row, r) => {
        if (row.subject !== after.days[i].subjects[r].subject) rowsChanged++;
      });
    });

    expect(preview.blocksToFill).toBe(blocksChanged);
    expect(preview.rowsToFill).toBe(rowsChanged);
    expect(preview.blocksKept).toBe(1);
    expect(preview.rowsDropped).toBe(1);
  });

  it("reports nothing to do for a week that is already full of the template", () => {
    const source = createEmptyWeek(SOURCE_MONDAY);
    paint(source, 0, 0, 0, 1);

    const once = applyTemplate(createEmptyWeek(TARGET_MONDAY), source);

    expect(previewTemplate(once, source)).toEqual({
      blocksToFill: 0,
      blocksKept: 1,
      rowsToFill: 0,
      rowsDropped: 0,
    });
  });
});
```

Add `previewTemplate` to the import at the top of the file:

```ts
import { applyTemplate, previewTemplate } from "@/lib/week-template";
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/test/week-template.test.ts -t "previewTemplate"`
Expected: FAIL — `previewTemplate is not a function`.

- [ ] **Step 3: Implement it**

Append to `src/lib/week-template.ts`:

```ts
/**
 * What `applyTemplate` would do, without doing it.
 *
 * Runs the same `fillDay` pass and keeps the counts instead of the days, so
 * the numbers the dialog shows are the numbers applying will produce. There is
 * deliberately no second implementation of the rules here to drift from.
 */
export function previewTemplate(target: WeekData, source: WeekData): TemplatePreview {
  const total: TemplatePreview = {
    blocksToFill: 0,
    blocksKept: 0,
    rowsToFill: 0,
    rowsDropped: 0,
  };

  target.days.forEach((day, i) => {
    const from = source.days[i];
    if (!from) return;
    const filled = fillDay(day, from);
    total.blocksToFill += filled.blocksToFill;
    total.blocksKept += filled.blocksKept;
    total.rowsToFill += filled.rowsToFill;
    total.rowsDropped += filled.rowsDropped;
  });

  return total;
}
```

- [ ] **Step 4: Run the whole file**

Run: `npx vitest run src/test/week-template.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/week-template.ts src/test/week-template.test.ts
git commit -m "Add previewTemplate, counting from the same pass that copies"
```

---

### Task 5: `TemplateDialog`

**Files:**
- Create: `src/components/planner/TemplateDialog.tsx`

- [ ] **Step 1: Write it**

There is no separate test step here; Task 6 tests it through `StudyPlanner`, where the trap it has to survive actually lives. Create `src/components/planner/TemplateDialog.tsx`:

```tsx
import React, { useMemo, useState } from "react";
import { addDays, format, parse } from "date-fns";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { WeekData } from "@/lib/planner-data";
import { findTemplateSource, previewTemplate } from "@/lib/week-template";

/** "17 – 23 Aug 2026", from a Monday. */
function weekLabel(monday: string): string {
  const start = parse(monday, "yyyy-MM-dd", new Date());
  return `${format(start, "d")} – ${format(addDays(start, 6), "d MMM yyyy")}`;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * Copy the shape of the most recent painted week into the week on screen.
 *
 * The counts come from `previewTemplate`, which runs the same pass that
 * applying will run, so what this says is what will happen.
 *
 * Nothing here can overwrite: applying fills empty slots only. That is why
 * this is a preview rather than a warning, and why there is no undo.
 */
const TemplateDialog: React.FC<{
  week: WeekData;
  weekDate: Date;
  onApply: (source: WeekData) => void;
}> = ({ week, weekDate, onApply }) => {
  const [open, setOpen] = useState(false);

  // Computed when the dialog opens rather than held: weeks may have changed
  // since it was last closed, including from another tab.
  const source = useMemo(() => (open ? findTemplateSource(weekDate) : null), [open, weekDate]);
  const preview = useMemo(
    () => (open && source ? previewTemplate(week, source.week) : null),
    [open, source, week]
  );

  const nothingToDo = preview !== null && preview.blocksToFill === 0 && preview.rowsToFill === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Copy a week's shape">
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Copy a week's shape</DialogTitle>
          <DialogDescription className="text-xs">
            {source
              ? `From ${weekLabel(source.monday)}`
              : "Nothing to copy."}
          </DialogDescription>
        </DialogHeader>

        {!source ? (
          <p className="text-xs text-muted-foreground">
            No week in the last four has anything painted in it.
          </p>
        ) : nothingToDo ? (
          <p className="text-xs text-muted-foreground">
            Every slot this template would use already has something in it.
          </p>
        ) : (
          <dl className="text-xs text-muted-foreground flex flex-col gap-1">
            {/* Zero counts are omitted rather than shown, because "0 rows" is
                noise where the absence of the line says the same thing. */}
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-foreground">Will fill</dt>
              <dd>
                {[
                  preview.blocksToFill > 0 && plural(preview.blocksToFill, "empty block"),
                  preview.rowsToFill > 0 && plural(preview.rowsToFill, "empty row"),
                ]
                  .filter(Boolean)
                  .join(", ")}
              </dd>
            </div>
            {preview.blocksKept > 0 && (
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 text-foreground">Will keep</dt>
                <dd>{plural(preview.blocksKept, "painted block")} of yours</dd>
              </div>
            )}
            {preview.rowsDropped > 0 && (
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 text-foreground">Won't land</dt>
                <dd>{plural(preview.rowsDropped, "row")}</dd>
              </div>
            )}
          </dl>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!source || nothingToDo}
            onClick={() => {
              if (!source) return;
              onApply(source.week);
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateDialog;
```

- [ ] **Step 2: Check it compiles**

Run: `npm run build`
Expected: clean. Nothing renders it yet, so the app is unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/components/planner/TemplateDialog.tsx
git commit -m "Add TemplateDialog: the source week and what will land"
```

---

### Task 6: Wire it into `StudyPlanner`

**Files:**
- Modify: `src/components/planner/StudyPlanner.tsx`
- Test: `src/test/template-dialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/template-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { startOfWeek, subWeeks, addWeeks } from "date-fns";
import StudyPlanner from "@/components/planner/StudyPlanner";
import { createEmptyWeek, saveWeek, loadWeek, WeekData } from "@/lib/planner-data";

const NOW = new Date(2026, 7, 26); // Wed 26 Aug 2026
const thisMonday = () => startOfWeek(NOW, { weekStartsOn: 1 });

/** Let the autosave debounce elapse, matching carry-bar.test.tsx. */
const settle = async () => {
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
};

/** A painted week one week back, which is what findTemplateSource will find. */
function seedTemplateWeek(): WeekData {
  const monday = subWeeks(thisMonday(), 1);
  const w = createEmptyWeek(monday);
  for (let b = 0; b < 6; b++) w.days[0].timeBlocks[0][b] = 1;
  w.days[0].subjects[0] = { subject: "Teaching", checked: false };
  saveWeek(monday, w);
  return w;
}

const openDialog = () =>
  fireEvent.click(screen.getByRole("button", { name: /copy a week's shape/i }));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the template dialog", () => {
  it("names the week it would copy from", () => {
    seedTemplateWeek();
    render(<StudyPlanner />);
    openDialog();

    expect(screen.getByText(/17 – 23 Aug 2026/)).toBeInTheDocument();
  });

  it("says how much would land", () => {
    seedTemplateWeek();
    render(<StudyPlanner />);
    openDialog();

    expect(screen.getByText(/6 empty blocks/)).toBeInTheDocument();
    expect(screen.getByText(/1 empty row/)).toBeInTheDocument();
  });

  it("says so when there is no painted week behind this one", () => {
    render(<StudyPlanner />);
    openDialog();

    expect(screen.getByText(/no week in the last four/i)).toBeInTheDocument();
  });

  it("applies the shape to the week on screen", async () => {
    seedTemplateWeek();
    render(<StudyPlanner />);
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    await settle();

    const written = loadWeek(thisMonday());
    expect(written.days[0].timeBlocks[0][0]).toBe(1);
    expect(written.days[0].subjects[0].subject).toBe("Teaching");
  });

  it("leaves the source week untouched, because templating copies", async () => {
    seedTemplateWeek();
    render(<StudyPlanner />);
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    await settle();

    const source = loadWeek(subWeeks(thisMonday(), 1));
    expect(source.days[0].timeBlocks[0][0]).toBe(1);
    expect(source.days[0].subjects[0].subject).toBe("Teaching");
  });

  it("applies to the week on screen, not the week the planner opened on", async () => {
    // The documented bringForward trap, in a second place. applyWeekTemplate
    // is a useCallback with a stable dep, so its closure is built once at
    // mount. Closing over weekData instead of using the updater form captures
    // the mount-time week forever, and pressing Apply on another week writes
    // this week's contents under that week's key. Every other test here acts
    // on the mount week, so the closure is accidentally correct throughout and
    // nothing else would notice.
    seedTemplateWeek();
    const nextMonday = addWeeks(thisMonday(), 1);
    const next = createEmptyWeek(nextMonday);
    next.weekGoal = "Next week's own goal";
    saveWeek(nextMonday, next);

    const { container } = render(<StudyPlanner />);
    fireEvent.click(container.querySelectorAll("button")[1]); // next week
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    await settle();

    const written = loadWeek(nextMonday);
    expect(written.weekGoal).toBe("Next week's own goal");
    expect(written.days[0].timeBlocks[0][0]).toBe(1);

    // And this week, which was on screen at mount, got nothing.
    expect(loadWeek(thisMonday()).days[0].timeBlocks[0][0]).toBe(0);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/template-dialog.test.tsx`
Expected: FAIL — no button named "Copy a week's shape".

- [ ] **Step 3: Wire it up**

In `src/components/planner/StudyPlanner.tsx`, add the imports beside the existing `SearchDialog` import (line 10):

```tsx
import TemplateDialog from "./TemplateDialog";
import { applyTemplate } from "@/lib/week-template";
```

Add the callback immediately after `dismissCarry` (around line 178):

```tsx
/**
 * The updater form is load-bearing. This is a useCallback with a stable
 * dependency, so closing over weekData would capture the mount-time week and
 * write it under whatever week is on screen later — the bringForward trap.
 */
const applyWeekTemplate = useCallback((source: WeekData) => {
  markDirty();
  setWeekData((prev) => applyTemplate(prev, source));
}, [markDirty]);
```

Render it immediately **after** the closing tag of `<SearchDialog … />` (around line 303):

```tsx
<TemplateDialog week={weekData} weekDate={currentDate} onApply={applyWeekTemplate} />
```

**It must go here, not earlier in the toolbar.** `carry-bar.test.tsx` clicks the week chevrons as `container.querySelectorAll("button")[0]` and `[1]`; a button inserted before them renumbers everything and breaks that file.

If `WeekData` is not already imported in this file, add it to the existing `@/lib/planner-data` import.

- [ ] **Step 4: Run the new tests**

Run: `npx vitest run src/test/template-dialog.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Confirm nothing positional broke**

Run: `npx vitest run src/test/carry-bar.test.tsx src/test/today.test.tsx src/test/color-keys.test.tsx`
Expected: PASS, all three files unedited. A failure here means the button landed too early in the toolbar.

- [ ] **Step 6: Commit**

```bash
git add src/components/planner/StudyPlanner.tsx src/test/template-dialog.test.tsx
git commit -m "Wire the template dialog into the toolbar"
```

---

### Task 7: Look at it, then write down what shipped

**Files:**
- Modify: `CLAUDE.md`, `docs/design-notes.md`

- [ ] **Step 1: Run everything**

```bash
npm test && npm run lint && npm run build
```

Expected: 437 tests across 43 files; lint 0 errors and the same 10 pre-existing warnings; build clean. If the count differs because a test was split or merged, use the number `npm test` reports — the recorded baseline must match reality, not this plan.

- [ ] **Step 2: Mutation-check the two load-bearing tests**

Change the day mapping in `applyTemplate` from index to date:

```tsx
days: target.days.map((day) => {
  const from = source.days.find((d) => d.date === day.date);
  return from ? fillDay(day, from).day : day;
}),
```

Run: `npx vitest run src/test/week-template.test.ts`
Expected: FAIL on "maps days by index, not by date". Revert.

Then replace the updater form in `applyWeekTemplate` with a closure:

```tsx
setWeekData(applyTemplate(weekData, source));
```

Run: `npx vitest run src/test/template-dialog.test.tsx`
Expected: FAIL on "applies to the week on screen, not the week the planner opened on". Revert, and re-run both files to confirm green.

- [ ] **Step 3: Look at it in a browser**

Run `npm run dev`, open `http://localhost:8080/Daily-Log/`.

Paint a few hours in one week, move to the next week, paint one block somewhere the template also covers, then use the toolbar button. Check that the counts in the dialog match what actually lands, that your one block survives, that the copied blocks are the right colours in the right hours, and that the priority row text arrives unchecked. jsdom sees neither colour nor layout, so this is the only place those are verified.

- [ ] **Step 4: Update the baselines**

In `CLAUDE.md`, under **Baselines**, change `411 tests across 40 files` to the number from Step 1.

- [ ] **Step 5: Replace backlog item 1**

Delete the `### 1. Duplicate a day, or template a week` block. Renumber items 2 and 3 to 1 and 2, and change "the three numbered items below" to two.

Add a bullet to the condensed list in `CLAUDE.md`, after the carry-forward one:

```markdown
- **Templating fills empty slots and never overwrites**, which is what lets the
  dialog be a preview rather than a warning, and why there is no undo. Days map
  by index, not date. `previewTemplate` and `applyTemplate` are wrappers over
  one `fillDay` pass, so the counts cannot drift from the result.
```

Add the long-form section to `docs/design-notes.md`, immediately before `## A second tab reloads, or says so`:

```markdown
## Templating copies a shape, and only into empty slots

`applyTemplate` fills a block only when the target's is `0`, and lands a row
only in a blank row. Nothing the user wrote can be overwritten, and that single
safety property is what removes three features: the confirm dialog is a preview
rather than a warning, undo is unnecessary, and applying twice is a no-op that
falls out of the rules rather than being enforced.

**Days map by index, not by date.** The template's Monday is this week's
Monday. Matching on the date would copy nothing at all, because the two weeks
carry different dates by definition — which is why that test exists and why
mutating the mapping kills it and nothing else.

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
render "1w" on a row created seconds ago.

**`findTemplateSource` is `findCarrySource`'s loop asking a different
question.** Carry stops at the most recent week that *exists*; templating skips
to the most recent week with *paint*, because an empty week is a fine thing to
carry from and a useless thing to copy.

**`applyWeekTemplate` must keep the updater form**, for the reason
`bringForward` must. It is the same closure hazard in a second place, and it
has its own test because every other template test acts on the mount week.
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/design-notes.md
git commit -m "Record week templating in the working notes; update baselines"
```

- [ ] **Step 7: Stop and ask**

Do not merge. Pushing `main` deploys, and merging is the user's call.

---

## Self-review

**Spec coverage:** scope and payload (Tasks 2–3); fill-empty-only (Task 2, the never-overwrites test); compacting rows (Task 3); day mapping by index (Task 2); source predicate (Task 1); toolbar trigger and the three dialog states (Tasks 5–6); no `origin` stamp (Task 3); applying twice (Task 3); the preview counts (Task 4); the updater form (Task 6); mutation passes and browser pass (Task 7); notes and baselines (Task 7).

**Deviation recorded:** the spec's separate `previewTemplate` implementation is replaced by the shared `fillDay`, which removes the risk the spec listed as its largest. The diff-based test is kept.

**Types:** `TemplateSource`, `TemplatePreview`, `DayFill`, `fillDay`, `findTemplateSource`, `previewTemplate`, `applyTemplate`, `applyWeekTemplate` are used identically in every task. `TemplatePreview` is defined in Task 2 and consumed in Tasks 4 and 5; `DayFill` extends it so the counts have one definition.

**Test counts:** Task 1 adds 4, Task 2 adds 4, Task 3 adds 10, Task 4 adds 2, Task 6 adds 6 — 26 new tests across 3 new files, giving 437 across 43. If the real number differs because a test gets split or merged during implementation, record what `npm test` reports rather than this figure.
