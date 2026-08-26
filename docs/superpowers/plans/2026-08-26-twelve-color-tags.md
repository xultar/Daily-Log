# Twelve Color Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the color palette from nine tags to twelve — red, chartreuse and brown — with the key `0` selecting the tenth and the last two reachable only by picker.

**Architecture:** The palette is data. `BLOCK_COLORS` is append-only because stored blocks are array positions, and `COLOR_IDS_IN_DISPLAY_ORDER` decides presentation without touching storage. `tag-palette.ts` generates the `--tag-N` custom properties from the palette, so no CSS is written by hand. The one structural change is lifting the legend's border arithmetic out of JSX into a pure function, because twelve is even and that silently retires an assertion.

**Tech Stack:** React 18, TypeScript (`strict: false`), Vite, Tailwind, Vitest + Testing Library, jsdom.

---

## Before you start

Read `CLAUDE.md`, in particular **"The one rule that can corrupt user data"**. Two numbers here both look like "the colour number":

- **Storage id** — position in `BLOCK_COLORS`, persisted into `timeBlocks` and `planner-color-labels`. Never changes.
- **Display position** — position in `COLOR_IDS_IN_DISPLAY_ORDER`, what the user sees and what the number keys select.

They differ for four of the nine existing colours. Getting them backwards writes wrong values into weeks people have already planned.

Two habits this repo expects, and this plan assumes:

- **Mutation-test every test you write.** Break the line the test defends and confirm *that* test fails, not merely some test.
- **Verify the mutation applied.** A mutation that silently fails to apply and a mutation that survives look identical in the output. Check the file actually changed.

Baselines before you touch anything: `npm test` is 300 tests across 26 files, `npm run lint` is 0 errors and 10 pre-existing warnings, `npm run build` is clean.

Work on a branch. `twelve-color-tags` already exists and holds the spec. Pushing to `main` deploys, and `npm test` now gates that deploy.

---

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `src/lib/planner-data.ts` | Palette data, display-order translation, week domain logic | Modify: 3 palette entries, extend display order, add `legendCellBorders` |
| `src/components/planner/TimeGrid.tsx` | The time grid, painting, and the number-key handler | Modify: map `0` to display position 10 |
| `src/components/planner/DailyView.tsx` | The day view and its two-column colour legend | Modify: consume `legendCellBorders`, update the hint line |
| `src/test/legend-borders.test.tsx` | The legend's grid lines | Modify: unit-test the function, make the rendering tests literal |
| `src/test/planner-data.test.ts` | Palette and display-order invariants | Modify: the size tripwire, and reverse the "gray last" assertion |
| `src/test/week-repair.test.ts` | Repair of damaged stored weeks | Modify: its out-of-range fixture value stops being out of range |
| `src/test/color-keys.test.tsx` | Selecting a colour by keyboard | Create |

No CSS file changes. `tag-palette.ts` generates the tokens.

---

## A decision this plan makes that the spec did not

`planner-data.test.ts` asserts **"shows gray last"**. The 2026-08-24 spec deliberately moved gray to the end of the display order so it would not sit awkwardly mid-list.

Appending the three new colours puts them *after* gray, so gray is mid-list again and that test fails.

The alternative — `[1,2,3,4,5,7,8,9,10,11,12,6]` — keeps gray last but makes **key 9 select red instead of gray**. This plan does not do that. Positions 1-9 are protected, because muscle memory is worth more than display tidiness, and `colorIdForDisplayPosition(9) === 6` is already pinned by a separate test that must keep passing.

So the assertion is deliberately reversed in Task 5, with the reasoning written into the test. Do not delete it.

---

## Task 1: `legendCellBorders`

Lift the legend's border arithmetic into a pure function, so the odd-length behaviour stays testable once the palette itself is even.

