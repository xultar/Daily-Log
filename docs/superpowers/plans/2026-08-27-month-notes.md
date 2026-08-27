# Month Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free-text notes area under "Time blocked by tag" in the month view, stored per month, saved as it is typed, printed when it has content, carried in backups, and findable from search.

**Architecture:** A new `src/lib/month-notes.ts` owns one storage key per month, `daily-log-month-YYYY-MM`, holding raw text. Because each month is its own key, the repair path is `readItem(...) ?? ""` and an import merge is free — writing the months a file names leaves the ones it does not name alone. `MonthNotes.tsx` seeds from a lazy `useState` initialiser and is remounted by `key={monthKey}`, so no effect ever reads storage and nothing writes on mount. Search gains a discriminated union on `kind`, because `strict` is off and optional fields would buy no protection.

**Tech Stack:** TypeScript, React 18, Vite, vitest + @testing-library/react, date-fns, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-27-month-notes-design.md`

**Branch:** `month-notes`, already created off a clean `main`. The spec's two commits are already on it.

**Baseline before starting:** `npm test` 471 tests across 48 files, `npm run lint` 0 errors and 10 warnings, `npm run build` clean. Confirmed on 2026-08-27 before this plan was written. Re-confirm before Task 1 and do not proceed if it differs.

---

## Deviations from the spec, applied deliberately

The spec lists five functions in `month-notes.ts`. This plan adds two more, each because a second consumer needs it and the alternative is a duplicated definition:

- **`isMonthKey(value)`** — `export-import.ts` must validate month keys arriving in an untrusted file. Without this it would carry its own copy of the month regex, and two definitions of "what a month key is" is exactly the drift this repo keeps writing notes about.
- **`monthLabel(monthKey)`** — both `MonthNotes` (for its `aria-label`) and `SearchDialog` (for a result row) need "August 2026" from "2026-08".

Both are one-liners over the same regex and the same `parse`. The spec's intent — one place that knows the key format — is served better by seven small exports than by five plus two copies.

## Landmines

**`src/test/carry-bar.test.tsx` finds the week chevrons positionally**, as `querySelectorAll("button")[0]` and `[1]`. This feature adds no toolbar button, so it is safe — but if you find yourself adding one, it must go *after* `SearchDialog` in `StudyPlanner.tsx`.

**`npm run build` is `vite build`, not `tsc`.** Type errors do not fail the build or the deploy. The discriminated union in Task 8 therefore protects you only if you actually narrow on `kind`; nothing will stop you shipping a `m.monday` read on a month match. The tests in Task 9 and Task 10 are the real guard.

**`src/test/search-dialog.test.tsx` renders `<SearchDialog onJump={...} />`** with no `onJumpToMonth`. Task 10 adds that required prop and must update the helper at `src/test/search-dialog.test.tsx:19-23` in the same commit.

**Do not pad `repairList`** or touch anything in `planner-data.ts`. Backlog item 3 is about a short `subjects` array and is not this feature.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/month-notes.ts` | New. The key format, load, save, and the all-months scan. Knows nothing about React. |
| `src/components/planner/MonthNotes.tsx` | New. The field, its save-on-keystroke, its auto-grow. Knows nothing about how a month is keyed beyond the string it is handed. |
| `src/components/planner/MonthlyView.tsx` | Mounts `MonthNotes` below `TimeByTag`. |
| `src/lib/export-import.ts` | Carries `monthNotes` out and validates it back in. |
| `src/lib/search.ts` | The `SearchMatch` union, `searchMonthNotes`, `searchAll`. |
| `src/components/planner/SearchDialog.tsx` | Renders both kinds of row and routes each to its own callback. |
| `src/components/planner/StudyPlanner.tsx` | Wires `onJumpToMonth` to the monthly view. |
| `src/test/month-notes.test.ts` | New. The module. |
| `src/test/month-notes-view.test.tsx` | New. The field in the month view. |
| `src/test/month-notes-backup.test.ts` | New. Export and import. |
| `src/test/month-notes-search.test.tsx` | New. The union, the merge-sort, and both navigation paths. |
| `src/test/all-weeks.test.ts` | One added case: the new key is not a week. |
| `CLAUDE.md`, `docs/design-notes.md` | Baselines; backlog item 1 removed and 2–3 renumbered. |

---

### Task 1: The key format

**Files:**
- Create: `src/lib/month-notes.ts`
- Test: `src/test/month-notes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { isMonthKey, monthKeyFromEntryKey, monthKeyOf } from "@/lib/month-notes";

describe("the month key", () => {
  it("is the calendar month of a date", () => {
    expect(monthKeyOf(new Date(2026, 7, 26))).toBe("2026-08");
  });

  it("reads back out of a storage entry name", () => {
    expect(monthKeyFromEntryKey("daily-log-month-2026-08")).toBe("2026-08");
  });

  it("is not a week entry, whatever the prefix looks like", () => {
    expect(monthKeyFromEntryKey("planner-2026-W35")).toBeNull();
    expect(monthKeyFromEntryKey("planner-color-labels")).toBeNull();
    expect(monthKeyFromEntryKey("daily-log-unreadable-2026-W35")).toBeNull();
  });

  it("rejects twelve-plus and zero, which look like months and are not", () => {
    expect(monthKeyFromEntryKey("daily-log-month-2026-13")).toBeNull();
    expect(monthKeyFromEntryKey("daily-log-month-2026-00")).toBeNull();
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-08")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/test/month-notes.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/month-notes"`.

- [ ] **Step 3: Write the module**

```ts
import { format, isValid, parse } from "date-fns";
import { listKeys, readItem, removeItem, writeItem } from "./storage";

/**
 * Notes on a month.
 *
 * This is the first thing this app stores that is not a week, and the two
 * decisions that follow from that are both about damage.
 *
 * **The prefix is not `planner-`.** Weeks and settings already share that
 * prefix, and the overlap is what made `exportAsCSV` collect two settings as
 * weeks and die on `week.days is not iterable` — for every user, on every run.
 * A new shape stays clear of it rather than relying on a shape match to sort it
 * out afterwards.
 *
 * **The text is stored raw, not as JSON.** `readItem` returns a string or null,
 * so `?? ""` is the entire repair path: a stored note cannot be malformed, only
 * absent. Every other reader of storage here has to assume damage because every
 * other reader parses something. This one does not parse.
 */

const PREFIX = "daily-log-month-";

// A calendar month, not merely four digits and two more: 2026-13 is not a month
// and must never become a key. Written once and used three ways so that "what a
// month key is" has one definition.
const MONTH = "\\d{4}-(?:0[1-9]|1[0-2])";
const MONTH_ENTRY = new RegExp(`^${PREFIX}(${MONTH})$`);
const MONTH_KEY = new RegExp(`^${MONTH}$`);

export function monthKeyOf(date: Date): string {
  return format(date, "yyyy-MM");
}

/** Whether a string is a month key. For validating what arrives in a backup. */
export function isMonthKey(value: string): boolean {
  return MONTH_KEY.test(value);
}

/**
 * The month key inside a storage entry name, or null when the entry is not a
 * month note. The mirror of `weekKeyFromEntryKey`, and the only place the
 * entry format is known.
 */
export function monthKeyFromEntryKey(entryKey: string): string | null {
  return entryKey.match(MONTH_ENTRY)?.[1] ?? null;
}

/** "August 2026", for a field label and a search result row. */
export function monthLabel(monthKey: string): string {
  const date = parse(monthKey, "yyyy-MM", new Date());
  return isValid(date) ? format(date, "MMMM yyyy") : monthKey;
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/test/month-notes.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Mutation-test the regex**

Change `MONTH` to `"\\d{4}-\\d{2}"` and re-run. Expected: the "rejects twelve-plus and zero" test FAILS. Restore the line and confirm the file changed back — a mutation that silently fails to apply and one that survives look identical in the output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/month-notes.ts src/test/month-notes.test.ts
git commit -m "Add the month-note key format, clear of the planner- prefix"
```

