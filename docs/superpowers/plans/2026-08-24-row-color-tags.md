# Priority row color tags implementation plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each Priorities / Actions row carry a color tag, shown as a solid left stripe plus a faint background wash, so a task visibly belongs to the same category as the time blocks it maps to.

**Architecture:** `SubjectRow` gains an optional `colorId` holding a storage id. The color picker is extracted out of `TimeGrid` into its own component so both the time grid and the priority rows can open it, and the viewport clamp moves inside it so the constants sit next to the element they measure. Both views render the stripe from `getBlockColor` and the wash from a new `getBlockTint`.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind, Vitest with jsdom.

Spec: `docs/superpowers/specs/2026-08-24-weekly-legend-and-row-color-tags-design.md` (Phase 2 section). Phase 1 is merged and deployed.

---

## Vocabulary

Unchanged from Phase 1, and it now applies to a third piece of persisted state.

- **Storage id** — the number written into `timeBlocks`, used as the key in `planner-color-labels`, and now stored in `SubjectRow.colorId`. Equals the 1-based position in `BLOCK_COLORS`. Never changes.
- **Display position** — the 1-based position in `COLOR_IDS_IN_DISPLAY_ORDER`. What the user sees and types.

`activeColor` is a storage id. `colorId` is a storage id. Display position appears only in rendering, via the array index from `getPaletteInDisplayOrder()`.

---

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/lib/planner-data.ts` | `SubjectRow.colorId`, `getBlockTint` | Modify |
| `src/test/planner-data.test.ts` | Tests for both | Modify |
| `src/components/planner/ColorPicker.tsx` | The floating swatch picker, positioning and dismissal | Create |
| `src/components/planner/TimeGrid.tsx` | Consumes `ColorPicker` instead of inline JSX | Modify |
| `src/components/planner/DailyView.tsx` | Row stripe, wash, and picker | Modify |
| `src/components/planner/DayColumn.tsx` | Same, at weekly scale | Modify |

`ColorPicker` owns where it appears and when it closes. Callers own when it opens and what to do with the result.

---

## Task 1: Schema and tint helper

**Files:**
- Modify: `src/test/planner-data.test.ts`
- Modify: `src/lib/planner-data.ts`

- [ ] **Step 1: Write the failing tests**

Add `saveWeek`, `loadWeek`, `getBlockTint` and `getWeekKey` to the existing import in `src/test/planner-data.test.ts`, then append:

```ts
describe("getBlockTint", () => {
  it("returns null for an empty block", () => {
    expect(getBlockTint(0, false)).toBeNull();
    expect(getBlockTint(0, true)).toBeNull();
  });

  it("returns null for an out-of-range value", () => {
    expect(getBlockTint(BLOCK_COLORS.length + 1, false)).toBeNull();
    expect(getBlockTint(99, true)).toBeNull();
  });

  it("returns the light colour at 16% alpha for every id", () => {
    for (const c of BLOCK_COLORS) {
      expect(getBlockTint(c.id, false)).toBe(`hsl(${c.hsl} / 0.16)`);
    }
  });

  it("returns the dark colour at 16% alpha for every id", () => {
    for (const c of BLOCK_COLORS) {
      expect(getBlockTint(c.id, true)).toBe(`hsl(${c.hslDark} / 0.16)`);
    }
  });

  it("resolves a storage id, not a display position", () => {
    expect(getBlockTint(6, false)).toBe("hsl(0 0% 78% / 0.16)");
  });
});

describe("SubjectRow.colorId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is absent on a freshly created day", () => {
    const day = createEmptyDay(MONDAY);
    expect(day.subjects[0].colorId).toBeUndefined();
  });

  it("survives a save and load round trip", () => {
    const week = createEmptyWeek(MONDAY);
    week.days[0].subjects[0] = { subject: "Draft the proposal", checked: false, colorId: 7 };
    saveWeek(MONDAY, week);
    expect(loadWeek(MONDAY).days[0].subjects[0].colorId).toBe(7);
  });

  it("loads a row saved without a colorId as untagged", () => {
    saveWeek(MONDAY, createEmptyWeek(MONDAY));
    const loaded = loadWeek(MONDAY);
    expect(loaded.days[0].subjects[0].colorId).toBeUndefined();
    expect(loaded.days[0].subjects[0].subject).toBe("");
  });

  it("stores the storage id, so gray round trips as 6 and not 9", () => {
    const week = createEmptyWeek(MONDAY);
    week.days[3].subjects[2] = { subject: "Buffer", checked: false, colorId: 6 };
    saveWeek(MONDAY, week);
    expect(loadWeek(MONDAY).days[3].subjects[2].colorId).toBe(6);
  });
});
```

Add `beforeEach` to the `vitest` import on line 1.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/planner-data.test.ts`

