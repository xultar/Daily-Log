# Rename Colour Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A button pinned to the right of the weekly colour strip opens a dialog for renaming all twelve tags.

**Architecture:** A new presentational `RenameTagsDialog` takes `labels` and an `onRename` callback and owns no state but its own open flag. `WeeklyColorLegend` swaps its `useMemo` label read for a `useState` initialiser — still one read per mount — so it can update when the dialog edits, and its outer element splits so the trigger sits outside the scrolling container.

**Tech Stack:** TypeScript, React 18, Vite, vitest + @testing-library/react, Radix dialog, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-26-rename-tags-design.md`

**Branch:** `rename-tags`, already created off a clean `main`.

**Baseline before starting:** `npm test` 437 tests across 43 files, `npm run lint` 0 errors and 10 warnings, `npm run build` clean. Confirm before Task 1 and do not proceed if it differs.

---

## Two test-design notes, because both are easy to get wrong

**The no-nesting assertion must not be vacuous.** `legend-cell.test.tsx` asserts it by looping over every `button` in the day view's legend and checking none contains an interactive element. Copying that here would pass without executing its body, because these rows contain no buttons at all. Assert the real guarantee instead: **the list contains zero buttons.**

**The keyboard test must fire on the input, not on `window`.** `color-keys.test.tsx` uses `fireEvent.keyDown(window, …)`, which sets `target` to `window`. `TimeGrid`'s guard bails when `target.tagName` is `INPUT`, so firing on `window` would sail past the guard and the test would pass for the wrong reason. Fire on the field; it bubbles to `window` with `target` set correctly.

## Palette facts the tests depend on

`COLOR_IDS_IN_DISPLAY_ORDER` is `[1, 2, 3, 4, 5, 7, 8, 9, 6, 10, 11, 12]`, so the twelve default names **in display order** are:

```
Blue, Pink, Green, Lavender, Orange, Yellow, Teal, Magenta, Gray, Red, Chartreuse, Brown
```

Display position 9 is **Gray**, whose storage id is **6**. That entry is used throughout the tests deliberately: it is the one place where confusing the display position with the storage id produces a visibly wrong answer.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/components/planner/RenameTagsDialog.tsx` | New. Trigger, twelve rows, inputs. Holds no label state; takes `labels` and `onRename`. |
| `src/components/planner/WeeklyColorLegend.tsx` | Owns the labels, saves them, and splits its layout so the trigger can pin. |
| `src/test/rename-tags-dialog.test.tsx` | New. The dialog in isolation. |
| `src/test/weekly-legend-rename.test.tsx` | New. The strip: opening, saving, updating, structure, and the keyboard guard. |
| `CLAUDE.md`, `docs/design-notes.md` | Baselines; backlog item 2 replaced by what shipped. |

---

### Task 1: `RenameTagsDialog`

**Files:**
- Create: `src/components/planner/RenameTagsDialog.tsx`
- Test: `src/test/rename-tags-dialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/rename-tags-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import RenameTagsDialog from "@/components/planner/RenameTagsDialog";

/**
 * The dialog renames and never arms, which is why its rows contain no button.
 * The day view's legend had to earn that property with a fix and a test after
 * shipping an input nested inside a button; here there is nothing to nest.
 */

const setup = (labels: Record<number, string> = {}) => {
  const onRename = vi.fn();
  render(<RenameTagsDialog labels={labels} onRename={onRename} />);
  fireEvent.click(screen.getByRole("button", { name: /rename colour tags/i }));
  return onRename;
};

afterEach(cleanup);

describe("the rename tags dialog", () => {
  it("lists all twelve tags in display order", () => {
    // Display order, not storage order: Gray sits ninth while keeping id 6.
    setup();

    const fields = screen.getAllByRole("textbox");
    expect(fields.map((f) => f.getAttribute("placeholder"))).toEqual([
      "Blue",
      "Pink",
      "Green",
      "Lavender",
      "Orange",
      "Yellow",
      "Teal",
      "Magenta",
      "Gray",
      "Red",
      "Chartreuse",
      "Brown",
    ]);
  });

  it("shows a custom name in the field and the default as its placeholder", () => {
    setup({ 6: "Buffer" });

    const field = screen.getByRole("textbox", { name: /rename buffer/i });
    expect((field as HTMLInputElement).value).toBe("Buffer");
    expect(field.getAttribute("placeholder")).toBe("Gray");
  });

  it("reports the storage id, not the display position", () => {
    // Gray is ninth on screen and sixth in storage. Reporting the position
    // would rename Magenta, which is what sits at storage id 9.
    const onRename = setup();

    fireEvent.change(screen.getByRole("textbox", { name: /rename gray/i }), {
      target: { value: "Buffer" },
    });

    expect(onRename).toHaveBeenCalledWith(6, "Buffer");
  });

  it("reports an empty string when a name is cleared", () => {
    // Clearing is how a tag goes back to its default, so it must reach the
    // handler rather than being swallowed as "no change".
    const onRename = setup({ 6: "Buffer" });

    fireEvent.change(screen.getByRole("textbox", { name: /rename buffer/i }), {
      target: { value: "" },
    });

    expect(onRename).toHaveBeenCalledWith(6, "");
  });

  it("puts no button in any row, so nothing can nest", () => {
    // Asserted as the absence of buttons rather than by looping over buttons
    // and checking their contents: that loop would never execute here, and a
    // test that cannot fail reads as coverage without being any.
    setup();

    expect(screen.getByRole("list").querySelectorAll("button")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/rename-tags-dialog.test.tsx`