---

### Task 2: Load and save one month

**Files:**
- Modify: `src/lib/month-notes.ts`
- Test: `src/test/month-notes.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/test/month-notes.test.ts`, and add `beforeEach`, `vi` and `afterEach` to the vitest import plus `loadMonthNote`, `saveMonthNote` to the module import:

```ts
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("one month's note", () => {
  it("loads back what was saved", () => {
    saveMonthNote("2026-08", "Teaching ate the month.");

    expect(loadMonthNote("2026-08")).toBe("Teaching ate the month.");
  });

  it("is an empty string when nothing was ever written", () => {
    expect(loadMonthNote("2026-08")).toBe("");
  });

  it("stores under a key of its own, not a week's", () => {
    saveMonthNote("2026-08", "Something");

    expect(localStorage.getItem("daily-log-month-2026-08")).toBe("Something");
  });

  it("removes the key when the note is emptied, rather than storing nothing", () => {
    saveMonthNote("2026-08", "Something");

    saveMonthNote("2026-08", "");

    expect(localStorage.getItem("daily-log-month-2026-08")).toBeNull();
  });

  it("treats whitespace as emptied — it is the absence of a note", () => {
    saveMonthNote("2026-08", "Something");

    saveMonthNote("2026-08", "   \n  ");

    expect(localStorage.getItem("daily-log-month-2026-08")).toBeNull();
  });

  it("keeps the whitespace inside a real note, which is the user's", () => {
    saveMonthNote("2026-08", "  Went well.\n\n  Change the Fridays.  ");

    expect(loadMonthNote("2026-08")).toBe("  Went well.\n\n  Change the Fridays.  ");
  });

  it("gives an empty note rather than throwing when storage is denied", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });

    expect(loadMonthNote("2026-08")).toBe("");
  });

  it("reports false rather than throwing when storage is full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });

    expect(saveMonthNote("2026-08", "Something")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/test/month-notes.test.ts`
Expected: FAIL — `saveMonthNote is not a function`.

- [ ] **Step 3: Add the two functions to `src/lib/month-notes.ts`**

```ts
/** The stored note, or "" when there is none. This is the whole repair path. */
export function loadMonthNote(monthKey: string): string {
  return readItem(PREFIX + monthKey) ?? "";
}

/**
 * Store the note, or remove it when there is nothing left of it.
 *
 * The two tests are deliberately not the same. All-whitespace is the *absence*
 * of a note, and keeping `"   "` would be a third state meaning what the other
 * two already mean. But once there is a note, its leading and trailing
 * whitespace belongs to the user — prose has blank lines in it, and a save that
 * quietly reformatted what was typed would be the worse bug.
 *
 * Returns whether the write landed, as `saveWeek` does. That return value is
 * what stops a storage failure being silent.
 */
export function saveMonthNote(monthKey: string, text: string): boolean {
  const entryKey = PREFIX + monthKey;
  return text.trim() === "" ? removeItem(entryKey) : writeItem(entryKey, text);
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/test/month-notes.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Mutation-test the trim rule**

Change `text.trim() === ""` to `text === ""` and re-run. Expected: "treats whitespace as emptied" FAILS. Then change `writeItem(entryKey, text)` to `writeItem(entryKey, text.trim())`. Expected: "keeps the whitespace inside a real note" FAILS. Restore both and confirm the file changed back.

- [ ] **Step 6: Commit**

```bash
git add src/lib/month-notes.ts src/test/month-notes.test.ts
git commit -m "Load and save a month note; emptying it removes the key"
```

---

### Task 3: Every month at once, and proof it is not a week

**Files:**
- Modify: `src/lib/month-notes.ts`
- Test: `src/test/month-notes.test.ts`, `src/test/all-weeks.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/test/month-notes.test.ts` (add `loadAllMonthNotes` to the import):

```ts
describe("every month at once", () => {
  it("keys each note by its month, without the entry prefix", () => {
    saveMonthNote("2026-08", "August");
    saveMonthNote("2026-09", "September");

    expect(loadAllMonthNotes()).toEqual({ "2026-08": "August", "2026-09": "September" });
  });

  it("leaves out weeks and settings, which is the whole point of the prefix", () => {
    saveMonthNote("2026-08", "August");
    localStorage.setItem("planner-2026-W35", JSON.stringify({ days: [] }));
    localStorage.setItem("planner-color-labels", JSON.stringify({ 1: "Thesis" }));
    localStorage.setItem("planner-show-weekends", "false");

    expect(Object.keys(loadAllMonthNotes())).toEqual(["2026-08"]);
  });

  it("is empty rather than throwing when storage cannot be enumerated", () => {
    vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });

    expect(loadAllMonthNotes()).toEqual({});
  });
});
```

Append to `src/test/all-weeks.test.ts` inside the existing `describe("loadAllWeeks", ...)`:

```ts
  it("leaves out a month note, which is not a week and never was", () => {
    localStorage.setItem("planner-2026-W35", JSON.stringify(createEmptyWeek(WEEK)));
    localStorage.setItem("daily-log-month-2026-08", "Teaching ate the month.");

    expect(Object.keys(loadAllWeeks())).toEqual(["2026-W35"]);
  });
```

- [ ] **Step 2: Run them and confirm the first three fail**

Run: `npx vitest run src/test/month-notes.test.ts src/test/all-weeks.test.ts`
Expected: the three month-notes tests FAIL with `loadAllMonthNotes is not a function`. **The `all-weeks` test passes immediately** — `loadAllWeeks` is anchored on `^planner-(\d{4}-W\d{2})$` and already excludes this by construction. That is the point: it is a regression guard on a property that already holds, not a change.

- [ ] **Step 3: Add the scan to `src/lib/month-notes.ts`**

```ts
/**
 * Every stored month note, keyed by month.
 *
 * Mirrors `loadAllWeeks`, and exists for the same reason: so that export does
 * not reimplement the scan. Entries are matched by shape rather than by prefix
 * scanning, which is the rule that loop was rewritten to enforce.
 */