Expected: FAIL at import — `getBlockTint` does not exist. The `SubjectRow.colorId` tests will also fail to typecheck at the object literals until the field is added.

- [ ] **Step 3: Add the field and the helper**

In `src/lib/planner-data.ts`, change the `SubjectRow` interface from:

```ts
export interface SubjectRow {
  subject: string;
  checked: boolean;
}
```

to:

```ts
export interface SubjectRow {
  subject: string;
  checked: boolean;
  /**
   * Storage id of this row's colour tag — the same contract as timeBlocks,
   * never a display position. Optional: rows saved before this field existed
   * load as undefined and render untagged, so no migration is needed.
   */
  colorId?: number;
}
```

Then, immediately after `getBlockColor`, add:

```ts
/**
 * The faint background wash for a tagged row. Same storage-id contract as
 * getBlockColor: index 0 and out-of-range values yield null.
 */
export function getBlockTint(value: number | undefined, isDark: boolean): string | null {
  if (value === 0) return null;
  const color = BLOCK_COLORS[value - 1];
  if (!color) return null;
  return `hsl(${isDark ? color.hslDark : color.hsl} / 0.16)`;
}
```

Do NOT change `createEmptyDay`. A fresh row leaves `colorId` absent on purpose.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/planner-data.test.ts`

Expected: PASS. The file gains 9 tests.

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test` — expect 39 tests across 2 files.
Run: `npx tsc --noEmit -p tsconfig.app.json` — expect no output.

```bash
git add src/lib/planner-data.ts src/test/planner-data.test.ts
git commit -m "Add SubjectRow.colorId and the row tint helper"
```

---

## Task 2: Extract the color picker

**Files:**
- Create: `src/components/planner/ColorPicker.tsx`
- Modify: `src/components/planner/TimeGrid.tsx`

No test step. This is a behavior-preserving refactor of code with no unit tests today; Task 5 verifies it in a browser, and the checks there are specific about what must still work.

**This is the highest-risk task in Phase 2.** It moves code hardened across three review rounds during the color-tag work. Every behavior listed below must survive.

- [ ] **Step 1: Create the component**

Create `src/components/planner/ColorPicker.tsx` with exactly this content:

```tsx
import React, { useEffect } from "react";
import { getPaletteInDisplayOrder } from "@/lib/planner-data";

interface ColorPickerProps {
  /** Raw client coordinates of the triggering event. Clamped internally. */
  x: number;
  y: number;
  /** Receives a storage id. */
  onPick: (colorId: number) => void;
  onClear: () => void;
  onClose: () => void;
}

// Measured from the rendered element: 10 buttons at 24px, 9 gaps at 4px,
// 6px padding each side, 1px border each side. The clamp lives here rather
// than at the call sites so both callers get it and the constants sit next
// to the element they describe.
const PICKER_WIDTH = 290;
const PICKER_HEIGHT = 38;
const EDGE_MARGIN = 10;

const ColorPicker: React.FC<ColorPickerProps> = ({ x, y, onPick, onClear, onClose }) => {
  const isDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - PICKER_WIDTH - EDGE_MARGIN);
  const top = Math.min(y, window.innerHeight - PICKER_HEIGHT - EDGE_MARGIN);

  return (
    <div
      className="fixed z-50 bg-popover border border-border rounded-md shadow-lg p-1.5 flex gap-1"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      {getPaletteInDisplayOrder().map((c, index) => (
        <button
          key={c.id}
          className="w-6 h-6 rounded-sm border border-border/50 hover:scale-110 transition-transform flex items-center justify-center text-[9px] font-bold"
          style={{ backgroundColor: `hsl(${isDark ? c.hslDark : c.hsl})` }}
          title={`${c.label} (${index + 1})`}
          aria-label={`${c.label} (${index + 1})`}
          onClick={() => onPick(c.id)}
        >
          {index + 1}
        </button>
      ))}
      <button
        className="w-6 h-6 rounded-sm border border-border/50 hover:scale-110 transition-transform bg-background text-[9px] text-muted-foreground"
        title="Clear"
        aria-label="Clear colour"
        onClick={onClear}
      >
        &times;
      </button>
    </div>
  );
};

export default ColorPicker;
```