Expected: FAIL — cannot resolve `@/components/planner/RenameTagsDialog`.

- [ ] **Step 3: Write the component**

Create `src/components/planner/RenameTagsDialog.tsx`:

```tsx
import React, { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getPaletteInDisplayOrder } from "@/lib/planner-data";

/**
 * Rename every colour tag in one place.
 *
 * The weekly strip is a horizontal scroller of twelve entries at 10px text,
 * so the day view's answer — a permanent field beside each swatch — does not
 * transfer. A dialog adds one control to the strip instead of twelve, and
 * gives the fields room the strip does not have.
 *
 * **Renaming only; arming stays in the strip.** That is what keeps a row free
 * of buttons, so the nested-interactive defect the day view's legend once
 * shipped is impossible here rather than guarded against.
 *
 * Holds no label state. Editing calls `onRename` straight through, so the
 * strip behind updates as the user types and there is no draft to lose.
 */
const RenameTagsDialog: React.FC<{
  labels: Record<number, string>;
  onRename: (id: number, value: string) => void;
}> = ({ labels, onRename }) => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 mr-2"
          aria-label="Rename colour tags"
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-sm">Rename colour tags</DialogTitle>
          <DialogDescription className="text-xs">
            Clear a name to go back to its default.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-1">
          {getPaletteInDisplayOrder().map((c, index) => (
            <li key={c.id} className="flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-sm border border-border/50 shrink-0"
                style={{ backgroundColor: `hsl(var(--tag-${c.id}))` }}
              />
              {/* Display position, never the storage id. The two differ for
                  four of the twelve, and this is the number the keyboard
                  shortcuts actually select. */}
              <span className="text-[10px] font-medium text-foreground/50 w-3 shrink-0">
                {index + 1}
              </span>
              <input
                type="text"
                value={labels[c.id] ?? ""}
                onChange={(e) => onRename(c.id, e.target.value)}
                aria-label={`Rename ${labels[c.id] || c.label}`}
                placeholder={c.label}
                className="flex-1 text-xs bg-transparent border border-border rounded px-1.5 py-1 outline-none text-foreground placeholder:text-muted-foreground/40"
              />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
};

export default RenameTagsDialog;
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/test/rename-tags-dialog.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/planner/RenameTagsDialog.tsx src/test/rename-tags-dialog.test.tsx
git commit -m "Add RenameTagsDialog: twelve tags, renaming only"
```

---

### Task 2: Give the strip the labels and the trigger