export function loadAllMonthNotes(): Record<string, string> {
  const notes: Record<string, string> = {};
  for (const entryKey of listKeys()) {
    const monthKey = monthKeyFromEntryKey(entryKey);
    if (!monthKey) continue;
    const text = readItem(entryKey);
    // An empty entry should not exist — saveMonthNote removes rather than
    // stores one — but a hand-edited store can hold anything, and shipping "" in
    // a backup would put a state back that this module deliberately has no name
    // for.
    if (text === null || text === "") continue;
    notes[monthKey] = text;
  }
  return notes;
}
```

- [ ] **Step 4: Run and confirm all pass**

Run: `npx vitest run src/test/month-notes.test.ts src/test/all-weeks.test.ts`
Expected: PASS, 15 tests in `month-notes`, and `all-weeks` up by one.

- [ ] **Step 5: Mutation-test the filter**

Change `if (!monthKey) continue;` to `const monthKey = entryKey;` above it (i.e. take every key). Expected: "leaves out weeks and settings" FAILS. Restore and confirm the file changed back.

- [ ] **Step 6: Commit**

```bash
git add src/lib/month-notes.ts src/test/month-notes.test.ts src/test/all-weeks.test.ts
git commit -m "Collect every month note; assert one is never mistaken for a week"
```

---

### Task 4: The field

**Files:**
- Create: `src/components/planner/MonthNotes.tsx`
- Test: `src/test/month-notes-view.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import MonthNotes from "@/components/planner/MonthNotes";
import { loadMonthNote, saveMonthNote } from "@/lib/month-notes";
import { toast } from "@/hooks/use-toast";

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toasts: [] }) }));

const field = () => screen.getByRole("textbox", { name: /notes and reflections/i });

const type = (value: string) => fireEvent.change(field(), { target: { value } });

beforeEach(() => {
  localStorage.clear();
  vi.mocked(toast).mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the month notes field", () => {
  it("names the month it belongs to", () => {
    render(<MonthNotes monthKey="2026-08" />);

    expect(screen.getByRole("textbox", { name: "Notes and reflections for August 2026" }))
      .toBeInTheDocument();
  });

  it("shows what was already stored for that month", () => {
    saveMonthNote("2026-08", "Teaching ate the month.");

    render(<MonthNotes monthKey="2026-08" />);

    expect(field()).toHaveValue("Teaching ate the month.");
  });

  it("saves as it is typed, with no timer to wait out", () => {
    render(<MonthNotes monthKey="2026-08" />);

    type("Fridays are the problem.");

    expect(loadMonthNote("2026-08")).toBe("Fridays are the problem.");
  });

  it("does not print when it is empty", () => {
    const { container } = render(<MonthNotes monthKey="2026-08" />);

    expect(container.firstElementChild).toHaveClass("no-print");
  });

  it("prints once it has something in it", () => {
    const { container } = render(<MonthNotes monthKey="2026-08" />);

    type("Worth keeping.");

    expect(container.firstElementChild).not.toHaveClass("no-print");
  });

  it("warns once when storage refuses, not once per keystroke", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });
    render(<MonthNotes monthKey="2026-08" />);

    type("a");
    type("ab");
    type("abc");

    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("warns again when saving fails after recovering", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    setItem.mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });
    render(<MonthNotes monthKey="2026-08" />);
    type("a");

    setItem.mockRestore();
    type("ab");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });
    type("abc");

    expect(toast).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/test/month-notes-view.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/planner/MonthNotes"`.

- [ ] **Step 3: Write the component**

```tsx
import React, { useLayoutEffect, useRef, useState } from "react";
import { loadMonthNote, monthLabel, saveMonthNote } from "@/lib/month-notes";
import { toast } from "@/hooks/use-toast";

interface MonthNotesProps {
  /**
   * "yyyy-MM". The caller passes this as `key` as well, which is what reseeds
   * the field when the user pages to another month.
   */
  monthKey: string;
}

/**
 * What the user made of the month, under the evidence for it.
 *
 * **Nothing here reads storage from an effect.** The initial value comes from a
 * lazy `useState` initialiser and a change of month remounts the component via
 * its `key`, exactly as the carry bar does with `key={monday}`. An effect that
 * seeds state from storage is one edit away from an effect that writes it back,
 * which is how `DailyView` once overwrote every colour label it had just read.
 *
 * Saving is not debounced. One short string under its own key is a cheap write,
 * and paying for it outright removes the entire `pendingRef` problem — there is
 * no timer to flush on unmount, on leaving the month, or on `pagehide`, and so
 * no way for the last sentence typed to be the one lost.
 */
const MonthNotes: React.FC<MonthNotesProps> = ({ monthKey }) => {
  const [text, setText] = useState(() => loadMonthNote(monthKey));
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Whether the last write was refused. A storage failure persists, so warning
  // on every keystroke would bury the message under itself; warn on the
  // transition into failure instead, and again if it recurs after recovering.
  // The same rule, ref and wording as StudyPlanner.flushPendingSave.
  const saveFailedRef = useRef(false);

  // Grow to fit the text.
  //
  // **This is not the mount-write pattern and must not be deleted as if it
  // were.** That rule is about effects which *persist state*; this one measures
  // a DOM node and sets a DOM property, and persists nothing.
  //
  // It is also load-bearing rather than cosmetic. The print block resets
  // overflow on the `.overflow-*` utility classes, but a textarea scrolls by its
  // own nature rather than through those, so a fixed-height one prints only the
  // lines that happen to be in view and silently drops the rest.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const change = (value: string) => {
    setText(value);
    const saved = saveMonthNote(monthKey, value);
    if (!saved && !saveFailedRef.current) {
      toast({
        title: "Your notes are not being saved",
        description:
          "This browser's storage is full or unavailable. Export a backup before closing the tab.",
        variant: "destructive",
      });
    }
    saveFailedRef.current = !saved;
  };

  return (
    // An empty month prints nothing at all. A blank frame under the tag bars
    // reads as something that failed to load, which is what TimeByTag returning
    // null already avoids for itself.
    <div className={`mt-6 ${text.trim() === "" ? "no-print" : ""}`}>
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Notes and reflections
      </h3>
      <textarea
        ref={areaRef}
        value={text}
        onChange={(e) => change(e.target.value)}
        aria-label={`Notes and reflections for ${monthLabel(monthKey)}`}
        placeholder="What went well this month? What would you change?"
        rows={3}
        className="w-full resize-none overflow-hidden text-xs bg-transparent border border-border rounded-md px-2 py-1.5 outline-none text-foreground placeholder:text-muted-foreground/50"
      />
    </div>
  );
};

export default MonthNotes;
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/test/month-notes-view.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Mutation-test the warn-once rule and the print rule**

Change `if (!saved && !saveFailedRef.current)` to `if (!saved)`. Expected: "warns once when storage refuses" FAILS with 3 calls. Restore. Then change `text.trim() === "" ? "no-print" : ""` to `""`. Expected: "does not print when it is empty" FAILS. Restore and confirm the file changed back both times.

- [ ] **Step 6: Commit**

```bash
git add src/components/planner/MonthNotes.tsx src/test/month-notes-view.test.tsx
git commit -m "Add the month notes field, saving where the change happens"
```

---

### Task 5: Mount it under the tag bars

**Files:**
- Modify: `src/components/planner/MonthlyView.tsx`
- Test: `src/test/month-notes-view.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/test/month-notes-view.test.tsx`, adding these imports at the top of the file:

```tsx
import MonthlyView from "@/components/planner/MonthlyView";
import { createEmptyWeek, getWeekKey } from "@/lib/planner-data";
```

No `ThemeProvider`. `MonthlyView` calls `useTheme`, but `theme-context.tsx:144`
gives `createContext` a real default value rather than throwing on a missing
provider, so `month-colour.test.tsx` renders it bare and this follows suit.

```tsx
const AUG = new Date(2026, 7, 26); // Wed 26 Aug 2026
const SEP = new Date(2026, 8, 16); // Wed 16 Sep 2026