Note what changed versus the inline version, deliberately:
- The clamp moved here from `TimeGrid.handleContextMenu`, and now subtracts the picker's own measured size rather than magic numbers. Horizontally this is exactly equivalent: 290 + 10 equals the old 300. Vertically it is 4px more generous — the old code subtracted 44 against a 38px element, leaving a 6px margin, and this leaves 10px. That difference is intentional, to make both axes use the same margin constant.
- The clear button gained an `aria-label`. It previously had only `title`, so it announced as "times" or nothing.
- Everything else — the swatch classes, the inline `hsl(...)` background, `title`, `aria-label`, display-position numbering, the clear button rendered last, `stopPropagation` on the container, and the outside-click listener — is carried over unchanged.

- [ ] **Step 2: Use it in TimeGrid**

In `src/components/planner/TimeGrid.tsx`:

Add the import:

```ts
import ColorPicker from "./ColorPicker";
```

Remove `getPaletteInDisplayOrder` from the `@/lib/planner-data` import if nothing else in the file uses it. Check first with `grep -n "getPaletteInDisplayOrder" src/components/planner/TimeGrid.tsx` after the JSX edit below.

Delete the outside-click `useEffect` entirely — the one that adds a `window` `click` listener and calls `setContextMenu(null)`. `ColorPicker` owns that now.

In `handleContextMenu`, stop clamping. Change the `setContextMenu` payload so `x` and `y` are the raw `e.clientX` and `e.clientY`. Keep `e.preventDefault()` and keep `hourIdx` and `blockIdx` exactly as they are.

Replace the entire `{contextMenu && ( ... )}` JSX block — from the opening brace through the closing `)}` including both buttons — with:

```tsx
      {contextMenu && (
        <ColorPicker
          x={contextMenu.x}
          y={contextMenu.y}
          onPick={(colorId) => pickColor(colorId)}
          onClear={() => {
            setBlock(contextMenu.hourIdx, contextMenu.blockIdx, 0);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
```

Leave `pickColor` itself unchanged — it still sets the block, arms the color, and closes the menu.

- [ ] **Step 3: Confirm nothing else moved**

Run: `npx tsc --noEmit -p tsconfig.app.json` — expect no output.
Run: `npm test` — expect 39 tests.
Run: `npm run lint` — expect 0 errors.

Then confirm by grep that the hardened keyboard logic is untouched:

```bash
grep -n "ctrlKey\|isContentEditable\|role=\\\\\"menu" src/components/planner/TimeGrid.tsx
```

All three guards must still be present. If any is missing, you removed too much — restore it.

- [ ] **Step 4: Commit**

```bash
git add src/components/planner/ColorPicker.tsx src/components/planner/TimeGrid.tsx
git commit -m "Extract the colour picker so rows can reuse it"
```

---

## Warnings carried forward from the Task 1 review

Read these before writing Task 3 or Task 4.

**The branch invites a regression that nothing would catch.** `colorId` survives a
keystroke only because `updateSubject` in both components rebuilds the row with
`{ ...s, [field]: value }`. Task 3 adds `setRowColor` as a sibling mutator, which
makes the stringly-typed dispatcher look like the odd one out. The natural cleanup
- replacing it with explicit setters that list fields - silently drops the tag on
the next keystroke after a row is tagged. There is NO type error, because
`colorId` is optional and `strict: false` removes any remaining pressure, and no
existing test touches component code.

Do NOT rewrite `updateSubject`. Task 3 Step 4 adds the test that guards it.

**jsdom v20 silently discards CSS Color 4 values.** This project pins
`jsdom: ^20.0.3`, whose `cssstyle` predates space-separated `hsl()`. Measured in
this project's own vitest environment, all three of these yield an empty string:

    el.style.backgroundColor = "hsl(213 60% 80% / 0.16)"
    el.style.backgroundColor = "hsl(213 60% 80%)"
    el.style.borderLeft = "3px solid hsl(213 60% 80%)"

So a DOM assertion on a rendered style reads empty, and - worse - a negative
assertion for an untagged row passes VACUOUSLY. Any component test must assert on
the `onChange` payload or call `getBlockTint` directly. Never assert on a rendered
style value in this project.

---

## Task 3: Tag rows in the daily view

**Files:**
- Modify: `src/components/planner/DailyView.tsx`

No test step; Task 5 verifies in a browser.

- [ ] **Step 1: Add the imports and the row helpers**

Add `getBlockTint` and `ColorPicker` to the imports. `getBlockColor` may already be imported; if not, add it.

