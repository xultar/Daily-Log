# Additional color tags implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the planner's time-block palette from six color tags to nine, with a display order that puts gray last without changing any stored data.

**Architecture:** `BLOCK_COLORS` stays append-only because a stored block value is an index into it. A separate `COLOR_IDS_IN_DISPLAY_ORDER` list controls presentation, and two small helpers in `planner-data.ts` are the only place display position translates to storage id. Components consume the helpers and never sort or map ids by hand.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind, Vitest with jsdom.

Spec: `docs/superpowers/specs/2026-08-24-additional-color-tags-design.md`

---

## Vocabulary

Two numbers identify a color and they are not the same. Getting this backwards writes wrong values into a user's saved weeks.

- **Storage id** — the number written into `timeBlocks` and used as the key in `planner-color-labels`. It equals the entry's 1-based position in `BLOCK_COLORS`. It never changes.
- **Display position** — the 1-based position in `COLOR_IDS_IN_DISPLAY_ORDER`. This is the number the user sees beside a swatch and the number key that selects it.

For yellow, teal, magenta and gray the two differ. Yellow is storage id 7 and display position 6. Gray is storage id 6 and display position 9.

---

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/lib/planner-data.ts` | Palette data, display order, id translation | Modify |
| `src/test/planner-data.test.ts` | Unit tests for the above | Create |
| `src/components/planner/TimeGrid.tsx` | Number-key shortcuts, right-click picker | Modify |
| `src/components/planner/DailyView.tsx` | Color legend, keyboard hint text | Modify |

All translation logic lives in `planner-data.ts`. The two components read from it and pass storage ids back. No component computes a display position itself beyond using the array index it is already iterating.

---

## Task 1: Extend the palette to nine colors

**Files:**
- Test: `src/test/planner-data.test.ts` (create)
- Modify: `src/lib/planner-data.ts:112-120`

- [ ] **Step 1: Write the failing tests**

Create `src/test/planner-data.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BLOCK_COLORS, getBlockColor } from "@/lib/planner-data";