**Files:**
- Modify: `src/components/planner/WeeklyColorLegend.tsx`
- Test: `src/test/weekly-legend-rename.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/weekly-legend-rename.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import WeeklyColorLegend from "@/components/planner/WeeklyColorLegend";

/**
 * The strip reads its labels once per mount, because loadColorLabels() hits
 * localStorage and this component re-renders at drag-paint rate. Making it
 * editable means that read has to become state — same single read, but now it
 * can update. These tests pin both halves of that.
 */

const setup = () => {
  const onSelect = vi.fn();
  const { container } = render(
    <WeeklyColorLegend colorMinutes={{}} activeColor={1} onSelect={onSelect} />
  );
  return { container, onSelect };
};

const openDialog = () =>
  fireEvent.click(screen.getByRole("button", { name: /rename colour tags/i }));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("renaming from the weekly strip", () => {
  it("opens the dialog from the strip", () => {
    setup();
    openDialog();

    expect(screen.getByRole("textbox", { name: /rename gray/i })).toBeInTheDocument();
  });

  it("saves a new name", () => {
    setup();
    openDialog();

    fireEvent.change(screen.getByRole("textbox", { name: /rename gray/i }), {
      target: { value: "Buffer" },
    });

    expect(JSON.parse(localStorage.getItem("planner-color-labels") as string)).toEqual({
      6: "Buffer",
    });
  });

  it("shows the new name in the strip behind the dialog", () => {
    // The whole reason the useMemo became useState. With the memo the strip
    // would keep showing "Gray" until something remounted it.
    setup();
    openDialog();

    fireEvent.change(screen.getByRole("textbox", { name: /rename gray/i }), {
      target: { value: "Buffer" },
    });

    // The strip renders the name as text; the dialog renders it as a field
    // value, which getByText does not match. So this can only be the strip.
    expect(screen.getByText("Buffer")).toBeInTheDocument();
  });

  it("goes back to the default when a name is cleared", () => {
    setup();
    openDialog();
    const field = () => screen.getByRole("textbox", { name: /rename (gray|buffer)/i });

    fireEvent.change(field(), { target: { value: "Buffer" } });
    fireEvent.change(field(), { target: { value: "" } });

    expect(screen.getByText("Gray")).toBeInTheDocument();
  });

  it("writes nothing merely by opening the dialog", () => {
    // A read that writes on mount is the bug that put planner-color-labels: {}
    // into storage for users who had never named a tag. Saving in the handler
    // rather than from an effect is what makes this hold.
    setup();
    openDialog();

    expect(localStorage.getItem("planner-color-labels")).toBeNull();
  });

  it("keeps the trigger outside the scrolling container", () => {
    // Structural on purpose. Inside the scroller the trigger sits after twelve
    // entries, which is off screen at any normal width — a feature you have to
    // scroll sideways to discover is one nobody discovers.
    const { container } = setup();

    const scroller = container.querySelector(".overflow-x-auto") as HTMLElement;
    const trigger = screen.getByRole("button", { name: /rename colour tags/i });

    expect(scroller).not.toBeNull();
    expect(scroller.contains(trigger)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/weekly-legend-rename.test.tsx`
Expected: FAIL — no button named "Rename colour tags".

- [ ] **Step 3: Change the label read to state**

In `src/components/planner/WeeklyColorLegend.tsx`, change the imports:

```tsx
import React, { useState } from "react";
import {
  getPaletteInDisplayOrder,
  loadColorLabels,
  saveColorLabels,
  formatMinutes,
} from "@/lib/planner-data";
import RenameTagsDialog from "./RenameTagsDialog";
```

Replace the `useMemo` line and its comment with:

```tsx
  // Read once per mount, not per render: loadColorLabels() hits localStorage
  // and this component re-renders at drag-paint rate. A useState initialiser
  // runs exactly once, so that property is unchanged — what it adds is that
  // the strip can now update itself when the rename dialog edits a label.
  //
  // The weekly branch in StudyPlanner is conditionally rendered (not kept
  // mounted with `hidden`), so switching to daily and back genuinely remounts
  // this component and a label edited in the daily view still shows up here.
  // If that conditional rendering is ever changed to an always-mounted/hidden
  // pattern, this would silently keep showing whatever labels existed at first
  // mount.
  const [labels, setLabels] = useState<Record<number, string>>(() => loadColorLabels());

  /**
   * Saved here rather than from an effect on `labels`, matching
   * DailyView.updateLabel. That effect ran on mount as well as on change, so
   * opening the view wrote back the labels it had just read — writing where
   * the change happens leaves nothing for a mount to trigger.
   */
  const updateLabel = (id: number, value: string) => {
    const next = { ...labels, [id]: value };
    setLabels(next);
    saveColorLabels(next);
  };
```

- [ ] **Step 4: Split the layout and add the trigger**

Replace the outer element of the returned markup. The scroller moves inward so
the trigger can sit outside it:

```tsx
    <div className="shrink-0 border-t border-border bg-muted/20 flex items-center">
      <div className="overflow-x-auto flex-1 min-w-0">
        {/* w-max keeps this row at its content width so the parent's
            overflow-x-auto scrolls instead of squashing entries. Each button
            is already shrink-0, so entries wouldn't compress without it either
            way — what w-max actually guards is the trailing padding, which
            would otherwise get clipped at the container edge. Belt and braces. */}
        <div className="flex items-center gap-3 px-2 py-1 w-max">
          {/* …the twelve entry buttons, unchanged… */}
        </div>
      </div>
      {/* Outside the scroller on purpose: after twelve entries it would be off
          screen at any normal width. */}
      <RenameTagsDialog labels={labels} onRename={updateLabel} />
    </div>
```

The twelve entry buttons themselves do not change, except that `labels` is now
state rather than a memo — the `const name = labels[c.id] || c.label;` line is
untouched.

- [ ] **Step 5: Run them and watch them pass**

Run: `npx vitest run src/test/weekly-legend-rename.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/planner/WeeklyColorLegend.tsx src/test/weekly-legend-rename.test.tsx
git commit -m "Let the weekly strip rename its tags"
```

---

### Task 3: The keyboard guard, in this new context

**Files:**
- Test: `src/test/weekly-legend-rename.test.tsx`

- [ ] **Step 1: Write the failing test**

`TimeGrid` binds number keys on `window` to switch the armed colour. Typing "3"
into a rename field must not repaint. Append to
`src/test/weekly-legend-rename.test.tsx`, and add the two imports it needs at
the top of the file:

```tsx
import TimeGrid from "@/components/planner/TimeGrid";
import { createEmptyDay } from "@/lib/planner-data";
```

```tsx
describe("the number keys while renaming", () => {
  it("does not repaint the grid when a digit is typed into a rename field", () => {
    // TimeGrid listens on window, so this needs both components mounted.
    //
    // The event is fired on the FIELD, not on window. color-keys.test.tsx
    // fires on window, which sets target to window — and TimeGrid's guard
    // bails on target.tagName === "INPUT", so firing on window would skip the
    // guard entirely and pass for the wrong reason.
    const onActiveColorChange = vi.fn();
    render(
      <>
        <TimeGrid
          timeBlocks={createEmptyDay(new Date(2026, 7, 24)).timeBlocks}
          onChange={() => {}}
          activeColor={1}
          onActiveColorChange={onActiveColorChange}
        />
        <WeeklyColorLegend colorMinutes={{}} activeColor={1} onSelect={vi.fn()} />
      </>
    );
    openDialog();

    const field = screen.getByRole("textbox", { name: /rename gray/i });
    fireEvent.keyDown(field, { key: "3" });

    expect(onActiveColorChange).not.toHaveBeenCalled();
  });

  it("still repaints when the digit is typed outside a field", () => {
    // The other half: without this, deleting the guard's INPUT check would
    // leave the test above green and the shortcut silently dead.
    const onActiveColorChange = vi.fn();
    render(
      <TimeGrid
        timeBlocks={createEmptyDay(new Date(2026, 7, 24)).timeBlocks}
        onChange={() => {}}
        activeColor={1}
        onActiveColorChange={onActiveColorChange}
      />
    );

    fireEvent.keyDown(window, { key: "3" });

    expect(onActiveColorChange).toHaveBeenCalledWith(3);
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/test/weekly-legend-rename.test.tsx`
Expected: PASS, 8 tests. **These two should pass immediately** — `TimeGrid`'s
guard already bails on `INPUT`, and this pins that the new field is covered by
it. If the first one fails, the guard has been weakened and that is a real
finding, not a test to adjust.

- [ ] **Step 3: Commit**

```bash
git add src/test/weekly-legend-rename.test.tsx
git commit -m "Pin that renaming does not steal the paint shortcuts"
```

---

### Task 4: Look at it, then write down what shipped

**Files:**
- Modify: `CLAUDE.md`, `docs/design-notes.md`

- [ ] **Step 1: Run everything**

```bash
npm test && npm run lint && npm run build
```

Expected: 450 tests across 45 files; lint 0 errors and the same 10 pre-existing
warnings; build clean. If the count differs because a test was split or merged,
record what `npm test` reports rather than this figure.

- [ ] **Step 2: Mutation-check the two load-bearing tests**

Revert the label read to a memo:

```tsx
const labels = useMemo(() => loadColorLabels(), []);
```

(and give `updateLabel` a `setLabels` that does nothing, or drop the `setLabels`
call, so it compiles). Run: `npx vitest run src/test/weekly-legend-rename.test.tsx`
Expected: FAIL on "shows the new name in the strip behind the dialog". Revert.