Inside the component, alongside the existing state, add:

```ts
  const [rowPicker, setRowPicker] = useState<{ x: number; y: number; idx: number } | null>(null);

  // colorId is a storage id, matching activeColor and timeBlocks.
  const setRowColor = (idx: number, colorId: number | undefined) => {
    const subjects = day.subjects.map((s, i) => (i === idx ? { ...s, colorId } : s));
    onChange({ ...day, subjects });
  };

  // Clicking a row already carrying the armed colour clears it, mirroring
  // how clicking a filled time block clears it.
  const toggleRowColor = (idx: number) => {
    const current = day.subjects[idx].colorId;
    setRowColor(idx, current === activeColor ? undefined : activeColor);
  };
```

- [ ] **Step 2: Restructure the row**

Replace the row element. It currently reads:

```tsx
              <div key={idx} className="flex items-center border-b border-campus-grid last:border-b-0 px-2 py-1.5 group">
```

and closes after the remove button. Change the opening to:

The map currently uses a concise arrow body, `{day.subjects.map((s, idx) => (`.
Change it to a block body so the two colour values can be computed once per row:

```tsx
            {day.subjects.map((s, idx) => {
              const tint = getBlockTint(s.colorId, isDark);
              const stripe = getBlockColor(s.colorId, isDark);
              return (
              <div
                key={idx}
                className="flex items-stretch border-b border-campus-grid last:border-b-0 group"
                style={tint ? { backgroundColor: tint } : undefined}
              >
                <button
                  type="button"
                  onClick={() => toggleRowColor(idx)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setRowPicker({ x: e.clientX, y: e.clientY, idx });
                  }}
                  aria-label={s.colorId ? "Change row colour" : "Tag row with the armed colour"}
                  className="w-[10px] shrink-0 cursor-pointer"
                  style={{ borderLeft: `3px solid ${stripe ?? "transparent"}` }}
                />
                <div className="flex items-center flex-1 min-w-0 px-1 py-1.5">
```

The remove button is the last child inside the row today, so the row currently ends:

```tsx
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
```

It must now close the new content wrapper first:

```tsx
                  <X className="h-3 w-3" />
                </button>
                </div>
              </div>
              );
            })}
```

Note the map's closing changed from `))}` to `);` plus `})}` because the arrow
body is now a block.

The checkbox, text input and remove button all move inside the new `<div className="flex items-center flex-1 min-w-0 px-1 py-1.5">` unchanged. Do not edit them.

The row changed from `items-center` to `items-stretch` so the stripe button fills the row height. Its horizontal padding moved from the row onto the inner wrapper and dropped from `px-2` to `px-1`, because the stripe now occupies 10px on the left. An untagged row renders a transparent 3px border of the same width, so rows never shift horizontally when tagged.

- [ ] **Step 3: Render the picker**

Immediately before the component's final closing `</div>`, add:

```tsx
      {rowPicker && (
        <ColorPicker
          x={rowPicker.x}
          y={rowPicker.y}
          onPick={(colorId) => {
            setRowColor(rowPicker.idx, colorId);
            onActiveColorChange(colorId);
            setRowPicker(null);
          }}
          onClear={() => {
            setRowColor(rowPicker.idx, undefined);
            setRowPicker(null);
          }}
          onClose={() => setRowPicker(null)}
        />
      )}
```

Picking from a row also arms that colour, matching what the time grid's picker does.

- [ ] **Step 4: Add the test that guards the mutation path**

This is the one test protecting against the regression described in the warnings
above. Create `src/test/daily-view.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DailyView from "@/components/planner/DailyView";
import { createEmptyDay } from "@/lib/planner-data";

const MONDAY = new Date(2026, 7, 24);

const tagged = () => {
  const day = createEmptyDay(MONDAY);
  day.subjects[0] = { subject: "Draft", checked: false, colorId: 7 };
  return day;
};

describe("DailyView row mutation", () => {
  it("preserves a row colorId when the subject text changes", () => {
    const onChange = vi.fn();
    render(
      <DailyView day={tagged()} dayIndex={0} onChange={onChange}
                 activeColor={1} onActiveColorChange={() => {}} />
    );
    fireEvent.change(screen.getByPlaceholderText("Add priority..."),
                     { target: { value: "Draft the proposal" } });
    expect(onChange.mock.calls[0][0].subjects[0])
      .toEqual({ subject: "Draft the proposal", checked: false, colorId: 7 });
  });

  it("preserves a row colorId when the checkbox toggles", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DailyView day={tagged()} dayIndex={0} onChange={onChange}
                 activeColor={1} onActiveColorChange={() => {}} />
    );
    fireEvent.click(container.querySelector("input[type=checkbox]"));
    expect(onChange.mock.calls[0][0].subjects[0])
      .toEqual({ subject: "Draft", checked: true, colorId: 7 });
  });
});
```