describe("BLOCK_COLORS", () => {
  it("has nine entries", () => {
    expect(BLOCK_COLORS).toHaveLength(9);
  });

  it("has unique ids numbered sequentially from 1", () => {
    const ids = BLOCK_COLORS.map((c) => c.id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps gray at storage id 6 so saved weeks are not repainted", () => {
    expect(BLOCK_COLORS[5].label).toBe("Gray");
  });
});

describe("getBlockColor", () => {
  it("returns null for an empty block", () => {
    expect(getBlockColor(0, false)).toBeNull();
    expect(getBlockColor(0, true)).toBeNull();
  });

  it("returns the light color for every id", () => {
    for (const c of BLOCK_COLORS) {
      expect(getBlockColor(c.id, false)).toBe(`hsl(${c.hsl})`);
    }
  });

  it("returns the dark color for every id", () => {
    for (const c of BLOCK_COLORS) {
      expect(getBlockColor(c.id, true)).toBe(`hsl(${c.hslDark})`);
    }
  });

  it("returns null for an out-of-range value instead of throwing", () => {
    expect(getBlockColor(10, false)).toBeNull();
    expect(getBlockColor(99, true)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/planner-data.test.ts`

Expected: FAIL. Two failures, both in the `BLOCK_COLORS` block — `has nine entries` reports "expected length 9, received 6", and `has unique ids numbered sequentially from 1` reports the array `[1,2,3,4,5,6]` against `[1,...,9]`.

The `getBlockColor` tests pass already because the function is written generically. That is expected and correct — they are guarding behavior through the change, not driving it.

- [ ] **Step 3: Add the three palette entries**

In `src/lib/planner-data.ts`, replace the `BLOCK_COLORS` block and its comment:

```ts
/**
 * Block color palette. A stored block value is this array's 1-based index, so
 * entries may only be APPENDED — never reordered or removed, or every saved
 * week that used a moved color is silently repainted.
 * To change how the palette is presented, edit COLOR_IDS_IN_DISPLAY_ORDER instead.
 * Index 0 = empty.
 */
export const BLOCK_COLORS = [
  { id: 1, label: "Blue",     hsl: "213 60% 80%",  hslDark: "213 50% 40%" },
  { id: 2, label: "Pink",     hsl: "340 55% 82%",  hslDark: "340 45% 42%" },
  { id: 3, label: "Green",    hsl: "140 35% 75%",  hslDark: "140 30% 38%" },
  { id: 4, label: "Lavender", hsl: "270 40% 80%",  hslDark: "270 35% 42%" },
  { id: 5, label: "Orange",   hsl: "25 65% 78%",   hslDark: "25 55% 40%" },
  { id: 6, label: "Gray",     hsl: "0 0% 78%",     hslDark: "0 0% 42%" },
  { id: 7, label: "Yellow",   hsl: "50 70% 76%",   hslDark: "50 55% 38%" },
  { id: 8, label: "Teal",     hsl: "178 40% 74%",  hslDark: "178 35% 36%" },
  { id: 9, label: "Magenta",  hsl: "305 40% 80%",  hslDark: "305 35% 42%" },
];
```

- [ ] **Step 4: Update the stale range comment on `timeBlocks`**

In the same file, in the `DayData` interface, change this line:

```ts
  timeBlocks: number[][]; // [hour_index][minute_block_index] - 0=empty, 1-6=color index
```

to:

```ts
  timeBlocks: number[][]; // [hour_index][minute_block_index] - 0=empty, else BLOCK_COLORS index
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/test/planner-data.test.ts`

Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/planner-data.ts src/test/planner-data.test.ts
git commit -m "Add yellow, teal and magenta to the block palette"
```

---

## Task 2: Add the display order and its helpers

**Files:**
- Modify: `src/test/planner-data.test.ts`
- Modify: `src/lib/planner-data.ts` (append after `getBlockColor`)

- [ ] **Step 1: Write the failing tests**

Extend the import at the top of `src/test/planner-data.test.ts` to:

```ts
import {
  BLOCK_COLORS,
  getBlockColor,
  COLOR_IDS_IN_DISPLAY_ORDER,
  getPaletteInDisplayOrder,
  colorIdForDisplayPosition,
} from "@/lib/planner-data";
```

Then append:

```ts
describe("COLOR_IDS_IN_DISPLAY_ORDER", () => {
  it("is a permutation of the palette ids", () => {
    const ids = BLOCK_COLORS.map((c) => c.id).sort((a, b) => a - b);
    const ordered = [...COLOR_IDS_IN_DISPLAY_ORDER].sort((a, b) => a - b);
    expect(ordered).toEqual(ids);
  });

  it("shows gray last", () => {
    expect(COLOR_IDS_IN_DISPLAY_ORDER[COLOR_IDS_IN_DISPLAY_ORDER.length - 1]).toBe(6);
  });
});

describe("getPaletteInDisplayOrder", () => {
  it("returns every entry, in COLOR_IDS_IN_DISPLAY_ORDER sequence", () => {
    const shown = getPaletteInDisplayOrder();
    expect(shown).toHaveLength(BLOCK_COLORS.length);
    expect(shown.map((c) => c.id)).toEqual(COLOR_IDS_IN_DISPLAY_ORDER);
  });
});

describe("colorIdForDisplayPosition", () => {
  it("maps a 1-based display position to a storage id", () => {
    expect(colorIdForDisplayPosition(1)).toBe(1);
    expect(colorIdForDisplayPosition(6)).toBe(7);
    expect(colorIdForDisplayPosition(9)).toBe(6);
  });

  it("returns null outside the palette", () => {
    expect(colorIdForDisplayPosition(0)).toBeNull();
    expect(colorIdForDisplayPosition(10)).toBeNull();
    expect(colorIdForDisplayPosition(NaN)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/planner-data.test.ts`

Expected: FAIL at import — the file will not compile because `COLOR_IDS_IN_DISPLAY_ORDER`, `getPaletteInDisplayOrder` and `colorIdForDisplayPosition` do not exist yet.

- [ ] **Step 3: Implement the display order and helpers**

In `src/lib/planner-data.ts`, immediately after the `getBlockColor` function, add:

```ts
/**
 * Presentation order for the palette, listed by storage id.
 * Storage ids are positions in BLOCK_COLORS and must never move; reorder this
 * list instead. Gray sits last here while keeping storage id 6.
 */
export const COLOR_IDS_IN_DISPLAY_ORDER = [1, 2, 3, 4, 5, 7, 8, 9, 6];

/** The palette in the order it should be shown to the user. */
export function getPaletteInDisplayOrder() {
  return COLOR_IDS_IN_DISPLAY_ORDER.map((id) => BLOCK_COLORS[id - 1]);
}

/**
 * Translate a 1-based display position (what the user sees and types) into the
 * storage id written to timeBlocks. Returns null for anything off the palette.
 */
export function colorIdForDisplayPosition(position: number): number | null {
  return COLOR_IDS_IN_DISPLAY_ORDER[position - 1] ?? null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/planner-data.test.ts`

Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planner-data.ts src/test/planner-data.test.ts
git commit -m "Add COLOR_IDS_IN_DISPLAY_ORDER to decouple display order from storage ids"
```

---

## Task 3: Wire the grid's shortcuts and picker to display order

**Files:**
- Modify: `src/components/planner/TimeGrid.tsx:2` (import)
- Modify: `src/components/planner/TimeGrid.tsx:87-99` (keyboard handler)
- Modify: `src/components/planner/TimeGrid.tsx:154-164` (picker buttons)

There is no test step in this task. The logic it depends on — the position-to-id translation — is already covered by Task 2. What remains here is wiring, verified by hand in Task 5.

- [ ] **Step 1: Update the import**

Change line 2 from:

```ts
import { HOUR_LABELS, BLOCK_COLORS, getBlockColor } from "@/lib/planner-data";
```

to:

```ts
import {
  HOUR_LABELS,
  getBlockColor,
  getPaletteInDisplayOrder,
  colorIdForDisplayPosition,
} from "@/lib/planner-data";
```

`BLOCK_COLORS` is no longer referenced directly in this file.

- [ ] **Step 2: Replace the keyboard handler**

Replace the whole `useEffect` block that currently reads:

```ts
  // Keyboard shortcuts 1-6 to change active color
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const num = parseInt(e.key);
      if (num >= 1 && num <= 6) {
        setActiveColor(num);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setActiveColor]);
```

with:

```ts
  // Number keys select by display position, not storage id
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const colorId = colorIdForDisplayPosition(parseInt(e.key));
      if (colorId !== null) {
        setActiveColor(colorId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setActiveColor]);
```

`parseInt` returns `NaN` for non-numeric keys, and `colorIdForDisplayPosition` returns `null` for `NaN`, so letters and symbols are ignored as before.

- [ ] **Step 3: Update the picker buttons**

In the context menu, replace:

```tsx
          {BLOCK_COLORS.map((c) => (
            <button
              key={c.id}
              className="w-6 h-6 rounded-sm border border-border/50 hover:scale-110 transition-transform flex items-center justify-center text-[9px] font-bold"
              style={{ backgroundColor: `hsl(${isDark ? c.hslDark : c.hsl})` }}
              title={`${c.label} (${c.id})`}
              onClick={() => pickColor(c.id)}
            >
              {c.id}
            </button>
          ))}
```

with:

```tsx
          {getPaletteInDisplayOrder().map((c, index) => (
            <button
              key={c.id}
              className="w-6 h-6 rounded-sm border border-border/50 hover:scale-110 transition-transform flex items-center justify-center text-[9px] font-bold"
              style={{ backgroundColor: `hsl(${isDark ? c.hslDark : c.hsl})` }}
              title={`${c.label} (${index + 1})`}
              onClick={() => pickColor(c.id)}
            >
              {index + 1}
            </button>
          ))}
```

The button still passes `c.id` to `pickColor`, so the value written into `timeBlocks` is the storage id. Only the visible number changes.

- [ ] **Step 4: Confirm it compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json`

Expected: no output, which means no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/planner/TimeGrid.tsx
git commit -m "Select block colors by display position in the time grid"
```

---

## Task 4: Wire the legend to display order

**Files:**
- Modify: `src/components/planner/DailyView.tsx:3` (import)
- Modify: `src/components/planner/DailyView.tsx:136-167` (legend items)
- Modify: `src/components/planner/DailyView.tsx:170-172` (hint text)

- [ ] **Step 1: Update the import**

Change line 3 from:

```ts
import { DayData, calcDayTotal, BLOCK_COLORS, loadColorLabels, saveColorLabels } from "@/lib/planner-data";
```

to:

```ts
import { DayData, calcDayTotal, getPaletteInDisplayOrder, loadColorLabels, saveColorLabels } from "@/lib/planner-data";
```

- [ ] **Step 2: Iterate in display order and number by position**

In the legend grid, change the opening of the map from:

```tsx
              {BLOCK_COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveColor(c.id)}
                  className={`flex items-center gap-1.5 px-2 py-1 border-b border-r border-border/50 transition-all ${
```

to:

```tsx
              {getPaletteInDisplayOrder().map((c, index, shown) => (
                <button
                  key={c.id}
                  onClick={() => setActiveColor(c.id)}
                  className={`flex items-center gap-1.5 px-2 py-1 border-b border-border/50 transition-all ${
                    index === shown.length - 1 ? "" : "border-r"
                  } ${
```

This drops the trailing right border on the final item so the lone ninth cell does not read as a broken row.

Then change the number shown beside the swatch from:

```tsx
                  <span className="text-[10px] font-medium text-foreground/50 w-3">{c.id}</span>
```

to:

```tsx
                  <span className="text-[10px] font-medium text-foreground/50 w-3">{index + 1}</span>
```

Leave `colorLabels[c.id]`, `updateLabel(c.id, ...)` and `colorMinutes[c.id]` exactly as they are. Those are keyed by storage id on purpose, so a label the user already typed stays attached to its color.

- [ ] **Step 3: Update the keyboard hint**

Change:

```tsx
            Press 1–6 to switch color &middot; Right-click block to pick color
```

to:

```tsx
            Press 1–9 to switch color &middot; Right-click block to pick color
```

The character between the digits is an en dash, not a hyphen. Keep it.

- [ ] **Step 4: Confirm it compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json`

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/planner/DailyView.tsx
git commit -m "Show the color legend in display order with position numbers"
```

---

## Task 5: Full verification

**Files:** none modified unless a check fails.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: PASS. 15 tests across 2 files — 14 in `planner-data.test.ts` plus the existing placeholder in `example.test.ts`.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: `0 errors`. Ten `react-refresh` warnings in vendored shadcn/ui files are pre-existing and out of scope. If the error count is above zero, the change introduced it — fix before continuing.

- [ ] **Step 3: Build**

Run: `npm run build`

Expected: `built in ...` with no errors.

- [ ] **Step 4: Verify the new colors reach the bundle**

Run: `grep -c "305 40% 80%" dist/assets/*.js`

Expected: `1` or more. This confirms magenta survived tree-shaking and minification. Repeat for `50 70% 76%` and `178 40% 74%` to confirm all three.

- [ ] **Step 5: Check by hand in the browser**

Run `npm run dev` and open `http://localhost:8080`.

Confirm each of these:

1. The legend lists nine tags, numbered 1 through 9 in order, with gray last.
2. Pressing `9` selects gray, and `6` selects yellow.
3. Painting a block with each of the nine produces nine visibly different colors.
4. Typing in a legend label field does not change the active color.
4b. With the grid focused, press `0` and then a letter key. Neither may paint or
   alter a block. This matters because `tsconfig.app.json` sets `strict: false`,
   so the `number | null` return from `colorIdForDisplayPosition` is a
   documentation promise the compiler does not enforce. A missing null guard
   would write `null` into `timeBlocks`, which persists to localStorage and
   degrades silently rather than crashing.
5. Right-clicking a block shows ten buttons — nine numbered swatches plus clear.
6. Reload the page. Painted blocks keep their colors and typed labels persist.

Point 6 is the one that matters most. It is the check that the storage id split did not corrupt anything.

- [ ] **Step 6: Verify against a pre-existing week**

If a week was planned before this change, open it and confirm every previously painted block still shows the color it had. Blocks painted gray must still be gray, not yellow. This is the regression the append-only rule exists to prevent.

- [ ] **Step 7: Commit any fixes, then report**

If steps 1-6 all passed with no changes needed, there is nothing to commit. Report the results and stop. Do not merge to `main` — the branch deploys to the live site on merge, and that is the user's call.
