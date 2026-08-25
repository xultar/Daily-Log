# Carry unfinished work forward implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a week opens with unfinished work behind it, offer a review bar that copies chosen items into this week's Weekly Actions, and show how long each carried item has been slipping.

**Architecture:** All the rules are pure functions in `planner-data.ts` — collect candidates from a week, apply a chosen subset to another — so they are testable without a DOM or storage. A thin `carry-forward.ts` does the storage-facing scan backwards through weeks. Carrying **copies**; the source week is never rewritten. An item's age is **derived** from `origin`, the Monday of the week it was first written in, so re-running a carry cannot inflate it.

**Tech Stack:** React 18, TypeScript (strict off), Vite, Tailwind, date-fns v3, Vitest with jsdom.

Spec: `docs/superpowers/specs/2026-08-25-carry-forward-design.md`

---

## The trap this whole feature walks into

`repairTodo` currently rebuilds a todo as a **complete literal**:

```ts
function repairTodo(value: unknown): TodoItem {
  const raw = asRecord(value);
  return { text: asText(raw.text), checked: raw.checked === true };
}
```

A field it does not list is dropped on the next load. There is no type error, because `tsconfig.app.json` sets `"strict": false` and the new field is optional. There is no failing test unless one exists for that field specifically.

If `origin` is dropped, **the feature still looks like it works**: items carry, the bar behaves, and only the age marker quietly reads zero forever. `repairSubject` and `repairWeek` have the same shape and the same exposure.

That is why Task 1 is the schema and its round-trip tests, before any feature code exists to distract from it.

## Vocabulary

- **origin** — the ISO date (`yyyy-MM-dd`) of the **Monday** of the week an item was first written in. Absent means the item originated in the week it is sitting in, so its age is zero.
- **age** — weeks elapsed between `origin` and the viewed week's Monday. Derived at render, never stored.
- **candidate** — an unfinished item eligible to carry: unchecked, non-empty after trimming, and either a Weekly Action or a **flagged** daily row.
- **source week** — the most recent week that exists in storage, scanning back up to four weeks from the previous week.

A promoted daily row becomes a `TodoItem`, so its `colorId` does not survive. That is a deliberate cost of having one landing place.

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/lib/planner-data.ts` | Schema, repair, carry rules, age | Modify |
| `src/lib/carry-forward.ts` | Scan storage backwards for the source week | Create |
| `src/components/planner/CarryForwardBar.tsx` | The review bar | Create |
| `src/components/planner/StudyPlanner.tsx` | Look up candidates, render the bar, apply the result | Modify |
| `src/components/planner/WeeklyTodoSidebar.tsx` | The age marker | Modify |
| `src/test/carry-schema.test.ts` | Round-trip tests for the new fields | Create |
| `src/test/carry-rules.test.ts` | collect / apply / age | Create |
| `src/test/carry-source.test.ts` | The backwards scan | Create |
| `src/test/carry-bar.test.tsx` | Bar behaviour and the no-write-on-open guarantee | Create |

---

## Task 1: Add the three fields, and make repair carry them

**Files:**
- Modify: `src/lib/planner-data.ts:4-7` (TodoItem), `:9-29` (SubjectRow), `:38-43` (WeekData), `:183-196` (repairSubject), `:214-217` (repairTodo), `:236-244` (repairWeek)
- Test: `src/test/carry-schema.test.ts` (create)

- [ ] **Step 1: Write the failing round-trip tests**

Create `src/test/carry-schema.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { saveWeek, loadWeek, createEmptyWeek, repairWeek } from "@/lib/planner-data";

const MONDAY = new Date(2026, 7, 24); // 2026-08-24, a Monday

beforeEach(() => localStorage.clear());

describe("origin survives a save and load", () => {
  it("keeps origin on a weekly todo", () => {
    const week = createEmptyWeek(MONDAY);
    week.weeklyTodos[0] = { text: "Book viva slot", checked: false, origin: "2026-08-10" };
    saveWeek(MONDAY, week);
    expect(loadWeek(MONDAY).weeklyTodos[0].origin).toBe("2026-08-10");
  });

  it("keeps origin, flagged and colorId together on a subject row", () => {
    // The combination, not each in isolation: repairSubject rebuilds a row from
    // a fixed list of fields, so a field missing from that list is dropped with
    // no type error and no failing test unless one names it.
    const week = createEmptyWeek(MONDAY);
    week.days[0].subjects[0] = {
      subject: "Lab report", checked: false, colorId: 3, flagged: true, origin: "2026-08-17",
    };
    saveWeek(MONDAY, week);
    const row = loadWeek(MONDAY).days[0].subjects[0];
    expect(row).toEqual({
      subject: "Lab report", checked: false, colorId: 3, flagged: true, origin: "2026-08-17",
    });
  });

  it("drops an origin that is not a valid ISO date, and still loads the item", () => {
    const repaired = repairWeek(
      { weeklyTodos: [{ text: "Keep me", checked: false, origin: "last tuesday" }] },
      MONDAY
    );
    expect(repaired.weeklyTodos[0].text).toBe("Keep me");
    expect(repaired.weeklyTodos[0].origin).toBeUndefined();
  });

  it("leaves origin absent rather than storing an empty string", () => {
    const repaired = repairWeek({ weeklyTodos: [{ text: "Fresh", checked: false }] }, MONDAY);
    expect("origin" in repaired.weeklyTodos[0]).toBe(false);
  });
});