Both assertions read the `onChange` payload, never a rendered style - see the
jsdom warning above.

Prove the tests catch the regression: temporarily rewrite `updateSubject` so it
constructs the row by listing `subject` and `checked` explicitly instead of
spreading `s`, confirm BOTH tests fail, then revert.

- [ ] **Step 5: Verify and commit**

Run `npx tsc --noEmit -p tsconfig.app.json`, `npm test`, `npm run lint`. All must be clean.

```bash
git add src/components/planner/DailyView.tsx src/test/daily-view.test.tsx
git commit -m "Tag priority rows with a colour in the daily view"
```

---

## Task 4: Tag rows in the weekly view

**Files:**
- Modify: `src/components/planner/DayColumn.tsx`

Same feature at 9px scale, in a 100px-wide column. No test step.

- [ ] **Step 1: Add imports, state and helpers**

Add to the imports:

```ts
import React, { useState } from "react";
import { DayData, calcDayTotal, getBlockColor, getBlockTint } from "@/lib/planner-data";
import ColorPicker from "./ColorPicker";
```

Keep `TimeGrid` and `date-fns` imports as they are.

Inside the component add:

```ts
  const [rowPicker, setRowPicker] = useState<{ x: number; y: number; idx: number } | null>(null);

  const isDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  // colorId is a storage id, matching activeColor and timeBlocks.
  const setRowColor = (idx: number, colorId: number | undefined) => {
    const subjects = day.subjects.map((s, i) => (i === idx ? { ...s, colorId } : s));
    onChange({ ...day, subjects });
  };

  const toggleRowColor = (idx: number) => {
    const current = day.subjects[idx].colorId;
    setRowColor(idx, current === activeColor ? undefined : activeColor);
  };
```

- [ ] **Step 2: Restructure the row**

Replace:

```tsx
          <div key={idx} className="flex items-center border-b border-campus-grid last:border-b-0">
            <input
              type="checkbox"
              checked={s.checked}
              onChange={(e) => updateSubject(idx, "checked", e.target.checked)}
              className="ml-0.5 h-3 w-3 shrink-0 accent-campus-blue-dark"
            />
```

with:

As in Task 3, change the map from a concise arrow body to a block so the two
colour values are computed once per row. The map opens
`{day.subjects.map((s, idx) => (` and must become:

```tsx
        {day.subjects.map((s, idx) => {
          const tint = getBlockTint(s.colorId, isDark);
          const stripe = getBlockColor(s.colorId, isDark);
          return (
          <div
            key={idx}
            className="flex items-stretch border-b border-campus-grid last:border-b-0"
            style={tint ? { backgroundColor: tint } : undefined}
          >
            <button
              type="button"
              onClick={() => toggleRowColor(idx)}
              onContextMenu={(e) => {
                e.preventDefault();
                setRowPicker({ x: e.clientX, y: e.clientY, idx });
              }}
              aria-label={s.colorId ? "Change row colour" : "Tag row with the armed colour"}
              className="w-[8px] shrink-0 cursor-pointer"
              style={{ borderLeft: `3px solid ${stripe ?? "transparent"}` }}
            />
            <input
              type="checkbox"
              checked={s.checked}
              onChange={(e) => updateSubject(idx, "checked", e.target.checked)}
              className="h-3 w-3 shrink-0 self-center accent-campus-blue-dark"
            />
```

The stripe is 8px wide here rather than the 10px used in the daily view, because the column is only 100px. The spec says "roughly 10px"; 8px is the adaptation to the narrower column and is still a usable target.

The checkbox loses `ml-0.5` — the stripe now provides the left inset — and gains `self-center` because the row switched to `items-stretch`.

The text input needs the same treatment. Change its className from:

```tsx
              className="flex-1 text-[9px] px-0.5 py-[1px] bg-transparent border-none outline-none min-w-0 text-foreground placeholder:text-muted-foreground/50"
```

to:

```tsx
              className="flex-1 self-center text-[9px] px-0.5 py-[1px] bg-transparent border-none outline-none min-w-0 text-foreground placeholder:text-muted-foreground/50"
```