const renderMonth = (date: Date) =>
  render(<MonthlyView currentDate={date} onSelectDay={vi.fn()} />);

describe("the month notes field in the month view", () => {
  it("sits below the time-blocked-by-tag bars", () => {
    const week = createEmptyWeek(AUG);
    const day = week.days.find((d) => d.date === "2026-08-26")!;
    for (let i = 0; i < 6; i++) day.timeBlocks[0][i] = 1;
    localStorage.setItem(`planner-${getWeekKey(AUG)}`, JSON.stringify(week));

    const { container } = renderMonth(AUG);

    const headings = [...container.querySelectorAll("h3")].map((h) => h.textContent);
    expect(headings).toEqual(["Time blocked by tag", "Notes and reflections"]);
  });

  it("is there even when nothing was blocked, so TimeByTag renders nothing", () => {
    renderMonth(AUG);

    expect(screen.getByRole("textbox", { name: /August 2026/ })).toBeInTheDocument();
    expect(screen.queryByText("Time blocked by tag")).not.toBeInTheDocument();
  });

  it("shows the month it is looking at, not the one before", () => {
    saveMonthNote("2026-08", "August went badly.");
    saveMonthNote("2026-09", "September went better.");

    const { rerender } = renderMonth(AUG);
    expect(field()).toHaveValue("August went badly.");

    rerender(<MonthlyView currentDate={SEP} onSelectDay={vi.fn()} />);

    expect(field()).toHaveValue("September went better.");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/test/month-notes-view.test.tsx`
Expected: the three new tests FAIL — no textbox is found, because `MonthlyView` does not render one.

The third is the one that matters. It is the test that would catch a `MonthNotes` seeded by an effect on `monthKey` rather than remounted by `key`, and it is why it re-renders rather than mounting twice.

- [ ] **Step 3: Modify `src/components/planner/MonthlyView.tsx`**

Add to the imports at the top:

```tsx
import MonthNotes from "./MonthNotes";
import { monthKeyOf } from "@/lib/month-notes";
```

Add beside the other derived values near the top of the component body, under `const allDays = ...`:

```tsx
  const monthKey = monthKeyOf(currentDate);
```

Replace the `<TimeByTag ... />` line and what follows it with:

```tsx
      <TimeByTag from={monthStart} to={monthEnd} />

      {/* A sibling of TimeByTag, not a child: TimeByTag renders null when
          nothing is blocked in the range, and a month with no painted blocks is
          precisely a month worth writing about.

          The key is what reseeds the field when the user pages to another
          month — remounting rather than an effect, so nothing reads storage
          during an update and nothing can write on mount. */}
      <MonthNotes key={monthKey} monthKey={monthKey} />
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run src/test/month-notes-view.test.tsx src/test/month-colour.test.tsx src/test/time-by-tag.test.tsx`
Expected: PASS, 10 tests in `month-notes-view` and no change to the other two files.

- [ ] **Step 5: Mutation-test the remount**

Remove `key={monthKey}` from the `MonthNotes` element. Expected: "shows the month it is looking at, not the one before" FAILS, still showing August's note. Restore and confirm the file changed back. This is the single most valuable mutation in the plan — without the key, the component keeps its state across months and quietly saves one month's reflection under another's key.

- [ ] **Step 6: Commit**

```bash
git add src/components/planner/MonthlyView.tsx src/test/month-notes-view.test.tsx
git commit -m "Mount the month notes below the tag bars, remounted per month"
```

---

### Task 6: Carry the notes out in a backup

**Files:**
- Modify: `src/lib/export-import.ts`
- Test: `src/test/month-notes-backup.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createEmptyWeek, getWeekKey } from "@/lib/planner-data";
import { exportAllData } from "@/lib/export-import";
import { saveMonthNote } from "@/lib/month-notes";

const AUG = new Date(2026, 7, 26); // Wed 26 Aug 2026

const storeWeek = () =>
  localStorage.setItem(`planner-${getWeekKey(AUG)}`, JSON.stringify(createEmptyWeek(AUG)));

beforeEach(() => localStorage.clear());

describe("a backup carries the month notes", () => {
  it("includes them beside the weeks", () => {
    storeWeek();
    saveMonthNote("2026-08", "Teaching ate the month.");

    expect(exportAllData().monthNotes).toEqual({ "2026-08": "Teaching ate the month." });
  });

  it("includes the field even when no month has a note", () => {
    storeWeek();

    expect(exportAllData().monthNotes).toEqual({});
  });

  it("does not collect a note as if it were a week", () => {
    storeWeek();
    saveMonthNote("2026-08", "Teaching ate the month.");

    expect(Object.keys(exportAllData().weeks)).toEqual(["2026-W35"]);
  });

  it("stays at version 2, so an older build can still read the file", () => {
    expect(exportAllData().version).toBe(2);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/test/month-notes-backup.test.ts`
Expected: the first three FAIL — `expected undefined to deeply equal {...}`. The version test passes already.

- [ ] **Step 3: Modify `src/lib/export-import.ts`**

Add to the imports:

```ts
import { isMonthKey, loadAllMonthNotes, saveMonthNote } from "./month-notes";
```

Add the field to `ExportData`, between `weeks` and `settings`:

```ts
export interface ExportData {
  version: 2;
  exportedAt: string;
  weeks: Record<string, WeekData>;
  /**
   * Keyed "yyyy-MM". A month with no note is absent, never an empty string.
   *
   * A sibling of `weeks` rather than a member of `settings`, because it is
   * content: `settings` is what travels *besides* the weeks, and the colour
   * labels are there because they are the mapping the stored numbers are read
   * through, not because they are prose.
   */
  monthNotes: Record<string, string>;
  settings: ExportSettings;
}
```

Add the line to `exportAllData`'s returned object, after `weeks`:

```ts
    // Written unconditionally, like settings: an empty object and an absent one
    // mean the same thing on read, and writing it always keeps the shape of an
    // export predictable.
    monthNotes: loadAllMonthNotes(),
```

**The version stays at 2.** Add this above `const READABLE_VERSIONS`:

```ts
/**
 * Versions this build can read. Writing is always the newest.
 *
 * Adding `monthNotes` deliberately did not move the number. Bumping to 3 would
 * make a backup written today refused outright by an older cached build, losing
 * the weeks as well as the notes; leaving it at 2 lets that build restore the
 * weeks and the labels and silently drop the notes. Both lose something and the
 * smaller loss was chosen — but the reasoning should be revisited rather than
 * inherited if a third stored shape is ever added, because the unversioned
 * surface grows with each one.
 */
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run src/test/month-notes-backup.test.ts src/test/export-import.test.ts src/test/label-backup.test.ts`
Expected: PASS, 4 new tests and no change to the other two files.

- [ ] **Step 5: Mutation-test the collection**

Change `monthNotes: loadAllMonthNotes(),` to `monthNotes: {},`. Expected: "includes them beside the weeks" FAILS. Restore and confirm the file changed back.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export-import.ts src/test/month-notes-backup.test.ts
git commit -m "Carry month notes out in a backup, beside the weeks"
```

---

### Task 7: Restore the notes from a backup

**Files:**
- Modify: `src/lib/export-import.ts`
- Test: `src/test/month-notes-backup.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/test/month-notes-backup.test.ts`, adding `exportAsJSON, importFromJSON` to the export-import import and `loadMonthNote` to the month-notes import:

```ts
describe("a restore brings the month notes back", () => {
  it("round-trips them byte-identical alongside the weeks", () => {
    storeWeek();
    saveMonthNote("2026-08", "  Teaching ate the month.\n\n  Fix the Fridays.  ");
    const backup = exportAsJSON();
    localStorage.clear();

    const result = importFromJSON(backup);

    expect(result.success).toBe(true);
    expect(loadMonthNote("2026-08")).toBe("  Teaching ate the month.\n\n  Fix the Fridays.  ");
  });

  it("reads an older file with no monthNotes at all, and touches nothing", () => {
    saveMonthNote("2026-08", "Already here.");
    const old = JSON.stringify({
      version: 2,
      exportedAt: "2026-08-01T00:00:00.000Z",
      weeks: { "2026-W35": createEmptyWeek(AUG) },
      settings: { colorLabels: {} },
    });

    expect(importFromJSON(old).success).toBe(true);
    expect(loadMonthNote("2026-08")).toBe("Already here.");
  });

  it("leaves a stored month the file says nothing about alone", () => {
    saveMonthNote("2026-07", "July, not mentioned in the file.");
    storeWeek();
    saveMonthNote("2026-08", "August.");
    const backup = exportAsJSON();
    saveMonthNote("2026-08", "Overwrite me.");

    importFromJSON(backup);

    expect(loadMonthNote("2026-07")).toBe("July, not mentioned in the file.");
    expect(loadMonthNote("2026-08")).toBe("August.");
  });

  it("skips a note that is not text, and imports the rest", () => {
    const file = JSON.stringify({
      version: 2,
      exportedAt: "2026-08-01T00:00:00.000Z",
      weeks: { "2026-W35": createEmptyWeek(AUG) },
      monthNotes: { "2026-08": 42, "2026-09": "September survived." },
      settings: { colorLabels: {} },
    });

    expect(importFromJSON(file).success).toBe(true);
    expect(loadMonthNote("2026-08")).toBe("");
    expect(loadMonthNote("2026-09")).toBe("September survived.");
  });

  it("skips a key that is not a month, which must never become a storage key", () => {
    const file = JSON.stringify({
      version: 2,
      exportedAt: "2026-08-01T00:00:00.000Z",
      weeks: { "2026-W35": createEmptyWeek(AUG) },
      monthNotes: { "2026-13": "There is no thirteenth month.", "2026-09": "Fine." },
      settings: { colorLabels: {} },
    });

    importFromJSON(file);

    expect(localStorage.getItem("daily-log-month-2026-13")).toBeNull();
    expect(loadMonthNote("2026-09")).toBe("Fine.");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/test/month-notes-backup.test.ts`
Expected: the round-trip, the not-text and the not-a-month tests FAIL — nothing writes the notes, so `loadMonthNote` gives `""`. The other two pass already.

- [ ] **Step 3: Modify `src/lib/export-import.ts`**

Add this beside `usableLabels` at the bottom of the file:

```ts
/**
 * The month notes from an untrusted file, minus anything unusable.
 *
 * Modelled on `usableLabels` and for the same reason: whatever passes through
 * here is written straight into storage under a key built from the object's own
 * property name. A key that is not a month must never become a storage key.
 */
function usableMonthNotes(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};
  const out: Record<string, string> = {};
  for (const [monthKey, text] of Object.entries(value)) {
    if (typeof text !== "string" || text.trim() === "") continue;
    if (!isMonthKey(monthKey)) continue;
    out[monthKey] = text;
  }
  return out;
}
```

In `importFromJSON`, insert this immediately after the `if (written < staged.length) { ... }` block and before the colour-labels comment:

```ts
  // After the weeks, and merged rather than replaced — the same rule the labels
  // follow. Because each month is its own key, the merge needs no read: writing
  // the months the file names leaves every month it does not name alone.
  //
  // A refused note write does not fail the restore, for the reason a refused
  // label write does not: the weeks are what the user came for, and a restore
  // that saved every one of them must not be reported as a failure because a
  // note would not fit.
  for (const [monthKey, text] of Object.entries(usableMonthNotes(parsed.monthNotes))) {
    saveMonthNote(monthKey, text);
  }
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run src/test/month-notes-backup.test.ts src/test/import-validation.test.ts src/test/export-import.test.ts`
Expected: PASS, 9 tests in `month-notes-backup` and no change to the other two files.

- [ ] **Step 5: Mutation-test the two guards**

Remove `if (!isMonthKey(monthKey)) continue;`. Expected: "skips a key that is not a month" FAILS. Restore. Then change `typeof text !== "string"` to `text == null`. Expected: "skips a note that is not text" FAILS. Restore and confirm the file changed back both times.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export-import.ts src/test/month-notes-backup.test.ts
git commit -m "Restore month notes from a backup, merged and shape-checked"
```

---

### Task 8: The match becomes a union

**Files:**
- Modify: `src/lib/search.ts`
- Test: `src/test/search.test.ts`

This task changes types and adds one field. It must leave every existing search test passing untouched.

- [ ] **Step 1: Write the failing test**

Append to `src/test/search.test.ts`, inside the existing `describe("searchWeeks", ...)`:

```ts
  it("stamps every match as a week match, so a month match can be told apart", () => {
    store("2026-W35", fullWeek(AUG));

    expect(searchWeeks("viva").map((m) => m.kind)).toEqual(["week"]);
  });
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/test/search.test.ts`
Expected: FAIL — `expected [ undefined ] to deeply equal [ 'week' ]`.

- [ ] **Step 3: Modify `src/lib/search.ts`**

Replace the `SearchField` type and the `SearchMatch` interface at the top with:

```ts
/** Which field a week match came from, for the label a result row shows. */
export type WeekField = "goal" | "review" | "action" | "priority" | "memo";

export type SearchField = WeekField | "month";

export interface WeekMatch {
  kind: "week";
  weekKey: string;
  /** ISO Monday of the week, which is what a click sets currentDate to. */
  monday: string;
  field: WeekField;
  /** Present only for day-level matches — a memo or a priority. */
  dayIndex?: number;
  snippet: string;
}

export interface MonthMatch {
  kind: "month";
  /** "yyyy-MM". A month note has no week and no Monday, and never will. */
  monthKey: string;
  field: "month";
  snippet: string;
}

/**
 * A discriminated union rather than one shape with optional fields.
 *
 * `tsconfig.app.json` sets `"strict": false`, so `strictNullChecks` is off and
 * an optional `monday?: string` would be no protection whatever — the compiler
 * would hand a `null` straight to `parse(monday, ...)` in the dialog. Narrowing
 * on a literal `kind` still works with `strict` off, which makes it the one
 * mechanism here that actually holds.
 */
export type SearchMatch = WeekMatch | MonthMatch;
```

Change `searchWeeks`'s signature and its `matches` declaration to `WeekMatch[]`:

```ts
export function searchWeeks(query: string): WeekMatch[] {
```

```ts
  const matches: WeekMatch[] = [];
```

Change the `take` helper's `field` parameter type and the pushed object:

```ts
    const take = (value: unknown, field: WeekField, dayIndex?: number) => {
      const text = asText(value);
      const at = text.toLowerCase().indexOf(needle);
      if (at === -1) return;
      matches.push({
        kind: "week",
        weekKey,
        monday,
        field,
        ...(dayIndex === undefined ? {} : { dayIndex }),
        snippet: snippetAround(text, at, needle.length),
      });
    };
```

- [ ] **Step 4: Run and confirm everything passes**

Run: `npx vitest run src/test/search.test.ts src/test/search-dialog.test.tsx`
Expected: PASS. Every pre-existing assertion is field-level (`m.field`, `m.weekKey`, `m.monday`, `m.dayIndex`), so none of them change.

- [ ] **Step 5: Commit**

```bash
git add src/lib/search.ts src/test/search.test.ts
git commit -m "Make a search match a union, discriminated on kind"
```

---

### Task 9: Search the month notes

**Files:**
- Modify: `src/lib/search.ts`
- Test: `src/test/month-notes-search.test.tsx`

Created as `.tsx` even though this task's content is plain TypeScript — Task 10
adds JSX to the same file, and `vitest.config.ts` includes both extensions.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createEmptyWeek } from "@/lib/planner-data";
import { saveMonthNote } from "@/lib/month-notes";
import { searchAll, searchMonthNotes } from "@/lib/search";

const AUG = new Date(2026, 7, 26); // Wed 26 Aug 2026, week 2026-W35

function storeWeekWithGoal(key: string, date: Date, goal: string) {
  const week = createEmptyWeek(date);
  week.weekGoal = goal;
  localStorage.setItem(`planner-${key}`, JSON.stringify(week));
}

beforeEach(() => localStorage.clear());

describe("searchMonthNotes", () => {
  it("finds a query in a stored note and says which month", () => {
    saveMonthNote("2026-08", "Teaching ate the month.");

    const [match] = searchMonthNotes("teaching");

    expect(match.kind).toBe("month");
    expect(match.monthKey).toBe("2026-08");
    expect(match.field).toBe("month");
  });

  it("carries the surrounding text, as a week match does", () => {
    saveMonthNote("2026-08", "The thing that went wrong was the Friday supervision slot.");

    expect(searchMonthNotes("Friday")[0].snippet).toContain("Friday");
  });

  it("keeps the two-character minimum", () => {
    saveMonthNote("2026-08", "Teaching ate the month.");

    expect(searchMonthNotes("T")).toEqual([]);
    expect(searchMonthNotes("Te")).toHaveLength(1);
  });

  it("is case-insensitive, as the week search is", () => {
    saveMonthNote("2026-08", "Teaching ate the month.");

    expect(searchMonthNotes("TEACHING")).toHaveLength(1);
  });
});

describe("searchAll", () => {
  it("returns both kinds, each narrowable on kind alone", () => {
    storeWeekWithGoal("2026-W35", AUG, "Finish the chapter");
    saveMonthNote("2026-08", "Finish the chapter, really");

    const kinds = searchAll("Finish the chapter").map((m) => m.kind).sort();

    expect(kinds).toEqual(["month", "week"]);
  });

  it("sorts newest first, with a month note among the weeks of its own month", () => {
    // July week, August note, September week. The August note must land between
    // them, not at either end.
    storeWeekWithGoal("2026-W29", new Date(2026, 6, 15), "repeat");
    storeWeekWithGoal("2026-W38", new Date(2026, 8, 16), "repeat");
    saveMonthNote("2026-08", "repeat");

    const order = searchAll("repeat").map((m) =>
      m.kind === "week" ? m.weekKey : m.monthKey
    );

    expect(order).toEqual(["2026-W38", "2026-08", "2026-W29"]);
  });

  it("gives a month match no Monday and a week match no month key", () => {
    storeWeekWithGoal("2026-W35", AUG, "repeat");
    saveMonthNote("2026-08", "repeat");

    for (const match of searchAll("repeat")) {
      if (match.kind === "week") expect(match.monday).toBe("2026-08-24");
      else expect(match.monthKey).toBe("2026-08");
    }
    expect(searchAll("repeat")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/test/month-notes-search.test.tsx`
Expected: FAIL — `searchMonthNotes is not a function`.

- [ ] **Step 3: Modify `src/lib/search.ts`**

Add to the imports at the top:

```ts
import { loadAllMonthNotes } from "./month-notes";
```

Append to the end of the file:

```ts
/**
 * Every place the query appears in a month's notes.
 *
 * Unlike the weeks, these arrive as strings by construction — `loadAllMonthNotes`
 * reads them through `readItem`, which returns a string or nothing — so there is
 * no unrepaired-shape problem here and no field access to defend.
 */
export function searchMonthNotes(query: string): MonthMatch[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN_QUERY) return [];

  const matches: MonthMatch[] = [];
  for (const [monthKey, text] of Object.entries(loadAllMonthNotes())) {
    const at = text.toLowerCase().indexOf(needle);
    if (at === -1) continue;
    matches.push({
      kind: "month",
      monthKey,
      field: "month",
      snippet: snippetAround(text, at, needle.length),
    });
  }
  return matches;
}

/**
 * The date a match sorts on.
 *
 * A month note takes the first of its month, so it lands among the weeks of that
 * month rather than at either end of the list — which is where someone scanning
 * by date would look for it.
 */
const sortKey = (match: SearchMatch): string =>
  match.kind === "week" ? match.monday : `${match.monthKey}-01`;

/**
 * Everything the query matches, newest first. This is what the dialog calls.
 *
 * `searchWeeks` keeps its own sort because it stays independently exported and
 * tested, and re-sorting an already-sorted list costs nothing.
 */
export function searchAll(query: string): SearchMatch[] {
  return [...searchWeeks(query), ...searchMonthNotes(query)].sort((a, b) =>
    sortKey(b).localeCompare(sortKey(a))
  );
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run src/test/month-notes-search.test.tsx src/test/search.test.ts`
Expected: PASS, 7 new tests and no change to `search.test.ts`.

- [ ] **Step 5: Mutation-test the sort key**

Change `` `${match.monthKey}-01` `` to `match.monthKey`. Expected: "sorts newest first, with a month note among the weeks of its own month" FAILS — `"2026-08"` sorts before `"2026-08-24"`, so the note lands after the July week instead of between the two. Restore and confirm the file changed back.

- [ ] **Step 6: Commit**

```bash
git add src/lib/search.ts src/test/month-notes-search.test.tsx
git commit -m "Search the month notes, sorted among the weeks of their month"
```

---

### Task 10: A month result in the dialog

**Files:**
- Modify: `src/components/planner/SearchDialog.tsx`, `src/test/search-dialog.test.tsx:19-23`
- Test: `src/test/month-notes-search.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/test/month-notes-search.test.tsx`. Extend the existing vitest
import from Task 9 to `import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";`
and add these two lines:

```tsx
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SearchDialog from "@/components/planner/SearchDialog";
```

Then append:

```tsx
afterEach(cleanup);

const openDialog = () => {
  const onJump = vi.fn();
  const onJumpToMonth = vi.fn();
  render(<SearchDialog onJump={onJump} onJumpToMonth={onJumpToMonth} />);
  fireEvent.click(screen.getByRole("button", { name: /search all weeks/i }));
  return { onJump, onJumpToMonth };
};

const typeQuery = (value: string) =>
  fireEvent.change(screen.getByRole("textbox", { name: /search all weeks/i }), {
    target: { value },
  });

describe("a month note in the search dialog", () => {
  it("names the month and the field it came from", () => {
    saveMonthNote("2026-08", "Teaching ate the month.");
    openDialog();

    typeQuery("Teaching");

    expect(screen.getByText(/August 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Month notes/)).toBeInTheDocument();
  });

  it("opens the month, not a week", () => {
    saveMonthNote("2026-08", "Teaching ate the month.");
    const { onJump, onJumpToMonth } = openDialog();

    typeQuery("Teaching");
    fireEvent.click(screen.getByText("Teaching ate the month."));

    expect(onJumpToMonth).toHaveBeenCalledWith("2026-08");
    expect(onJump).not.toHaveBeenCalled();
  });

  it("still opens a week for a week result", () => {
    storeWeekWithGoal("2026-W35", AUG, "Finish the chapter");
    const { onJump, onJumpToMonth } = openDialog();

    typeQuery("Finish the chapter");
    fireEvent.click(screen.getByText("Finish the chapter"));

    expect(onJump).toHaveBeenCalledWith("2026-08-24");
    expect(onJumpToMonth).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/test/month-notes-search.test.tsx`
Expected: the three new tests FAIL — no "August 2026" row, because the dialog still calls `searchWeeks`.

- [ ] **Step 3: Modify `src/components/planner/SearchDialog.tsx`**

Change the search import line to:

```tsx
import { SearchField, SearchMatch, searchAll } from "@/lib/search";
import { monthLabel } from "@/lib/month-notes";
```

Add the month entry to `FIELD_LABEL`:

```tsx
const FIELD_LABEL: Record<SearchField, string> = {
  goal: "Goal",
  review: "Review",
  action: "Weekly action",
  priority: "Priority",
  memo: "Daily Log / Notes",
  month: "Month notes",
};
```

Change the component signature:

```tsx
const SearchDialog: React.FC<{
  onJump: (monday: string) => void;
  /**
   * Separate from `onJump` rather than a widened version of it. `onJump` is
   * shared with TagHistoryPanel, which navigates to weeks and only to weeks;
   * pushing a view discriminator into that caller to spare one prop here would
   * be the wrong trade.
   */
  onJumpToMonth: (monthKey: string) => void;
}> = ({ onJump, onJumpToMonth }) => {
```

Change the `matches` memo to call `searchAll`:

```tsx
  const matches = useMemo<SearchMatch[]>(
    () => (open && mode === "text" ? searchAll(query) : []),
    [query, open, mode]
  );
```

Add a second jump helper beside the existing one:

```tsx
  const jumpToMonth = (monthKey: string) => {
    onJumpToMonth(monthKey);
    setOpen(false);
    setQuery("");
  };
```

Update the description text:

```tsx
              ? "Goals, reviews, weekly actions, priorities, notes and month reflections."
```

Replace the result `<li>` and its button with:

```tsx
                  {matches.map((m, i) => (
                    // The index is enough: the list is recomputed wholesale on
                    // every query, and a month key and a week key are no longer
                    // strings from the same space.
                    <li key={`${m.kind}-${i}`}>
                      <button
                        type="button"
                        onClick={() =>
                          m.kind === "week" ? jump(m.monday) : jumpToMonth(m.monthKey)
                        }
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
                      >
                        <span className="block text-sm text-foreground">{m.snippet}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {m.kind === "week" ? weekLabel(m.monday) : monthLabel(m.monthKey)} ·{" "}
                          {FIELD_LABEL[m.field]}
                          {m.kind === "week" && m.dayIndex !== undefined
                            ? ` · ${dayName(m.monday, m.dayIndex)}`
                            : ""}
                        </span>
                      </button>
                    </li>
                  ))}
```

- [ ] **Step 4: Update the existing dialog test helper**

In `src/test/search-dialog.test.tsx`, replace the `open` helper:

```tsx
const open = (onJump = vi.fn()) => {
  render(<SearchDialog onJump={onJump} onJumpToMonth={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
  return onJump;
};
```

- [ ] **Step 5: Run and confirm everything passes**

Run: `npx vitest run src/test/month-notes-search.test.tsx src/test/search-dialog.test.tsx src/test/tag-history-dialog.test.tsx`
Expected: PASS, 10 tests in `month-notes-search` and no change to the other two files.

- [ ] **Step 6: Mutation-test the routing**

Change the `onClick` to `() => jump(m.kind === "week" ? m.monday : m.monthKey)`. Expected: "opens the month, not a week" FAILS — `onJumpToMonth` is never called. Restore and confirm the file changed back. This is the mutation that guards the failure named in the spec's Risks: a result routed through the wrong callback lands the user in the right date and the wrong view, which reads as a rendering bug.

- [ ] **Step 7: Commit**

```bash
git add src/components/planner/SearchDialog.tsx src/test/month-notes-search.test.tsx src/test/search-dialog.test.tsx
git commit -m "Show month notes in search and open the month for them"
```

---

### Task 11: Wire the month jump

**Files:**
- Modify: `src/components/planner/StudyPlanner.tsx:313-318`
- Test: `src/test/month-notes-search.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/test/month-notes-search.test.tsx`, adding these lines at the top
(the `vi.mock` must be at module scope — it is hoisted):

```tsx
import StudyPlanner from "@/components/planner/StudyPlanner";

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toasts: [] }) }));
```

No `ThemeProvider`: `autosave.test.tsx` renders `<StudyPlanner />` bare, for the
reason given in Task 5.

```tsx
describe("clicking a month result in the app", () => {
  it("switches to the month view and lands on that month", () => {
    saveMonthNote("2026-08", "Teaching ate the month.");
    render(<StudyPlanner />);

    fireEvent.click(screen.getByRole("button", { name: /search all weeks/i }));
    typeQuery("Teaching");
    fireEvent.click(screen.getByText("Teaching ate the month."));

    // The notes field, not the month heading. It proves both halves at once —
    // only the month view renders it, and its label names the month — where a
    // heading assertion would pass on the right view showing the wrong month.
    expect(
      screen.getByRole("textbox", { name: "Notes and reflections for August 2026" })
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/test/month-notes-search.test.tsx -t "switches to the month view"`
Expected: FAIL — either a missing-prop crash or the weekly view still showing, depending on how React renders the undefined callback.

- [ ] **Step 3: Modify `src/components/planner/StudyPlanner.tsx`**

Replace the `<SearchDialog ... />` element at line 313 with:

```tsx
          <SearchDialog
            onJump={(monday) => {
              setCurrentDate(parse(monday, "yyyy-MM-dd", new Date()));
              setViewMode("weekly");
            }}
            // A month result opens the month view, so it cannot ride onJump —
            // that handler hardcodes the weekly view, and TagHistoryPanel shares
            // it. The first of the month is an arbitrary but stable day inside
            // the month, which is all MonthlyView reads from currentDate.
            onJumpToMonth={(monthKey) => {
              setCurrentDate(parse(`${monthKey}-01`, "yyyy-MM-dd", new Date()));
              setViewMode("monthly");
            }}
          />
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run src/test/month-notes-search.test.tsx src/test/carry-bar.test.tsx src/test/today.test.tsx`
Expected: PASS, 11 tests in `month-notes-search` and no change to the other two files. `carry-bar.test.tsx` is run because it finds the week chevrons positionally — this change adds no button, and that run proves it.

- [ ] **Step 5: Mutation-test the view switch**

Change `setViewMode("monthly")` to `setViewMode("weekly")`. Expected: "switches to the month view and lands on that month" FAILS. Restore and confirm the file changed back.

- [ ] **Step 6: Commit**

```bash
git add src/components/planner/StudyPlanner.tsx src/test/month-notes-search.test.tsx
git commit -m "Open the month view when a month note is clicked in search"
```

---

### Task 12: Full verification and a look in a browser

**Files:** none changed unless something fails.

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: PASS. Record the exact test and file counts — Task 13 writes them into `CLAUDE.md`, and a guess there is worse than no number.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors and 10 warnings, unchanged. Any *error* is new and must be fixed. Do not "fix" the ten pre-existing warnings; they are in `src/components/ui/*`, `MonthlyView.tsx` and `theme-context.tsx` and are documented as expected.

Note: `MonthlyView.tsx` already carries a `react-hooks/exhaustive-deps` warning for its `weekCache` memo. Adding `monthKey` must not add a second one — `monthKeyOf(currentDate)` is a plain call, not a hook, so it will not.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Look at it**

Run: `npm run dev` and open `http://localhost:8080/Daily-Log/` — note the base path; the app does not serve at `/`.

jsdom sees no layout and no colour, so these are the things the suite cannot tell you and you must check by eye:

1. Switch to the month view. The notes field sits under the tag bars, full width, and is not crushed against them.
2. Type several lines. **The field grows as you type** and never shows its own scrollbar. This is the auto-grow, and it is the thing most likely to be subtly wrong.
3. With four or five lines in it, print to PDF (Ctrl+P). Every line appears; nothing is cut off at the bottom of the box. The box's border is gone, as the print CSS strips borders from `textarea`.
4. Empty the field and print again. The heading and the field are both absent, not an empty frame.
5. Toggle dark mode and confirm the field's border and placeholder are legible in both.
6. Search for a word you typed. The result row reads `August 2026 · Month notes`, and clicking it lands on the month view for August.

- [ ] **Step 5: Commit anything the browser found**

Only if steps 1–6 turned something up. If they did, add a test for it first where jsdom can see it at all.

---

### Task 13: The documentation

**Files:**
- Modify: `CLAUDE.md`, `docs/design-notes.md`

- [ ] **Step 1: Update the baselines in `CLAUDE.md`**

In the **Baselines** section, replace `471 tests across 48 files` with the exact counts recorded in Task 12 Step 1.

- [ ] **Step 2: Remove backlog item 1 and renumber**

In **Pick up here next — the backlog**:

- Delete the whole `### 1. Notes and reflections for the month` section. What shipped is `git log`, not this file — that rule is stated two sections above it.
- Renumber `### 2. Back up the "show weekends" preference...` to `### 1.` and `### 3. Repair a short subjects array...` to `### 2.`
- Change the intro sentence "it is the three numbered items below" to "the two numbered items below".
- Change "Two of the three items are defects found by the 2026-08-27 shakedown" to "Both items are defects found by the 2026-08-27 shakedown".

In **Known open issues**, change "carried as backlog items 2 and 3" to "carried as backlog items 1 and 2".

- [ ] **Step 3: Add the area note**

In **Area notes**, add this bullet after the "Trends scale per row" one:

```markdown
- **A month note is the only stored thing that is not a week.** It lives at
  `daily-log-month-YYYY-MM`, deliberately off the `planner-` prefix, and is
  stored as raw text so its whole repair path is `?? ""`. One key per month is
  what makes an import merge free: writing the months a backup names leaves the
  ones it does not name alone. A search result for one carries `kind: "month"`
  and no Monday, and routes through `onJumpToMonth` rather than `onJump` —
  transposing those lands the user in the right date and the wrong view.
```

- [ ] **Step 4: Add the long-form note**

Append this to `docs/design-notes.md`:

```markdown
## Month notes: the first stored thing that is not a week

### Why the export version stayed at 2

Adding `monthNotes` to the export shape did not move the version number, and
that was a choice between two losses rather than an oversight.

Bumping to 3 makes a backup written after the change *refused outright* by any
older cached build: `READABLE_VERSIONS` would not contain 3, so
`importFromJSON` returns "That file was written by an unsupported version" and
the weeks do not land either. Staying at 2 lets that build read the file,
restore every week and every colour label, report success, and drop the notes
silently.

The second is the smaller loss, and it only reaches someone restoring from a
tab cached before the change. But it is the failure mode this feature was
written to prevent, pointed the other way, so it is worth naming: **a build
older than this one restores a new backup minus the month notes and says
nothing.**

That balance shifts as the unversioned surface grows. If a third stored shape
is ever added, re-decide this rather than inheriting it.

### Why the save is not debounced

`StudyPlanner` debounces at 300ms and needs `pendingRef` to answer *which week*
a pending write belongs to, plus three separate flushes — on leaving the week,
on unmount, and on `pagehide`. Every one of those exists because the debounce
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
repo has twice been burned by — `DailyView` writing back every label it read,
and `StudyPlanner` turning an unreadable week into an empty one 300ms after it
was opened.

It is not the same thing. The rule is about effects that **persist state**. This
one reads `scrollHeight` and sets `style.height`; it touches no storage and no
React state. It cannot write anything.

It also cannot be removed. The print block resets `overflow` on the
`.overflow-auto` family of utility classes, but a `<textarea>` scrolls by its
own nature rather than through those classes, so a fixed-height one prints only
the lines that happen to be in view and drops the rest without a mark. The
alternative was a print-only duplicate of the text, rejected as a second copy of
something that has to be kept true.

### The two mutations that mattered

Both of these produce a green suite and wrong behaviour, and neither is visible
by reading the diff.

**Dropping `key={monthKey}` from the `MonthNotes` element in `MonthlyView`.**
Without it the component keeps its state across a month change, so paging from
August to September shows August's text — and the next keystroke saves it under
`daily-log-month-2026-09`. One month's reflection is overwritten by another's.
Guarded by "shows the month it is looking at, not the one before", which
re-renders rather than mounting twice precisely so it can catch this.

**Sorting a month match on `monthKey` rather than `${monthKey}-01`.** Week
matches sort on an ISO date, `"2026-08-24"`. A bare `"2026-08"` sorts before
every day in its own month, so the note files itself after the last week of
August instead of among them — which looks like an ordering quirk rather than a
bug, and is the kind of thing nobody reports. Guarded by the three-way ordering
assertion in `month-notes-search.test.tsx`.
```

- [ ] **Step 5: Verify the docs did not break the suite**

Run: `npm test`
Expected: PASS, same counts as Task 12.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/design-notes.md
git commit -m "Record month notes; retire backlog item 1 and renumber the rest"
```

---

## Done

Do **not** merge. `main` deploys on push, and merging is the user's call — ask, and say what was verified and what was only seen by eye.