**Files:**
- Modify: `src/lib/planner-data.ts`
- Test: `src/test/legend-borders.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to the top of `src/test/legend-borders.test.tsx`, and add `legendCellBorders` to the existing import from `@/lib/planner-data`:

```tsx
describe("legendCellBorders", () => {
  // Expectations are literal, never recomputed from the same formula the
  // implementation uses. A test that mirrors the arithmetic cannot fail when
  // the arithmetic is wrong — it reproduces the bug and agrees with it.

  it("keeps the bottom border off both cells of an even grid's last row", () => {
    // Twelve entries: indices 10 and 11 share the final row.
    const bottoms = Array.from({ length: 12 }, (_, i) => legendCellBorders(i, 12).bottom);
    expect(bottoms).toEqual([
      true, true, true, true, true,
      true, true, true, true, true,
      false, false,
    ]);
  });

  it("keeps it off the lone cell of an odd grid's last row", () => {
    // Nine entries: only index 8 is on the final row, alone.
    const bottoms = Array.from({ length: 9 }, (_, i) => legendCellBorders(i, 9).bottom);
    expect(bottoms).toEqual([true, true, true, true, true, true, true, true, false]);
  });

  it("draws a right border only on a cell that has one beside it", () => {
    const rights = Array.from({ length: 12 }, (_, i) => legendCellBorders(i, 12).right);
    expect(rights).toEqual([
      true, false, true, false, true, false,
      true, false, true, false, true, false,
    ]);
  });

  it("draws none on the lone cell of an odd grid, where it would stub into nothing", () => {
    expect(legendCellBorders(8, 9).right).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/test/legend-borders.test.tsx -t legendCellBorders`

Expected: FAIL. `legendCellBorders is not a function`.

- [ ] **Step 3: Implement it**

Add to `src/lib/planner-data.ts`, directly beneath `getPaletteInDisplayOrder`:

```ts
/**
 * Which grid lines a legend cell draws in a two-column grid inside a bordered
 * container. True means draw it.
 *
 * The container draws the outer edges, so a cell adds a line only where the
 * grid itself needs one: nothing along the bottom of the final row, where the
 * container's own border already sits, and nothing to the right of a cell that
 * has no neighbour — which is every odd index, and the lone cell of a final
 * odd row, where a right border stubs into the empty half.
 *
 * `count` is a parameter rather than read from the palette so the odd-length
 * case stays testable now that the palette itself is even. That case is not
 * hypothetical: it was the live behaviour until this change.
 */
export function legendCellBorders(
  index: number,
  count: number
): { bottom: boolean; right: boolean } {
  const lastRowStart = count - (count % 2 || 2);
  return {
    bottom: index < lastRowStart,
    right: index % 2 === 0 && index + 1 < count,
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/test/legend-borders.test.tsx`

Expected: PASS, all tests in the file.

- [ ] **Step 5: Mutation-test**

Change `count % 2 || 2` to `count % 2` and re-run. Confirm the even-grid bottom-border test fails, and confirm the file actually changed before believing the result. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/lib/planner-data.ts src/test/legend-borders.test.tsx
git commit -m "Lift the legend's border arithmetic out of the JSX"
```

---

## Task 2: `DailyView` consumes it

Behaviour-preserving. The palette is still nine here, so every existing rendering test must stay green.

**Files:**
- Modify: `src/components/planner/DailyView.tsx`

- [ ] **Step 1: Replace the inline arithmetic**

Add `legendCellBorders` to the existing import from `@/lib/planner-data`. Then replace these lines:

```tsx
                const inLastRow = index >= shown.length - (shown.length % 2 || 2);
                const hasCellToTheRight = index % 2 === 0 && index + 1 < shown.length;
```

with:

```tsx
                const borders = legendCellBorders(index, shown.length);
```

Delete the comment block above them that explains the arithmetic — it now lives on the function.

- [ ] **Step 2: Update the className**

Replace:

```tsx
                    inLastRow ? "" : "border-b"
                  } ${hasCellToTheRight ? "border-r" : ""} ${
```

with:

```tsx
                    borders.bottom ? "border-b" : ""
                  } ${borders.right ? "border-r" : ""} ${
```

Note the inversion: `inLastRow` meant *suppress*, `borders.bottom` means *draw*. Getting this backwards renders every border in exactly the wrong place, and the tests will say so.

- [ ] **Step 3: Run the legend tests**

Run: `npx vitest run src/test/legend-borders.test.tsx`

Expected: PASS. The rendering tests still describe a nine-entry palette and must be untouched by this task.

- [ ] **Step 4: Commit**

```bash
git add src/components/planner/DailyView.tsx
git commit -m "Draw legend borders from the shared function"
```

---

## Task 3: Make the rendering tests survive an even palette

Two of them are written for an odd palette. They must be rewritten **before** the palette grows, so that Task 4 does not have to distinguish a real regression from a stale expectation.

**Files:**
- Modify: `src/test/legend-borders.test.tsx`

- [ ] **Step 1: Replace the two count-dependent tests**

Delete these two tests entirely:

- `"leaves the bottom border off the last row, where the container's already is"`
- `"still separates every row above the last"`

Replace them with one that names its own fragility:

```tsx
  it("asks legendCellBorders which lines to draw, rather than deciding itself", () => {
    const cells = renderLegend();

    // Literal, and tied to the twelve-entry palette on purpose. If the palette
    // changes length this fails loudly and someone rereads it — which is
    // exactly what did not happen when nine became twelve and the lone-cell
    // assertion below quietly lost its subject.
    expect(cells).toHaveLength(12);

    const withBottom = cells.filter((c) => classesOf(c).includes("border-b"));
    const withRight = cells.filter((c) => classesOf(c).includes("border-r"));

    expect(withBottom).toHaveLength(10); // all but the final row's two
    expect(withRight).toHaveLength(6); // one per left-hand cell
    expect(classesOf(cells[10])).not.toContain("border-b");
    expect(classesOf(cells[11])).not.toContain("border-b");
  });
```

- [ ] **Step 2: Retire the lone-cell test honestly**

The test `"puts no right border on the lone cell of the final row"` has no subject at twelve entries. Delete it. Its behaviour is now covered by `legendCellBorders(8, 9).right` in Task 1, which can still exercise an odd palette.

Leave `"draws one cell per palette entry"` and `"draws a right border only where a cell actually sits to the right"` alone. Both derive from the rendered cell count and stay correct.

- [ ] **Step 3: Run and watch it fail**

Run: `npx vitest run src/test/legend-borders.test.tsx`

Expected: FAIL on `expect(cells).toHaveLength(12)`, receiving 9. That failure is correct — the palette has not grown yet. This is the one point in the plan where the suite is deliberately red, and Task 4 turns it green.

- [ ] **Step 4: Do not commit yet**

This task and Task 4 land together. A commit here would be a knowingly broken tree.

---

## Task 4: Grow the palette

**Files:**
- Modify: `src/lib/planner-data.ts`

- [ ] **Step 1: Append the three entries**

At the end of `BLOCK_COLORS`, after `{ id: 9, label: "Magenta", ... }`:

```ts
  { id: 10, label: "Red",        hsl: "4 65% 74%",    hslDark: "4 65% 52%" },
  { id: 11, label: "Chartreuse", hsl: "95 45% 74%",   hslDark: "95 45% 40%" },
  { id: 12, label: "Brown",      hsl: "30 38% 64%",   hslDark: "30 42% 34%" },
```

Append only. Never reorder: stored block values are positions in this array, and reordering repaints every saved week.

- [ ] **Step 2: Extend the display order**

Replace:

```ts
export const COLOR_IDS_IN_DISPLAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 7, 8, 9, 6];
```

with:

```ts
// Positions 1-9 are exactly what they were. Gray stays at position 9 even
// though three chromatic colours now follow it, because moving it would
// change what the 9 key selects, and muscle memory is worth more than a tidy
// ordering. Positions 11 and 12 have no key: the palette outran the number row.
export const COLOR_IDS_IN_DISPLAY_ORDER: readonly number[] = [
  1, 2, 3, 4, 5, 7, 8, 9, 6, 10, 11, 12,
];
```

- [ ] **Step 3: Run the legend tests**

Run: `npx vitest run src/test/legend-borders.test.tsx`

Expected: PASS. Task 3's `toHaveLength(12)` is now satisfied.

- [ ] **Step 4: Run everything and expect exactly three failures**

Run: `npm test`

Expected: FAIL, and precisely these three:

1. `planner-data.test.ts` → `"has nine entries"`
2. `planner-data.test.ts` → `"shows gray last"`
3. `week-repair.test.ts` → `"clears block values that are not a real colour"`

A fourth failure is a real regression. Stop and investigate rather than proceeding.

The third is the interesting one, and it is the reason this task and Task 5 are separate from the rest: **widening the palette changes what counts as damage.** That test feeds `10` to the repairer as a value "past the end of the palette" and asserts it clears to `0`. At twelve colours, `10` is a valid red block, so the repairer correctly keeps it. The test is not wrong about repair; its fixture is stale.

- [ ] **Step 5: Do not commit yet**

Task 5 resolves all three.

---

## Task 5: Fix the three tests the wider palette invalidates

None of these is deleted. Two are deliberate tripwires and one is a fixture, and all three are doing their job by failing.

**Files:**
- Modify: `src/test/planner-data.test.ts`
- Modify: `src/test/week-repair.test.ts`

- [ ] **Step 1: Update the size tripwire**

In `src/test/planner-data.test.ts`, replace:

```ts
  it("has nine entries", () => {
    expect(BLOCK_COLORS).toHaveLength(9);
  });
```

with:

```ts
  it("has twelve entries", () => {
    // A tripwire, not a fact. It exists so that growing the palette is a
    // deliberate act with a diff attached, rather than something that happens
    // to a file. Update the number when you mean to; never delete the test.
    expect(BLOCK_COLORS).toHaveLength(12);
  });
```

Change the test's name as well as the number. A test called "has nine entries" asserting twelve is worse than either.

- [ ] **Step 2: Reverse the gray assertion**

In the same file, replace:

```ts
  it("shows gray last", () => {
    expect(COLOR_IDS_IN_DISPLAY_ORDER[COLOR_IDS_IN_DISPLAY_ORDER.length - 1]).toBe(6);
  });
```

with:

```ts
  it("keeps gray at display position 9, where the 9 key has always put it", () => {
    // This deliberately reverses an earlier decision. The 2026-08-24 design
    // moved gray to the end so it would not sit mid-list; appending red,
    // chartreuse and brown puts it mid-list again. Restoring tidiness would
    // mean gray moving to position 12 and the 9 key selecting red instead —
    // silently retraining anyone with the shortcuts in their fingers.
    //
    // Display order costs nothing to change and muscle memory costs a lot, so
    // positions 1-9 are frozen and the new colours go on the end.
    expect(COLOR_IDS_IN_DISPLAY_ORDER[8]).toBe(6);
    expect(colorIdForDisplayPosition(9)).toBe(6);
  });
```

- [ ] **Step 3: Un-stale the repair fixture**

In `src/test/week-repair.test.ts`, add `BLOCK_COLORS` to the existing import — the file currently imports only `loadWeek, getWeekKey, getWeekDates, createEmptyWeek`:

```ts
import { loadWeek, getWeekKey, getWeekDates, createEmptyWeek, BLOCK_COLORS } from "@/lib/planner-data";
```

Then replace the fixture and its comment:

```ts
    // null is the documented failure mode of a missing colorIdForDisplayPosition
    // guard; 10 is past the end of the palette; "3" and NaN come from hand-edited
    // or third-party-written JSON.
    week.days[0].timeBlocks[0] = [null, 10, -1, "3", NaN, 2];
```

with:

```ts
    // null is the documented failure mode of a missing colorIdForDisplayPosition
    // guard; "3" and NaN come from hand-edited or third-party-written JSON.
    //
    // The out-of-range value is computed, not literal. This line used to say
    // 10, which stopped being damage the moment the palette grew past nine —
    // the test then failed for a reason that had nothing to do with repair.
    // One past the end is the boundary worth testing anyway.
    week.days[0].timeBlocks[0] = [null, BLOCK_COLORS.length + 1, -1, "3", NaN, 2];
```

`planner-data.test.ts` already uses `BLOCK_COLORS.length + 1` for exactly this, so the convention is the repo's, not a new one.

- [ ] **Step 4: Run the full suite**

Run: `npm test`

Expected: PASS, all files. The count rises by the tests added in Task 1.

- [ ] **Step 5: Mutation-test the freeze**

Change the display order to `[1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 6]` — the tidy ordering this decision rejects. Confirm the gray test fails, and that `"is a permutation of the palette ids"` still passes, which shows the permutation test alone would never have caught it. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/lib/planner-data.ts src/test/legend-borders.test.tsx src/test/planner-data.test.ts src/test/week-repair.test.ts
git commit -m "Add red, chartreuse and brown to the palette"
```

---

## Task 6: The `0` key

**Files:**
- Modify: `src/components/planner/TimeGrid.tsx:97`
- Test: `src/test/color-keys.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/test/color-keys.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import TimeGrid from "@/components/planner/TimeGrid";
import { createEmptyDay } from "@/lib/planner-data";

const MONDAY = new Date(2026, 7, 24);

const setup = () => {
  const onActiveColorChange = vi.fn();
  render(
    <TimeGrid
      timeBlocks={createEmptyDay(MONDAY).timeBlocks}
      onChange={() => {}}
      activeColor={1}
      onActiveColorChange={onActiveColorChange}
    />
  );
  return onActiveColorChange;
};

afterEach(cleanup);

describe("selecting a colour by key", () => {
  it("maps 0 to display position 10, which is red", () => {
    // Literal expectations. Calling colorIdForDisplayPosition here would
    // reproduce the translation the handler performs, and agree with it even
    // when it is wrong.
    const onActiveColorChange = setup();
    fireEvent.keyDown(window, { key: "0" });
    expect(onActiveColorChange).toHaveBeenCalledWith(10);
  });

  it("still maps 9 to gray, whose storage id is 6", () => {
    // The muscle-memory guarantee, from the other side: this is the position
    // most likely to be broken by a tidier display order.
    const onActiveColorChange = setup();
    fireEvent.keyDown(window, { key: "9" });
    expect(onActiveColorChange).toHaveBeenCalledWith(6);
  });

  it("still maps 6 to yellow, whose storage id is 7", () => {
    // One of the four positions where display position and storage id differ.
    const onActiveColorChange = setup();
    fireEvent.keyDown(window, { key: "6" });
    expect(onActiveColorChange).toHaveBeenCalledWith(7);
  });

  it("leaves positions 11 and 12 without a key", () => {
    // Nothing on the number row can reach chartreuse or brown. If a key is
    // ever added for them, this test should be the thing that objects.
    const onActiveColorChange = setup();
    for (const key of ["-", "=", "a"]) {
      fireEvent.keyDown(window, { key });
    }
    expect(onActiveColorChange).not.toHaveBeenCalled();
  });

  it("types a zero into a label instead of repainting", () => {
    // The handler is on window, so without its INPUT guard every digit typed
    // into a colour label would also repaint the grid.
    const onActiveColorChange = setup();
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "0" });
    expect(onActiveColorChange).not.toHaveBeenCalled();
    input.remove();
  });
});
```

- [ ] **Step 2: Run and watch the right one fail**

Run: `npx vitest run src/test/color-keys.test.tsx`

Expected: FAIL on `"maps 0 to display position 10"` only. The other four pass already — they describe behaviour that exists, and they are here to stop this change breaking it.

`parseInt("0")` is `0`, so `COLOR_IDS_IN_DISPLAY_ORDER[-1]` is `undefined` and the handler returns null today. That is why `0` currently does nothing.

- [ ] **Step 3: Implement**

In `src/components/planner/TimeGrid.tsx`, replace:

```tsx
      const colorId = colorIdForDisplayPosition(parseInt(e.key));
```

with:

```tsx
      // "0" is the tenth key on the number row, so it means display position
      // 10. Positions 11 and 12 have no key at all: twelve colours outran the
      // row, and Shift+digit was rejected as a shortcut nobody discovers.
      const position = e.key === "0" ? 10 : parseInt(e.key);
      const colorId = colorIdForDisplayPosition(position);
```

Leave the `colorId !== null` guard exactly as it is. `strict: false` means the compiler will not enforce it, and an unguarded null written into `timeBlocks` fails silently in both directions — the block looks unpainted and the day total still looks right.

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run src/test/color-keys.test.tsx`

Expected: PASS, five tests.

- [ ] **Step 5: Mutation-test**

Delete the `colorId !== null` guard and re-run: confirm a test fails rather than a null being passed on. Then change `10` to `11` in the new line and confirm the first test fails. Verify each mutation actually reached the file. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/components/planner/TimeGrid.tsx src/test/color-keys.test.tsx
git commit -m "Select the tenth colour with the 0 key"
```

---

## Task 7: The hint line

**Files:**
- Modify: `src/components/planner/DailyView.tsx`

- [ ] **Step 1: Update the text**

Replace:

```tsx
            Press 1&ndash;9 to switch color &middot; Right-click block to pick color
```

with:

```tsx
            Press 1&ndash;9 or 0 to switch color &middot; Right-click block to pick color
```

The hint deliberately does not mention chartreuse and brown having no key. The right-click half of the sentence already tells the user where every colour lives.

- [ ] **Step 2: Run the suite and commit**

Run: `npm test`

Expected: PASS.

```bash
git add src/components/planner/DailyView.tsx
git commit -m "Name the 0 key in the legend hint"
```

---

## Task 8: Verify in a browser, then in print

jsdom has no colour and no layout. Everything above proves the wiring; none of it proves the palette is legible, which is the actual point of the change.

**Files:** none.

- [ ] **Step 1: Start the preview**

Use the `daily-log` launch configuration. The dev server serves at `http://localhost:8080/Daily-Log/` — the base path applies in development too, and the bare origin renders blank.

- [ ] **Step 2: Paint every colour into one day**

Open the day view. Paint a run of each of the twelve tags into the time grid, adjacent, so the risky pairs sit side by side. Use right-click to reach positions 11 and 12.

Seed via `localStorage` if that is faster, but check the rendered grid, not the stored values.

- [ ] **Step 3: Judge the three pairs, in both themes**

Toggle light and dark. At the grid's real 10px block size:

- **red against pink** — the pair the 2026-08-24 spec rejected on hue. They are 24 degrees apart and separated by eight points of lightness.
- **brown against orange** — five degrees apart, so the entire separation is 27 points of saturation and 14 of lightness.
- **chartreuse against yellow and green** — the safe one; confirm rather than assume.

If a pair blurs, widen saturation and lightness, not hue. Brown cannot move toward yellow without hitting chartreuse, and red cannot move toward orange without hitting it too.

- [ ] **Step 4: Check the print path**

Print-preview the day. Positions 10, 11 and 12 are the first two-digit run labels this has ever produced, inside a 10px block.

If two digits do not fit, change the print rule's font size. Do not change the numbering — the numbers are what make a mono print readable, and they must match the legend.

- [ ] **Step 5: Screenshot both themes and the print preview**

Attach them to the final report. This is the only evidence for the part of the change tests cannot reach.

- [ ] **Step 6: Full verification**

Run: `npm test` — expect all green.
Run: `npm run lint` — expect 0 errors, 10 warnings. Not 11.
Run: `npm run build` — expect clean.

- [ ] **Step 7: Update `CLAUDE.md`**

Under **"The one rule that can corrupt user data"**, the display-order example lists the nine-entry array and says four of nine colours differ between storage id and display position. Both are now stale. Update the array to twelve entries and re-count the mismatches.

Add to the same section that positions 1-9 are frozen by the muscle-memory decision, and that positions 11 and 12 have no key.

Update **Baselines** with the new test count.

```bash
git add CLAUDE.md
git commit -m "Record the twelve-tag palette"
```

---

## Out of scope

Do not attempt these here. Each is separately wanted and separately designed.

- The `<input>` nested inside a `<button>` in the daily legend. It is invalid HTML and it is next, but it should be designed against twelve cells rather than nine.
- Editing colour labels from the weekly strip, which is blocked on that restructure.
- Colourblind-safe patterning.
- A thirteenth colour. Hue is exhausted; the next one commits to a light-and-dark tier system.