describe("carryResolved survives a save and load", () => {
  it("round-trips when true", () => {
    const week = createEmptyWeek(MONDAY);
    week.carryResolved = true;
    saveWeek(MONDAY, week);
    expect(loadWeek(MONDAY).carryResolved).toBe(true);
  });

  it("stays absent rather than false when unset", () => {
    // Same convention as flagged: a week written before the field existed and a
    // week whose bar was never resolved must be identical on disk.
    const week = createEmptyWeek(MONDAY);
    saveWeek(MONDAY, week);
    expect("carryResolved" in loadWeek(MONDAY)).toBe(false);
  });

  it("ignores a non-boolean carryResolved", () => {
    expect(repairWeek({ carryResolved: "yes" }, MONDAY).carryResolved).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/carry-schema.test.ts`
Expected: FAIL — `origin` and `carryResolved` are dropped by the repair functions, so the round-trips return `undefined`.

- [ ] **Step 3: Add the fields to the interfaces**

In `src/lib/planner-data.ts`, extend `TodoItem`:

```ts
export interface TodoItem {
  text: string;
  checked: boolean;
  /**
   * ISO date of the Monday of the week this item was first written in.
   * Absent means it originated in the week it is sitting in, so its age is
   * zero. Age is derived from this and never stored: a counter could be
   * double-incremented by a re-run or inflated by an import, with no way to
   * detect it was wrong. A date can only be right or absent.
   */
  origin?: string;
}
```

Add the same field to `SubjectRow`, after `flagged`:

```ts
  /** As TodoItem.origin. Optional on the same terms as colorId and flagged. */
  origin?: string;
```

Add to `WeekData`, after `weeklyTodos`:

```ts
  /**
   * Whether the carry-forward bar has been answered for this week, either by
   * bringing items forward or by dismissing it. Stored only when true, so a
   * week written before the field existed is identical to an unresolved one.
   */
  carryResolved?: boolean;
```

- [ ] **Step 4: Teach the repair functions the fields**

Still in `src/lib/planner-data.ts`, add a shared helper next to `asText`:

```ts
/** An origin survives only if it is a real ISO date; anything else degrades the item to age zero rather than rendering a broken marker. */
const asOrigin = (value: unknown): string | undefined =>
  typeof value === "string" && ISO_DATE.test(value) ? value : undefined;
```

`ISO_DATE` is declared above these helpers already, so no reordering is needed.

Extend `repairSubject`, keeping its existing body and adding before the `return`:

```ts
  const origin = asOrigin(raw.origin);
  if (origin) row.origin = origin;
  return row;
```

Replace `repairTodo` — note it stops being a complete literal:

```ts
function repairTodo(value: unknown): TodoItem {
  const raw = asRecord(value);
  const todo: TodoItem = { text: asText(raw.text), checked: raw.checked === true };
  // Assigned only when present, so a fresh item stays free of the field.
  const origin = asOrigin(raw.origin);
  if (origin) todo.origin = origin;
  return todo;
}
```

Extend `repairWeek`, adding after the `days:` line inside the returned object — as a statement, because the field must be absent rather than `undefined`:

```ts
export function repairWeek(value: unknown, date: Date): WeekData {
  const raw = asRecord(value);
  const storedDays = Array.isArray(raw.days) ? raw.days : [];
  const week: WeekData = {
    weekGoal: asText(raw.weekGoal),
    weekReview: asText(raw.weekReview),
    weeklyTodos: repairList(raw.weeklyTodos, WEEKLY_TODO_ROWS, repairTodo),
    days: getWeekDates(date).map((d, i) => repairDay(storedDays[i], d)),
  };
  if (raw.carryResolved === true) week.carryResolved = true;
  return week;
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run src/test/carry-schema.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS. `daily-view.test.tsx` and `priority-flag.test.tsx` guard `colorId` and `flagged` through the same functions and must stay green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/planner-data.ts src/test/carry-schema.test.ts
git commit -m "Teach repair about origin and carryResolved"
```

---

## Task 2: Derive an item's age

**Files:**
- Modify: `src/lib/planner-data.ts` (new export)
- Test: `src/test/carry-rules.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/test/carry-rules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { carriedWeeks } from "@/lib/planner-data";

describe("carriedWeeks", () => {
  it("is zero when the item originated in this week", () => {
    expect(carriedWeeks("2026-08-24", "2026-08-24")).toBe(0);
  });

  it("is zero when there is no origin at all", () => {
    expect(carriedWeeks(undefined, "2026-08-24")).toBe(0);
  });

  it("counts one week for an item carried once", () => {
    expect(carriedWeeks("2026-08-17", "2026-08-24")).toBe(1);
  });

  it("counts elapsed weeks, not carry events, across a skipped week", () => {
    // The point of storing a date rather than a counter: a gap reports the
    // truth without anything having incremented during the gap.
    expect(carriedWeeks("2026-08-10", "2026-08-24")).toBe(2);
  });

  it("counts across a year boundary", () => {
    expect(carriedWeeks("2025-12-29", "2026-01-05")).toBe(1);
  });

  it("is zero rather than negative for an origin in the future", () => {
    expect(carriedWeeks("2026-09-07", "2026-08-24")).toBe(0);
  });

  it("is zero for an unparseable origin", () => {
    expect(carriedWeeks("not a date", "2026-08-24")).toBe(0);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/carry-rules.test.ts`
Expected: FAIL — `carriedWeeks` is not exported.

- [ ] **Step 3: Add the import and the function**

In `src/lib/planner-data.ts`, extend the existing date-fns import on line 1 with `differenceInCalendarWeeks`:

```ts
import { startOfWeek, addDays, format, parse, isValid, getISOWeek, getISOWeekYear, differenceInCalendarWeeks } from "date-fns";
```

Add the function near the other week helpers:

```ts
/**
 * How many weeks an item has been slipping: the gap between the week it was
 * first written in and the week being viewed. Both arguments are ISO dates of
 * Mondays.
 *
 * weekStartsOn is stated rather than left to the default of Sunday. Both
 * operands are Mondays so the two agree today, but this planner is
 * Monday-based everywhere else and an implicit Sunday boundary here would be a
 * quiet inconsistency waiting for the first caller that passes a non-Monday.
 *
 * Anything unusable — absent, unparseable, or in the future — reports 0, so a
 * damaged item renders as ordinary rather than as a broken marker.
 */
export function carriedWeeks(origin: string | undefined, mondayISO: string): number {
  if (!origin || !ISO_DATE.test(origin)) return 0;
  const from = parse(origin, "yyyy-MM-dd", new Date());
  const to = parse(mondayISO, "yyyy-MM-dd", new Date());
  if (!isValid(from) || !isValid(to)) return 0;
  return Math.max(0, differenceInCalendarWeeks(to, from, { weekStartsOn: 1 }));
}
```

`ISO_DATE` is declared at line 153, so place `carriedWeeks` below it.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/test/carry-rules.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planner-data.ts src/test/carry-rules.test.ts
git commit -m "Derive how many weeks an item has been slipping"
```

---

## Task 3: Collect candidates and apply them

**Files:**
- Modify: `src/lib/planner-data.ts` (new type and two exports)
- Test: `src/test/carry-rules.test.ts` (extend)

**Note on the signature.** The spec wrote `applyCarryForward(target, chosen, targetMonday)`. The third argument is not needed: each candidate already carries its own `origin`, and duplicate detection compares text. Dropping it removes a parameter that could be passed wrong and can never be checked, so the implementation takes two arguments.

- [ ] **Step 1: Write the failing tests**

Append to `src/test/carry-rules.test.ts`:

```ts
import { collectCarryForward, applyCarryForward, createEmptyWeek, WeekData } from "@/lib/planner-data";

const MONDAY = new Date(2026, 7, 24);
const SOURCE_MONDAY = "2026-08-17";

function sourceWeek(): WeekData {
  const w = createEmptyWeek(new Date(2026, 7, 17));
  w.weeklyTodos[0] = { text: "Book viva slot", checked: false };
  w.weeklyTodos[1] = { text: "Return library books", checked: true };
  w.weeklyTodos[2] = { text: "   ", checked: false };
  w.days[1].subjects[0] = { subject: "Draft methods", checked: false, flagged: true, colorId: 3 };
  w.days[1].subjects[1] = { subject: "Read chapter 7", checked: false };
  w.days[2].subjects[0] = { subject: "Already done", checked: true, flagged: true };
  return w;
}

describe("collectCarryForward", () => {
  it("takes unchecked, non-empty weekly actions", () => {
    const got = collectCarryForward(sourceWeek(), SOURCE_MONDAY).map((c) => c.text);
    expect(got).toContain("Book viva slot");
    expect(got).not.toContain("Return library books"); // checked
    expect(got.some((t) => t.trim() === "")).toBe(false); // blank
  });

  it("takes flagged daily rows and leaves unflagged ones", () => {
    const got = collectCarryForward(sourceWeek(), SOURCE_MONDAY).map((c) => c.text);
    expect(got).toContain("Draft methods");
    expect(got).not.toContain("Read chapter 7"); // unflagged: a log, not a commitment
    expect(got).not.toContain("Already done"); // flagged but checked
  });

  it("stamps the source week's Monday as origin when the item has none", () => {
    const got = collectCarryForward(sourceWeek(), SOURCE_MONDAY);
    expect(got.every((c) => c.origin === SOURCE_MONDAY)).toBe(true);
  });

  it("preserves an existing origin, so carrying twice does not reset the age", () => {
    const w = sourceWeek();
    w.weeklyTodos[0] = { text: "Book viva slot", checked: false, origin: "2026-07-27" };
    const got = collectCarryForward(w, SOURCE_MONDAY);
    expect(got.find((c) => c.text === "Book viva slot")!.origin).toBe("2026-07-27");
  });

  it("returns nothing for an empty week", () => {
    expect(collectCarryForward(createEmptyWeek(MONDAY), SOURCE_MONDAY)).toEqual([]);
  });
});

describe("applyCarryForward", () => {
  it("fills blank rows before appending", () => {
    const target = createEmptyWeek(MONDAY); // 8 blank todos
    const out = applyCarryForward(target, collectCarryForward(sourceWeek(), SOURCE_MONDAY));
    expect(out.weeklyTodos).toHaveLength(8);
    expect(out.weeklyTodos[0].text).toBe("Book viva slot");
    expect(out.weeklyTodos[1].text).toBe("Draft methods");
  });

  it("appends once the blanks run out", () => {
    const target = createEmptyWeek(MONDAY);
    target.weeklyTodos = [{ text: "Existing", checked: false }];
    const out = applyCarryForward(target, collectCarryForward(sourceWeek(), SOURCE_MONDAY));
    expect(out.weeklyTodos).toHaveLength(3);
    expect(out.weeklyTodos[0].text).toBe("Existing");
  });

  it("carries the origin onto the landed item", () => {
    const out = applyCarryForward(createEmptyWeek(MONDAY), collectCarryForward(sourceWeek(), SOURCE_MONDAY));
    expect(out.weeklyTodos[0].origin).toBe(SOURCE_MONDAY);
  });

  it("lands carried items unchecked", () => {
    const out = applyCarryForward(createEmptyWeek(MONDAY), collectCarryForward(sourceWeek(), SOURCE_MONDAY));
    expect(out.weeklyTodos[0].checked).toBe(false);
  });

  it("skips a candidate whose text already exists in the target", () => {
    const target = createEmptyWeek(MONDAY);
    target.weeklyTodos[0] = { text: "  Book viva slot  ", checked: false };
    const out = applyCarryForward(target, collectCarryForward(sourceWeek(), SOURCE_MONDAY));
    expect(out.weeklyTodos.filter((t) => t.text.trim() === "Book viva slot")).toHaveLength(1);
  });

  it("does not mutate the target week", () => {
    // Carrying copies. The source week is a record of what happened and the
    // target must be replaced, not edited in place, or React sees no change.
    const target = createEmptyWeek(MONDAY);
    const before = JSON.stringify(target);
    applyCarryForward(target, collectCarryForward(sourceWeek(), SOURCE_MONDAY));
    expect(JSON.stringify(target)).toBe(before);
  });

  it("leaves the days untouched", () => {
    const out = applyCarryForward(createEmptyWeek(MONDAY), collectCarryForward(sourceWeek(), SOURCE_MONDAY));
    expect(out.days).toHaveLength(7);
    expect(out.days[0].subjects.every((s) => s.subject === "")).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/carry-rules.test.ts`
Expected: FAIL — neither function is exported.

- [ ] **Step 3: Write the functions**

In `src/lib/planner-data.ts`, add below `carriedWeeks`:

```ts
export interface CarryCandidate {
  text: string;
  /** ISO Monday of the week this item was first written in. */
  origin: string;
  /** Where it came from, so the bar can say so. */
  source: "todo" | "priority";
}

/**
 * The unfinished work in a week: unchecked Weekly Actions, plus unchecked
 * daily rows the user explicitly flagged as priorities.
 *
 * Unflagged daily rows are excluded on purpose. Forty-two rows a week are
 * partly a log of what happened, and carrying a log forward is noise; the flag
 * is the user saying "this one is a commitment".
 *
 * Blank rows never carry — a default week is 8 empty todos and 42 empty
 * subject rows.
 */
export function collectCarryForward(source: WeekData, sourceMonday: string): CarryCandidate[] {
  const out: CarryCandidate[] = [];
  const take = (text: string, checked: boolean, origin: string | undefined, from: "todo" | "priority") => {
    if (checked || text.trim() === "") return;
    // An existing origin wins, so carrying twice reports two weeks rather than
    // resetting to one. This is what makes a repeated carry idempotent.
    out.push({ text: text.trim(), origin: origin ?? sourceMonday, source: from });
  };
  for (const todo of source.weeklyTodos ?? []) {
    take(todo.text, todo.checked, todo.origin, "todo");
  }
  for (const day of source.days ?? []) {
    for (const row of day.subjects ?? []) {
      if (row.flagged === true) take(row.subject, row.checked, row.origin, "priority");
    }
  }
  return out;
}

/**
 * Copy chosen candidates into a week's Weekly Actions, returning a new week.
 *
 * The source week is never touched: last week genuinely ended with these items
 * unfinished, and ticking one off here must leave that record true.
 *
 * A flagged daily row lands as a weekly action rather than on a day. A row that
 * failed to happen on Tuesday no longer belongs to a day, and re-pinning it to
 * one would be a guess. Its colorId does not survive — TodoItem has no colour.
 */
export function applyCarryForward(target: WeekData, chosen: CarryCandidate[]): WeekData {
  const todos = (target.weeklyTodos ?? []).map((t) => ({ ...t }));
  const present = new Set(todos.map((t) => t.text.trim()).filter((t) => t !== ""));
  for (const c of chosen) {
    if (present.has(c.text)) continue;
    present.add(c.text);
    const landed = { text: c.text, checked: false, origin: c.origin };
    // Fill a blank row before appending: a fresh week starts with 8 empty rows
    // and appending past them would leave the list front-loaded with blanks.
    const blank = todos.findIndex((t) => t.text.trim() === "");
    if (blank === -1) todos.push(landed);
    else todos[blank] = landed;
  }
  return { ...target, weeklyTodos: todos };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/test/carry-rules.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planner-data.ts src/test/carry-rules.test.ts
git commit -m "Collect unfinished work, and land it in the weekly actions"
```

---

## Task 4: Find the source week

**Files:**
- Modify: `src/lib/planner-data.ts` (one new export)
- Create: `src/lib/carry-forward.ts`
- Test: `src/test/carry-source.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/test/carry-source.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { saveWeek, createEmptyWeek } from "@/lib/planner-data";
import { findCarrySource, isCurrentOrFutureWeek } from "@/lib/carry-forward";
import { subWeeks, startOfWeek } from "date-fns";

const MONDAY = new Date(2026, 7, 24); // 2026-08-24

beforeEach(() => localStorage.clear());

describe("findCarrySource", () => {
  it("returns null when nothing is stored behind this week", () => {
    expect(findCarrySource(MONDAY)).toBeNull();
  });

  it("finds the immediately preceding week", () => {
    saveWeek(subWeeks(MONDAY, 1), createEmptyWeek(subWeeks(MONDAY, 1)));
    expect(findCarrySource(MONDAY)!.monday).toBe("2026-08-17");
  });

  it("crosses a gap to the most recent stored week", () => {
    // A holiday must not strand everything behind it.
    saveWeek(subWeeks(MONDAY, 3), createEmptyWeek(subWeeks(MONDAY, 3)));
    expect(findCarrySource(MONDAY)!.monday).toBe("2026-08-03");
  });

  it("stops after four weeks rather than becoming an archaeology tool", () => {
    saveWeek(subWeeks(MONDAY, 5), createEmptyWeek(subWeeks(MONDAY, 5)));
    expect(findCarrySource(MONDAY)).toBeNull();
  });

  it("prefers the nearest stored week when several exist", () => {
    saveWeek(subWeeks(MONDAY, 3), createEmptyWeek(subWeeks(MONDAY, 3)));
    saveWeek(subWeeks(MONDAY, 1), createEmptyWeek(subWeeks(MONDAY, 1)));
    expect(findCarrySource(MONDAY)!.monday).toBe("2026-08-17");
  });

  it("stops at a stored week even when it holds nothing unfinished", () => {
    // An existing week means the user was there. If they left nothing
    // unfinished, nothing carries — scanning past it would resurrect older
    // items they had already moved on from.
    saveWeek(subWeeks(MONDAY, 1), createEmptyWeek(subWeeks(MONDAY, 1)));
    saveWeek(subWeeks(MONDAY, 2), createEmptyWeek(subWeeks(MONDAY, 2)));
    expect(findCarrySource(MONDAY)!.monday).toBe("2026-08-17");
  });
});

describe("isCurrentOrFutureWeek", () => {
  it("accepts this week", () => {
    expect(isCurrentOrFutureWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))).toBe(true);
  });

  it("rejects a past week, so reviewing March never offers to carry February", () => {
    expect(isCurrentOrFutureWeek(new Date(2020, 0, 6))).toBe(false);
  });

  it("accepts a future week", () => {
    expect(isCurrentOrFutureWeek(new Date(2099, 0, 5))).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/carry-source.test.ts`
Expected: FAIL — "Failed to resolve import @/lib/carry-forward".

- [ ] **Step 3: Add the storage-presence helper**

`loadWeek` returns an empty week when nothing is stored, so it cannot tell "absent" from "empty". Add to `src/lib/planner-data.ts`, next to `loadWeek`:

```ts
/**
 * Whether a week has ever been written. loadWeek cannot answer this — it
 * returns an empty week for a missing key — and the carry scan needs the
 * difference: a stored-but-empty week still means the user was there.
 */
export function hasStoredWeek(date: Date): boolean {
  return readItem(`planner-${getWeekKey(date)}`) !== null;
}
```

- [ ] **Step 4: Write the scan module**

Create `src/lib/carry-forward.ts`:

```ts
import { startOfWeek, subWeeks, format } from "date-fns";
import { WeekData, loadWeek, hasStoredWeek } from "./planner-data";

/** How far back the scan will look before giving up. */
const MAX_WEEKS_BACK = 4;

export interface CarrySource {
  week: WeekData;
  /** ISO date of that week's Monday, which becomes the origin stamp. */
  monday: string;
}

/**
 * The week to carry from: the most recent one that exists in storage, scanning
 * back from the previous week.
 *
 * Reads only. Nothing here writes, which is what lets the bar be computed the
 * moment a week is opened without opening a week ever mutating it.
 */
export function findCarrySource(currentWeekDate: Date): CarrySource | null {
  const thisMonday = startOfWeek(currentWeekDate, { weekStartsOn: 1 });
  for (let back = 1; back <= MAX_WEEKS_BACK; back++) {
    const monday = subWeeks(thisMonday, back);
    if (!hasStoredWeek(monday)) continue;
    return { week: loadWeek(monday), monday: format(monday, "yyyy-MM-dd") };
  }
  return null;
}

/**
 * Whether the viewed week is one the user could still act on.
 *
 * Navigating back to review March must not prompt to carry February forward,
 * and must not offer to write to a week the user is only reading.
 */
export function isCurrentOrFutureWeek(weekDate: Date): boolean {
  const viewed = startOfWeek(weekDate, { weekStartsOn: 1 });
  const now = startOfWeek(new Date(), { weekStartsOn: 1 });
  return viewed.getTime() >= now.getTime();
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run src/test/carry-source.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Confirm the storage rule still holds**

Run: `grep -rn "localStorage" src --include=*.ts --include=*.tsx | grep -v "src/lib/storage.ts" | grep -v "src/test/"`
Expected: only comment lines. `carry-forward.ts` reaches storage through `loadWeek` and `hasStoredWeek`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/planner-data.ts src/lib/carry-forward.ts src/test/carry-source.test.ts
git commit -m "Scan back for the week to carry from"
```

---

## Task 5: The review bar

**Files:**
- Create: `src/components/planner/CarryForwardBar.tsx`
- Test: `src/test/carry-bar.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/test/carry-bar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CarryForwardBar from "@/components/planner/CarryForwardBar";
import { CarryCandidate } from "@/lib/planner-data";

const CANDIDATES: CarryCandidate[] = [
  { text: "Book viva slot", origin: "2026-08-17", source: "todo" },
  { text: "Draft methods", origin: "2026-08-03", source: "priority" },
  { text: "Email supervisor", origin: "2026-08-17", source: "todo" },
];

const setup = (props = {}) =>
  render(
    <CarryForwardBar
      candidates={CANDIDATES}
      mondayISO="2026-08-24"
      onBring={vi.fn()}
      onDismiss={vi.fn()}
      {...props}
    />
  );

describe("CarryForwardBar", () => {
  it("states how many items are unfinished", () => {
    setup();
    expect(screen.getByText(/3 items/)).toBeInTheDocument();
  });

  it("lists every candidate", () => {
    setup();
    for (const c of CANDIDATES) expect(screen.getByText(c.text)).toBeInTheDocument();
  });

  it("ticks everything by default, so the fast path is one click", () => {
    setup();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
  });

  it("brings only the ticked items", () => {
    const onBring = vi.fn();
    setup({ onBring });
    fireEvent.click(screen.getAllByRole("checkbox")[1]); // untick "Draft methods"
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));
    expect(onBring).toHaveBeenCalledTimes(1);
    expect(onBring.mock.calls[0][0].map((c: CarryCandidate) => c.text)).toEqual([
      "Book viva slot",
      "Email supervisor",
    ]);
  });

  it("reports nothing to bring when everything is unticked", () => {
    const onBring = vi.fn();
    setup({ onBring });
    screen.getAllByRole("checkbox").forEach((b) => fireEvent.click(b));
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));
    expect(onBring.mock.calls[0][0]).toEqual([]);
  });

  it("dismisses without bringing anything", () => {
    const onBring = vi.fn();
    const onDismiss = vi.fn();
    setup({ onBring, onDismiss });
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onBring).not.toHaveBeenCalled();
  });

  it("shows how long each item has slipped", () => {
    setup();
    expect(screen.getByText("1w")).toBeInTheDocument();
    expect(screen.getByText("3w")).toBeInTheDocument();
  });

  it("does not print", () => {
    const { container } = setup();
    expect(container.firstElementChild?.className).toContain("no-print");
  });

  it("carries none of the roles that would swallow the paint shortcuts", () => {
    // TimeGrid's keydown guard tests for these so Radix menus can swallow
    // digits; any of them on an ancestor silently disables 1-9 while focus
    // sits inside.
    const { container } = setup();
    expect(container.querySelector('[role="menu"], [role="dialog"], [role="listbox"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/carry-bar.test.tsx`
Expected: FAIL — "Failed to resolve import @/components/planner/CarryForwardBar".

- [ ] **Step 3: Write the component**

Create `src/components/planner/CarryForwardBar.tsx`:

```tsx
import React, { useState } from "react";
import { CarryCandidate, carriedWeeks } from "@/lib/planner-data";
import { CornerDownRight } from "lucide-react";

interface CarryForwardBarProps {
  candidates: CarryCandidate[];
  /** ISO Monday of the week being viewed, for the age calculation. */
  mondayISO: string;
  onBring: (chosen: CarryCandidate[]) => void;
  onDismiss: () => void;
}

/**
 * The review moment. Everything is ticked to begin with, so bringing the lot
 * forward is one click — but unticking is the same gesture as keeping, which is
 * what stops the list growing into a wall of things the user has silently
 * decided not to do.
 *
 * Purely presentational: it reports the chosen subset and never touches storage.
 */
const CarryForwardBar: React.FC<CarryForwardBarProps> = ({
  candidates,
  mondayISO,
  onBring,
  onDismiss,
}) => {
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const chosen = candidates.filter((_, i) => !excluded.has(i));

  return (
    <div className="no-print border-b border-border bg-accent/20 px-3 py-1.5 shrink-0">
      <div className="flex items-center gap-1.5 text-[10px] text-foreground mb-1">
        <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        <strong>
          {candidates.length} item{candidates.length === 1 ? "" : "s"}
        </strong>
        <span className="text-muted-foreground">unfinished from last week</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mb-1.5">
        {candidates.map((c, i) => {
          const age = carriedWeeks(c.origin, mondayISO);
          return (
            <label key={i} className="flex items-center gap-1 text-[10px] cursor-pointer">
              <input
                type="checkbox"
                checked={!excluded.has(i)}
                onChange={() => toggle(i)}
                className="h-3 w-3 shrink-0 accent-campus-blue-dark"
              />
              <span className="text-foreground">{c.text}</span>
              {age > 0 && <span className="text-muted-foreground tabular-nums">{age}w</span>}
            </label>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onBring(chosen)}
          className="text-[10px] px-2 py-0.5 rounded bg-campus-blue-dark text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Bring {chosen.length} forward
        </button>
        <button
          onClick={onDismiss}
          className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  );
};

export default CarryForwardBar;
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/test/carry-bar.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/planner/CarryForwardBar.tsx src/test/carry-bar.test.tsx
git commit -m "Add the carry-forward review bar"
```

---

## Task 6: Wire it into StudyPlanner

**Files:**
- Modify: `src/components/planner/StudyPlanner.tsx`
- Test: `src/test/carry-bar.test.tsx` (extend)

- [ ] **Step 1: Write the failing integration tests**

Append to `src/test/carry-bar.test.tsx`. Merge the new names into the **existing** `vitest` and `@testing-library/react` import lines at the top of the file rather than adding second import statements — the file needs `beforeEach`, `afterEach`, `cleanup` and `act` alongside what it already imports:

```tsx
// merged into the existing imports at the top of the file:
//   import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
//   import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { saveWeek, createEmptyWeek, loadWeek, getWeekKey } from "@/lib/planner-data";
import { startOfWeek, subWeeks } from "date-fns";
import StudyPlanner from "@/components/planner/StudyPlanner";
```

Then the block itself. It follows the fake-timer pattern already used by `autosave.test.tsx` and `pending-save.test.tsx` — real time plus a 300ms debounce makes these flaky, and the bar's visibility depends on "is this the current week", which needs a pinned clock to be deterministic:

```tsx
const NOW = new Date(2026, 7, 26); // Wed 26 Aug 2026
const thisMonday = () => startOfWeek(NOW, { weekStartsOn: 1 });

/** Let the debounce elapse, matching autosave.test.tsx. */
const settle = async () => { await act(async () => { vi.advanceTimersByTime(400); }); };

function seedLastWeekWithUnfinishedWork() {
  const last = subWeeks(thisMonday(), 1);
  const w = createEmptyWeek(last);
  w.weeklyTodos[0] = { text: "Book viva slot", checked: false };
  saveWeek(last, w);
}

/**
 * Only the week entries. StudyPlanner writes planner-show-weekends from an
 * effect on mount, so snapshotting the whole of localStorage would fail on a
 * write this test does not care about.
 */
const weekEntries = () =>
  JSON.stringify(
    Object.keys(localStorage)
      .filter((k) => /^planner-\d{4}-W\d{2}$/.test(k))
      .sort()
      .map((k) => [k, localStorage.getItem(k)])
  );

describe("StudyPlanner carry-forward", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("offers the bar when last week left work unfinished", () => {
    seedLastWeekWithUnfinishedWork();
    render(<StudyPlanner />);
    expect(screen.getByText(/unfinished from last week/)).toBeInTheDocument();
  });

  it("stays silent when there is nothing behind this week", () => {
    render(<StudyPlanner />);
    expect(screen.queryByText(/unfinished from last week/)).toBeNull();
  });

  it("stays silent when last week finished everything", () => {
    const last = subWeeks(thisMonday(), 1);
    const w = createEmptyWeek(last);
    w.weeklyTodos[0] = { text: "Book viva slot", checked: true };
    saveWeek(last, w);
    render(<StudyPlanner />);
    expect(screen.queryByText(/unfinished from last week/)).toBeNull();
  });

  it("writes to no week merely by opening one that has candidates", async () => {
    // The dirtyRef guarantee. The autosave effect runs on mount, not only on
    // edit, and opening a week used to write it straight back — which is how an
    // unreadable week became an empty one 300ms after being viewed. Settling the
    // debounce is the point: without it this would pass vacuously.
    seedLastWeekWithUnfinishedWork();
    const before = weekEntries();
    render(<StudyPlanner />);
    await settle();
    expect(weekEntries()).toBe(before);
  });

  it("brings the ticked items into this week and marks the week resolved", async () => {
    seedLastWeekWithUnfinishedWork();
    render(<StudyPlanner />);
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));
    await settle();
    const now = loadWeek(thisMonday());
    expect(now.weeklyTodos[0].text).toBe("Book viva slot");
    expect(now.weeklyTodos[0].origin).toBe("2026-08-17");
    expect(now.carryResolved).toBe(true);
  });

  it("leaves last week untouched, because carrying copies", async () => {
    seedLastWeekWithUnfinishedWork();
    render(<StudyPlanner />);
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));
    await settle();
    const last = loadWeek(subWeeks(thisMonday(), 1));
    expect(last.weeklyTodos[0]).toEqual({ text: "Book viva slot", checked: false });
  });

  it("dismissing marks the week resolved and adds nothing", async () => {
    seedLastWeekWithUnfinishedWork();
    render(<StudyPlanner />);
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    await settle();
    const now = loadWeek(thisMonday());
    expect(now.carryResolved).toBe(true);
    expect(now.weeklyTodos.every((t) => t.text === "")).toBe(true);
  });

  it("does not offer the bar again once the week is resolved", () => {
    seedLastWeekWithUnfinishedWork();
    const now = createEmptyWeek(thisMonday());
    now.carryResolved = true;
    saveWeek(thisMonday(), now);
    render(<StudyPlanner />);
    expect(screen.queryByText(/unfinished from last week/)).toBeNull();
  });

  it("does not offer the bar on a past week", () => {
    seedLastWeekWithUnfinishedWork();
    render(<StudyPlanner />);
    // Two chevrons precede everything else; [0] is "previous".
    fireEvent.click(document.querySelectorAll("button")[0]);
    fireEvent.click(document.querySelectorAll("button")[0]);
    expect(screen.queryByText(/unfinished from last week/)).toBeNull();
  });
});
```

Because these tests use fake timers, `CarryForwardBar`'s own tests earlier in the file must not — keep the two `describe` blocks' `beforeEach` hooks separate, as written.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/carry-bar.test.tsx`
Expected: FAIL — `StudyPlanner` renders no bar.

- [ ] **Step 3: Add the imports**

In `src/components/planner/StudyPlanner.tsx`, extend the existing imports:

```ts
import { WeekData, DayData, TodoItem, CarryCandidate, loadWeek, saveWeek, collectCarryForward, applyCarryForward } from "@/lib/planner-data";
import { findCarrySource, isCurrentOrFutureWeek } from "@/lib/carry-forward";
import CarryForwardBar from "./CarryForwardBar";
```

- [ ] **Step 4: Compute the candidates when the week changes**

Add after the `activeColor` state declaration:

```ts
  // Candidates are looked up per week, not per edit: recomputing on every
  // weekData change would re-scan storage on every keystroke. This reads only,
  // so it cannot write to a week the user has merely opened.
  const [candidates, setCandidates] = useState<CarryCandidate[]>([]);

  useEffect(() => {
    if (!isCurrentOrFutureWeek(currentDate)) {
      setCandidates([]);
      return;
    }
    const source = findCarrySource(currentDate);
    setCandidates(source ? collectCarryForward(source.week, source.monday) : []);
  }, [currentDate, refreshKey]);
```

- [ ] **Step 5: Add the two handlers**

Add next to `updateField`:

```ts
  const bringForward = useCallback((chosen: CarryCandidate[]) => {
    markDirty();
    setWeekData((prev) => ({ ...applyCarryForward(prev, chosen), carryResolved: true }));
  }, [markDirty]);

  const dismissCarry = useCallback(() => {
    markDirty();
    setWeekData((prev) => ({ ...prev, carryResolved: true }));
  }, [markDirty]);
```

Both mark the week dirty because both are user actions. Opening a week still writes nothing — that is what `dirtyRef` is for.

- [ ] **Step 6: Render the bar**

Insert directly **after** the Goal/Review row's closing `)}` and before the `{/* View content */}` comment:

```tsx
      {/* Carry-forward review. Sits below both week chevrons on purpose: any
          control inserted before them silently repoints the button-index
          lookups in autosave.test.tsx and pending-save.test.tsx at the wrong
          button, and they then fail looking like a save bug. */}
      {viewMode !== "monthly" && !weekData.carryResolved && candidates.length > 0 && (
        <CarryForwardBar
          candidates={candidates}
          mondayISO={format(dates[0], "yyyy-MM-dd")}
          onBring={bringForward}
          onDismiss={dismissCarry}
        />
      )}
```

`format` and `dates` are both already in scope.

- [ ] **Step 7: Run the tests and verify they pass**

Run: `npx vitest run src/test/carry-bar.test.tsx`
Expected: PASS, 18 tests.

- [ ] **Step 8: Confirm the button-index tests still pass**

Run: `npx vitest run src/test/autosave.test.tsx src/test/pending-save.test.tsx src/test/today.test.tsx`
Expected: PASS. These reach the next week with `container.querySelectorAll("button")[1]`; the bar renders below the toolbar, so that index is unchanged. If they fail, the bar was inserted too early in the tree — that is a layout mistake, not a save bug.

- [ ] **Step 9: Commit**

```bash
git add src/components/planner/StudyPlanner.tsx src/test/carry-bar.test.tsx
git commit -m "Offer the carry-forward review when a week opens"
```

---

## Task 7: Show how long an item has slipped

**Files:**
- Modify: `src/components/planner/WeeklyTodoSidebar.tsx`
- Test: `src/test/carry-marker.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/test/carry-marker.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WeeklyTodoSidebar from "@/components/planner/WeeklyTodoSidebar";
import { TodoItem } from "@/lib/planner-data";

const TODOS: TodoItem[] = [
  { text: "Fresh this week", checked: false },
  { text: "Slipped once", checked: false, origin: "2026-08-17" },
  { text: "Slipped three times", checked: false, origin: "2026-08-03" },
];

const setup = (onChange = vi.fn()) =>
  render(<WeeklyTodoSidebar todos={TODOS} mondayISO="2026-08-24" onChange={onChange} />);

describe("the age marker", () => {
  it("labels a slipped item with its age in weeks", () => {
    setup();
    expect(screen.getByText("1w")).toBeInTheDocument();
    expect(screen.getByText("3w")).toBeInTheDocument();
  });

  it("leaves an item that originated this week unmarked", () => {
    setup();
    expect(screen.queryByText("0w")).toBeNull();
  });

  it("preserves origin through a keystroke", () => {
    // The spread in `update` is the only thing carrying origin through an edit,
    // for the same reason updateSubject must not be rewritten to list fields:
    // the field is optional and strict is off, so nothing would catch the loss.
    const onChange = vi.fn();
    setup(onChange);
    fireEvent.change(screen.getAllByRole("textbox")[1], { target: { value: "Slipped once more" } });
    expect(onChange.mock.calls[0][0][1]).toEqual({
      text: "Slipped once more",
      checked: false,
      origin: "2026-08-17",
    });
  });

  it("preserves origin through a checkbox toggle", () => {
    const onChange = vi.fn();
    setup(onChange);
    fireEvent.click(screen.getAllByRole("checkbox")[2]);
    expect(onChange.mock.calls[0][0][2].origin).toBe("2026-08-03");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/carry-marker.test.tsx`
Expected: FAIL — the component takes no `mondayISO` prop and renders no age.

- [ ] **Step 3: Add the prop and the marker**

In `src/components/planner/WeeklyTodoSidebar.tsx`, extend the imports and props:

```tsx
import { TodoItem, carriedWeeks } from "@/lib/planner-data";

interface WeeklyTodoSidebarProps {
  todos: TodoItem[];
  /** ISO Monday of the week being viewed, for the age calculation. */
  mondayISO: string;
  onChange: (todos: TodoItem[]) => void;
}

const WeeklyTodoSidebar: React.FC<WeeklyTodoSidebarProps> = ({ todos, mondayISO, onChange }) => {
```

**Leave `update` exactly as it is.** Its `{ ...t, [field]: value }` spread is what preserves `origin` through a keystroke.

Replace the row `<div>` inside the `todos.map` with one that carries the rule and the label:

```tsx
        {todos.map((todo, idx) => {
          // The rule spends margin the row was not using. A chip or dots would
          // take width from the item's own text, and this column is 128px at
          // 9px text. Thickness caps at three so a long-slipped item cannot
          // crowd the text out.
          const age = carriedWeeks(todo.origin, mondayISO);
          const rule = age === 0
            ? "border-l-2 border-l-transparent"
            : `border-l-[${Math.min(age, 3) * 2}px] ${age > 2 ? "border-l-destructive/70" : "border-l-campus-blue-dark"}`;
          return (
          <div key={idx} className={`flex items-center border-b border-campus-grid px-1 group ${rule}`}>
```

Add the age label immediately after the text `<input>` and before the remove `<button>`:

```tsx
            {age > 0 && (
              <span className="text-[7px] text-muted-foreground shrink-0 tabular-nums" title={`Carried forward ${age} week${age === 1 ? "" : "s"}`}>
                {age}w
              </span>
            )}
```

Close the map with `);})}` instead of `))}`.

**Tailwind cannot see a class built by string interpolation**, so add the four widths to the safelist in `tailwind.config.ts` — or, simpler and used here, write them as an explicit lookup rather than interpolation:

```tsx
          const RULE_WIDTH = ["border-l-2", "border-l-2", "border-l-4", "border-l-[6px]"];
          const rule = age === 0
            ? "border-l-2 border-l-transparent"
            : `${RULE_WIDTH[Math.min(age, 3)]} ${age > 2 ? "border-l-destructive/70" : "border-l-campus-blue-dark"}`;
```

Use this second form. The first is shown only to name the trap: a class assembled at runtime is invisible to Tailwind's scanner and silently produces no CSS.

- [ ] **Step 4: Pass the prop from StudyPlanner**

In `src/components/planner/StudyPlanner.tsx`, find the `<WeeklyTodoSidebar` usage and add:

```tsx
          mondayISO={format(dates[0], "yyyy-MM-dd")}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run src/test/carry-marker.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/planner/WeeklyTodoSidebar.tsx src/components/planner/StudyPlanner.tsx src/test/carry-marker.test.tsx
git commit -m "Show how many weeks an action has been slipping"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: PASS. The count rises from 186 by the tests added here — 7 schema, 19 rules, 9 source, 18 bar, 4 marker.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: **0 errors**, and warnings still at **10**. The new modules export no components, so `react-refresh/only-export-components` does not apply. Treat any error as new; if the warning count moved, find out why before continuing.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: See it working in a browser**

Run `npm run dev` and open `http://localhost:8080/Daily-Log/`.

1. In last week, type two Weekly Actions and flag a daily priority; leave them unchecked.
2. Navigate to this week. The bar should appear naming three items.
3. Untick one, press **Bring 2 forward**. The two land in Weekly Actions, each with a left rule and `1w`.
4. Reload. The items and their markers survive, and the bar does not return.
5. Navigate back to last week. Its items are still there and still unchecked — carrying copied them.
6. Navigate to a week two months ago. **No bar**, because it is in the past.
7. Check the rule is legible in both light and dark, and that a `3w` item's thicker rule does not crowd the text out at 128px.

- [ ] **Step 5: Confirm the storage rule**

Run: `grep -rn "localStorage" src --include=*.ts --include=*.tsx | grep -v "src/lib/storage.ts" | grep -v "src/test/"`
Expected: only comment lines.

- [ ] **Step 6: Update the working notes**

In `CLAUDE.md`: move carry-forward out of "Discussed but not started" into its own section, recording that carrying copies rather than moves, that `origin` is a date rather than a counter and why, that `repairTodo` is no longer a complete literal, and that the bar only appears for current-or-future weeks. Update the **Baselines** test count.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Record how carrying forward works, and refresh the baselines"
```

---

## Self-review notes

Spec sections and the task that implements each:

| Spec section | Task |
| --- | --- |
| Schema — `origin`, `carryResolved` | 1 |
| The repair trap | 1 |
| Age is derived, not counted | 2 |
| Finding candidates — eligibility, blanks, flagged rows | 3 |
| Landing — fill blanks first, duplicates, promotion to a todo | 3 |
| Which week is the source, the four-week limit | 4 |
| When the bar may appear (current-or-later) | 4, 6 |
| Interaction — pick list, Bring / Not now, `no-print`, roles | 5, 6 |
| Copy, never move | 3 (pure), 6 (asserted end to end) |
| Resolution memory | 1, 6 |
| The age marker | 7 |
| Testing | 1-7, gathered in 8 |

Two deliberate departures from the spec, both simplifications:

- **`applyCarryForward` takes two arguments, not three.** The spec passed `targetMonday`; nothing uses it, because each candidate carries its own `origin`. A parameter that is never read cannot be checked and can only be passed wrong.
- **`hasStoredWeek` is a new export.** The spec assumed the scan could ask whether a week exists; `loadWeek` cannot answer that, since it returns an empty week for a missing key, and the exists-versus-empty difference is what stops the scan skipping past a week the user actually visited.