The map's closing must change from `))}` to `);` followed by `})}`, matching the
block body. The existing row contents — checkbox and text input — move inside
unchanged apart from the className edits described above.

- [ ] **Step 3: Render the picker**

Immediately before the component's final closing `</div>`, add the same block as Task 3 Step 3 — identical code, repeated here so this task stands alone:

```tsx
      {rowPicker && (
        <ColorPicker
          x={rowPicker.x}
          y={rowPicker.y}
          onPick={(colorId) => {
            setRowColor(rowPicker.idx, colorId);
            onActiveColorChange(colorId);
            setRowPicker(null);
          }}
          onClear={() => {
            setRowColor(rowPicker.idx, undefined);
            setRowPicker(null);
          }}
          onClose={() => setRowPicker(null)}
        />
      )}
```

- [ ] **Step 4: Verify and commit**

Run `npx tsc --noEmit -p tsconfig.app.json`, `npm test`, `npm run lint`. All must be clean.

```bash
git add src/components/planner/DayColumn.tsx
git commit -m "Tag priority rows with a colour in the weekly view"
```

---

## Task 5: Verification

**Files:** none modified unless a check fails.

- [ ] **Step 1: Automated gates**

```bash
npm test
```

Expected: 39 tests across 2 files.

```bash
npm run lint
```

Expected: `0 errors`, 10 pre-existing warnings, none in a file this plan touched.

```bash
npm run build
```

Expected: builds with no errors.

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

Serves at `http://localhost:8080/Daily-Log/`.

- [ ] **Step 3: The picker must still work exactly as before in the time grid**

This is the regression surface for the extraction. Confirm all of it:

1. Right-click a time block. Ten buttons appear — nine numbered swatches plus a clear button rendered last.
2. The numbers read 1 through 9 in display order, with gray as 9.
3. Clicking a swatch paints that block AND arms that colour.
4. Clicking the clear button empties the block.
5. Clicking anywhere outside closes the picker without changing anything.
6. Right-click a block in the rightmost weekly column, hard against the viewport edge. The whole picker including the clear button stays on screen.
7. Press `Ctrl+9` — the armed colour must not change. The modifier guard lives in `TimeGrid` and must have survived the extraction.

- [ ] **Step 4: Row tagging in the daily view**

1. Arm a colour, then click the stripe zone at the left edge of a priority row. The row gains a 3px stripe in that colour and a faint wash of the same hue.
2. Click the same row's stripe again. The tag clears.
3. Arm a different colour and click a tagged row's stripe. It retags to the new colour.
4. Right-click a row's stripe. The picker opens; choosing a colour tags the row and arms that colour.
5. Right-click a tagged row and use the clear button. The tag goes away.
6. An untagged row must sit at exactly the same horizontal position as a tagged one — the transparent stripe reserves the space.
7. Typing in a row's text field must still work, and must not change the armed colour.

- [ ] **Step 5: Row tagging in the weekly view**

1. All of Step 4 works in a day column, where the stripe is 8px and the text is 9px.
2. The checkbox and text input remain vertically centred in the row after the switch to `items-stretch`.
3. With several rows tagged across several columns, the grid is still readable — the wash must not compete with the time blocks below it.
4. Check the rows with the OS in DARK mode as well as light. `isDark` comes from `prefers-color-scheme`, but nothing in this app ever applies the `.dark` class, so `--background` stays white while the palette flips to `hslDark`. A 16% wash computed from a dark-ground triple and composited over white reads muddier than designed. That is the pre-existing `isDark` bug becoming newly visible, not a Phase 2 defect, but confirm it is merely duller rather than illegible.

- [ ] **Step 6: Persistence — the check that matters most**

1. Tag rows with several colours, including gray, across both views.
2. Reload the page. Every tag must return with its colour.
3. In devtools, confirm the stored values are storage ids:

```js
JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /^planner-\d/.test(k)))).days[0].subjects
```

A gray-tagged row must store `colorId: 6`, not `9`. A yellow-tagged row must store `7`, not `6`.

- [ ] **Step 7: Backward compatibility**

1. In devtools, take an existing week's stored JSON, delete every `colorId` field from it, and write it back.
2. Reload. Every row must load untagged, with no error in the console, and the rest of the week — subjects, checkboxes, time blocks, memo — must be intact.

This proves rows saved before this change still work.

- [ ] **Step 8: Clean up and report**

Clear any test data, stop the dev server, and report results. Do NOT merge to `main` — that deploys to the live site and is the user's call.