Then move the trigger inside the scroller — put `<RenameTagsDialog … />` inside
the `overflow-x-auto` div. Run the same file.
Expected: FAIL on "keeps the trigger outside the scrolling container". Revert,
and re-run to confirm 8 green.

- [ ] **Step 3: Look at it in a browser**

Run `npm run dev`, open `http://localhost:8080/Daily-Log/`, and stay in the week
view. Check that the pencil stays visible with the strip scrolled fully right;
that the dialog's twelve rows fit without the fields being cramped; that a
rename appears in the strip as you type; that clearing a field shows the default
name again with it greyed in the placeholder; and that pressing 1–9 with the
dialog closed still arms colours.

jsdom sees no layout, so the pinned trigger and the field widths are only
verifiable here.

- [ ] **Step 4: Update the baselines**

In `CLAUDE.md`, under **Baselines**, change `437 tests across 43 files` to the
number from Step 1.

- [ ] **Step 5: Replace backlog item 2**

Delete the `### 2. Edit colour labels from the weekly strip` block. Change "the
two numbered items below" to "the one numbered item below", and reword the
sentence so it reads naturally with a single item.

Add a bullet to the condensed list in `CLAUDE.md`, after the templating one:

```markdown
- **The weekly strip renames through a dialog, not inline fields.** Twelve
  entries at 10px in a scroller have no room for the day view's answer. The
  dialog renames and never arms, so its rows contain no button and nothing can
  nest. Its trigger sits *outside* the scroller or it is off screen.
```

Add the long-form section to `docs/design-notes.md`, immediately before
`## A second tab reloads, or says so`:

```markdown
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
not a descendant of the `overflow-x-auto` element.

**`WeeklyColorLegend` holds its labels in `useState`, not `useMemo`.** Both read
once per mount — a `useState` initialiser runs exactly once — so the reason the
memo existed, that `loadColorLabels()` hits `localStorage` and this re-renders
at drag-paint rate, still holds. State is what lets the strip update itself when
the dialog edits. Everything the old comment said about conditional rendering
remains true and remains recorded.

**Lifting the labels to `StudyPlanner` is the tidy-looking wrong answer.** It
would give one source of truth instead of two mounts each reading once — and it
would break day-view renames reaching the strip, because `StudyPlanner` never
remounts on a view switch. It only works if the day view is lifted too.

**Saving happens in the handler, never in an effect**, matching
`DailyView.updateLabel`. The effect version ran on mount as well as on change,
writing `planner-color-labels: {}` for users who had never named a tag. A test
asserts that opening the dialog writes nothing.

**Typing a digit into a rename field does not repaint the grid.** `TimeGrid`'s
window-level handler bails when the target is an `INPUT`, before it ever checks
for `role="menu"`, `role="dialog"` or `role="listbox"`. The test fires the event
on the field rather than on `window`, because firing on `window` sets `target`
to `window` and skips the guard entirely — passing for the wrong reason.
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/design-notes.md
git commit -m "Record strip renaming in the working notes; update baselines"
```

- [ ] **Step 7: Stop and ask**

Do not merge. Pushing `main` deploys, and merging is the user's call.

---

## Self-review

**Spec coverage:** the dialog and its twelve rows (Task 1); renaming only, no arming (Task 1, the zero-buttons test); `useMemo` → `useState` (Task 2); `updateLabel` saving in the handler (Task 2, the writes-nothing test); layout split and pinned trigger (Task 2, the structural test); clear-to-default (Tasks 1 and 2); the keyboard guard (Task 3); mutation passes, browser pass, notes and baselines (Task 4).

**Deviation from the spec:** none in behaviour. The spec's test list said "no row nests an interactive element inside another"; the plan implements that as "the list contains zero buttons" because the literal phrasing would be vacuous here. Same property, and the stronger statement.

**Types:** `RenameTagsDialog` takes `labels: Record<number, string>` and `onRename: (id: number, value: string) => void` in Task 1 and is used with exactly those in Task 2. `updateLabel` matches `onRename`'s signature. `labels` is `Record<number, string>` in both files, which is what `loadColorLabels()` returns.

**Test counts:** Task 1 adds 5, Task 2 adds 6, Task 3 adds 2 — 13 new tests across 2 new files, giving 450 across 45. If the real number differs because a test gets split or merged during implementation, record what `npm test` reports rather than this figure.
