# Weekly legend implementation plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the weekly view a color legend showing which tag is armed and how many minutes each color took this week, by lifting the active color out of the individual views up to `StudyPlanner`.

**Architecture:** `StudyPlanner` becomes the single owner of `activeColor` and passes it to both `DailyView` and `DayColumn`, which forward it to `TimeGrid`. Per-color minute totals move out of `DailyView`'s component body into pure functions in `planner-data.ts` so the weekly strip and the daily legend share one implementation. The strip itself is a new self-contained component.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind, Vitest with jsdom.

Spec: `docs/superpowers/specs/2026-08-24-weekly-legend-and-row-color-tags-design.md` (Phase 1 only; Phase 2 gets its own plan after this ships)

---

## Vocabulary

Carried forward from the color-tag work. Two numbers identify a color and they are not the same.

- **Storage id** — the number written into `timeBlocks` and used as the key in `planner-color-labels`. Equals the 1-based position in `BLOCK_COLORS`. Never changes.
- **Display position** — the 1-based position in `COLOR_IDS_IN_DISPLAY_ORDER`. What the user sees beside a swatch and what the number keys select.

`activeColor` is a **storage id**. The minute records built in Task 1 are keyed by **storage id**. Display position appears only in rendering, via the array index from `getPaletteInDisplayOrder()`.

---

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/lib/planner-data.ts` | Per-color minute totals, duration formatting | Modify |
| `src/test/planner-data.test.ts` | Unit tests for the above | Modify |
| `src/components/planner/StudyPlanner.tsx` | Owns `activeColor`; weekly layout | Modify |
| `src/components/planner/DailyView.tsx` | Consumes `activeColor` as props | Modify |
| `src/components/planner/DayColumn.tsx` | Forwards `activeColor` to `TimeGrid` | Modify |
| `src/components/planner/WeeklyColorLegend.tsx` | The footer strip | Create |

`TimeGrid.tsx` is modified once, at the end of Task 2, to make `activeColor` and
`onActiveColorChange` REQUIRED and delete the now-unreachable `internalColor`
fallback. See Task 2 Step 8. Nothing else in that file changes.

Do not attempt to consolidate `TimeGrid`'s keydown listener. Once the weekly view
is controlled, all seven mounted grids will register a `window` listener and all
seven will call the same setter with the same value on a digit press. React
collapses identical state updates into one render, so the cost is negligible.
Moving that handler up would mean relocating the modifier guard, the
contenteditable and Radix menu guards, and the display-position translation —
logic hardened across three review rounds. The spec records this as a deliberate
decision, not an oversight.

---

## Task 1: Per-color minutes and duration formatting

**Files:**
- Modify: `src/test/planner-data.test.ts`
- Modify: `src/lib/planner-data.ts`

- [ ] **Step 1: Write the failing tests**

Extend the import at the top of `src/test/planner-data.test.ts` to add the five new names:

```ts
import {
  BLOCK_COLORS,
  getBlockColor,
  COLOR_IDS_IN_DISPLAY_ORDER,
  getPaletteInDisplayOrder,
  colorIdForDisplayPosition,
  createEmptyDay,
  createEmptyWeek,
  calcDayColorMinutes,
  calcWeekColorMinutes,
  formatMinutes,
} from "@/lib/planner-data";
```

Then append:

```ts
const MONDAY = new Date(2026, 7, 24);

describe("calcDayColorMinutes", () => {
  it("returns an empty record for a day with no painted blocks", () => {
    expect(calcDayColorMinutes(createEmptyDay(MONDAY))).toEqual({});
  });

  it("counts ten minutes per painted block, keyed by storage id", () => {
    const day = createEmptyDay(MONDAY);
    day.timeBlocks[0][0] = 1;
    day.timeBlocks[0][1] = 1;
    day.timeBlocks[0][2] = 3;
    expect(calcDayColorMinutes(day)).toEqual({ 1: 20, 3: 10 });
  });

  it("keys by storage id, not display position", () => {
    const day = createEmptyDay(MONDAY);
    day.timeBlocks[0][0] = 6;
    const result = calcDayColorMinutes(day);
    expect(result[6]).toBe(10);
    expect(result[9]).toBeUndefined();
  });
});

describe("calcWeekColorMinutes", () => {
  it("returns an empty record for an untouched week", () => {
    expect(calcWeekColorMinutes(createEmptyWeek(MONDAY))).toEqual({});
  });

  it("sums one color across several days", () => {
    const week = createEmptyWeek(MONDAY);
    week.days[0].timeBlocks[0][0] = 3;
    week.days[2].timeBlocks[1][0] = 3;
    week.days[2].timeBlocks[1][1] = 3;
    expect(calcWeekColorMinutes(week)).toEqual({ 3: 30 });
  });

  it("keeps colors separate and omits colors with no blocks", () => {
    const week = createEmptyWeek(MONDAY);
    week.days[1].timeBlocks[0][0] = 7;
    week.days[4].timeBlocks[0][0] = 6;
    const result = calcWeekColorMinutes(week);
    expect(result).toEqual({ 6: 10, 7: 10 });
    expect(result[9]).toBeUndefined();
  });
});

describe("formatMinutes", () => {
  it("shows minutes alone under an hour", () => {
    expect(formatMinutes(40)).toBe("40m");
    expect(formatMinutes(10)).toBe("10m");
  });

  it("shows hours alone on a whole hour", () => {
    expect(formatMinutes(120)).toBe("2h");
  });

  it("shows both when there is a remainder", () => {
    expect(formatMinutes(150)).toBe("2h 30m");
  });

  it("shows zero as minutes", () => {
    expect(formatMinutes(0)).toBe("0m");
  });
});
```

`MONDAY` is built with `new Date(2026, 7, 24)` — month is 0-indexed, so that is 24 August 2026. Using the numeric constructor rather than a string avoids timezone parsing differences between machines.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/planner-data.test.ts`

Expected: FAIL at import — the file will not compile because `calcDayColorMinutes`, `calcWeekColorMinutes` and `formatMinutes` do not exist. `createEmptyDay` and `createEmptyWeek` already exist and will resolve.

- [ ] **Step 3: Implement the three functions**

In `src/lib/planner-data.ts`, immediately after the existing `calcDayTotal` function, add:

```ts
/** Minutes spent on each color in one day, keyed by storage id. */
export function calcDayColorMinutes(day: DayData): Record<number, number> {
  const minutes: Record<number, number> = {};
  for (const hourBlocks of day.timeBlocks) {
    for (const block of hourBlocks) {
      if (block) minutes[block] = (minutes[block] ?? 0) + 10;
    }
  }
  return minutes;
}

/** Minutes spent on each color across a whole week, keyed by storage id. */
export function calcWeekColorMinutes(week: WeekData): Record<number, number> {
  const minutes: Record<number, number> = {};
  for (const day of week.days) {
    for (const [id, mins] of Object.entries(calcDayColorMinutes(day))) {
      const storageId = Number(id);
      minutes[storageId] = (minutes[storageId] ?? 0) + mins;
    }
  }
  return minutes;
}

/** Render a duration as "40m", "2h" or "2h 30m". */
export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/planner-data.test.ts`

Expected: PASS, 24 tests in this file (14 existing plus 10 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/planner-data.ts src/test/planner-data.test.ts
git commit -m "Add per-color minute totals and duration formatting"
```

---

## Task 2: Lift activeColor to StudyPlanner

**Files:**
- Modify: `src/components/planner/StudyPlanner.tsx`
- Modify: `src/components/planner/DailyView.tsx`
- Modify: `src/components/planner/DayColumn.tsx`

No test step. This is prop plumbing with no new logic; Task 4 verifies it in a browser.

- [ ] **Step 1: Add the state to StudyPlanner**

In `src/components/planner/StudyPlanner.tsx`, after the `showWeekends` state declaration, add:

```ts
  // Storage id of the armed color, shared by every view. Not a display position.
  const [activeColor, setActiveColor] = useState(1);
```

- [ ] **Step 2: Change DailyView's props**

In `src/components/planner/DailyView.tsx`, change the props interface from:

```ts
interface DailyViewProps {
  day: DayData;
  dayIndex: number;
  onChange: (day: DayData) => void;
}
```

to:

```ts
interface DailyViewProps {
  day: DayData;
  dayIndex: number;
  onChange: (day: DayData) => void;
  activeColor: number;
  onActiveColorChange: (color: number) => void;
}
```

Change the component signature from:

```tsx
const DailyView: React.FC<DailyViewProps> = ({ day, dayIndex, onChange }) => {
```

to:

```tsx
const DailyView: React.FC<DailyViewProps> = ({ day, dayIndex, onChange, activeColor, onActiveColorChange }) => {
```

Delete this line entirely:

```ts
  const [activeColor, setActiveColor] = useState(1);
```

Then replace every remaining use of `setActiveColor` in this file with `onActiveColorChange`. There are exactly two: the legend button's `onClick={() => setActiveColor(c.id)}`, and the `onActiveColorChange={setActiveColor}` prop passed to `TimeGrid`.

After the edit, `grep -n "setActiveColor" src/components/planner/DailyView.tsx` must return nothing.

- [ ] **Step 3: Use the extracted minute calculator in DailyView**

Still in `DailyView.tsx`, delete this block from the component body:

```ts
  // Count minutes per color
  const colorMinutes: Record<number, number> = {};
  for (const hourBlocks of day.timeBlocks) {
    for (const block of hourBlocks) {
      if (block) colorMinutes[block] = (colorMinutes[block] ?? 0) + 10;
    }
  }
```

and replace it with:

```ts
  const colorMinutes = calcDayColorMinutes(day);
```

Add `calcDayColorMinutes` and `formatMinutes` to the existing import from `@/lib/planner-data` at the top of the file.

Then replace the legend's inline duration rendering. Change:

```tsx
                  {(colorMinutes[c.id] ?? 0) > 0 && (
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {Math.floor((colorMinutes[c.id] ?? 0) / 60) > 0
                        ? `${Math.floor((colorMinutes[c.id] ?? 0) / 60)}h ${(colorMinutes[c.id] ?? 0) % 60 > 0 ? `${(colorMinutes[c.id] ?? 0) % 60}m` : ""}`
                        : `${colorMinutes[c.id]}m`}
                    </span>
                  )}
```

to:

```tsx
                  {(colorMinutes[c.id] ?? 0) > 0 && (
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {formatMinutes(colorMinutes[c.id])}
                    </span>
                  )}
```

This is a behavior change in one visible detail: a whole-hour total previously rendered as `2h ` with a trailing space, and now renders as `2h`. That is the intended improvement.

- [ ] **Step 4: Change DayColumn's props**

In `src/components/planner/DayColumn.tsx`, change the props interface from:

```ts
interface DayColumnProps {
  day: DayData;
  dayIndex: number;
  onChange: (day: DayData) => void;
  compact?: boolean;
}
```

to:

```ts
interface DayColumnProps {
  day: DayData;
  dayIndex: number;
  onChange: (day: DayData) => void;
  compact?: boolean;
  activeColor: number;
  onActiveColorChange: (color: number) => void;
}
```

Change the component signature from:

```tsx
const DayColumn: React.FC<DayColumnProps> = ({ day, dayIndex, onChange, compact }) => {
```

to:

```tsx
const DayColumn: React.FC<DayColumnProps> = ({ day, dayIndex, onChange, compact, activeColor, onActiveColorChange }) => {
```

And change the `TimeGrid` usage from:

```tsx
        <TimeGrid
          timeBlocks={day.timeBlocks}
          onChange={(timeBlocks) => onChange({ ...day, timeBlocks })}
        />
```

to:

```tsx
        <TimeGrid
          timeBlocks={day.timeBlocks}
          onChange={(timeBlocks) => onChange({ ...day, timeBlocks })}
          activeColor={activeColor}
          onActiveColorChange={onActiveColorChange}
        />
```

- [ ] **Step 5: Pass the state down from StudyPlanner**

In `StudyPlanner.tsx`, change the daily branch's `DailyView` usage from:

```tsx
          <DailyView
            day={weekData.days[selectedDayIndex]}
            dayIndex={selectedDayIndex}
            onChange={(d) => updateDay(selectedDayIndex, d)}
          />
```

to:

```tsx
          <DailyView
            day={weekData.days[selectedDayIndex]}
            dayIndex={selectedDayIndex}
            onChange={(d) => updateDay(selectedDayIndex, d)}
            activeColor={activeColor}
            onActiveColorChange={setActiveColor}
          />
```

And in the weekly branch, change the `DayColumn` usage from:

```tsx
                  <DayColumn day={day} dayIndex={actualIndex} onChange={(d) => updateDay(actualIndex, d)} />
```

to:

```tsx
                  <DayColumn
                    day={day}
                    dayIndex={actualIndex}
                    onChange={(d) => updateDay(actualIndex, d)}
                    activeColor={activeColor}
                    onActiveColorChange={setActiveColor}
                  />
```

- [ ] **Step 6: Confirm it compiles and tests still pass**

Run: `npx tsc --noEmit -p tsconfig.app.json` — expect no output.
Run: `npm test` — expect 25 tests passing across 2 files.
Run: `npm run lint` — expect 0 errors and 10 pre-existing warnings.

- [ ] **Step 7: Commit**

```bash
git add src/components/planner/StudyPlanner.tsx src/components/planner/DailyView.tsx src/components/planner/DayColumn.tsx
git commit -m "Lift the armed color up to StudyPlanner"
```

---

## Task 3: The weekly legend strip

**Files:**
- Create: `src/components/planner/WeeklyColorLegend.tsx`
- Modify: `src/components/planner/StudyPlanner.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/planner/WeeklyColorLegend.tsx` with exactly this content:

```tsx
import React, { useMemo } from "react";
import { getPaletteInDisplayOrder, loadColorLabels, formatMinutes } from "@/lib/planner-data";

interface WeeklyColorLegendProps {
  colorMinutes: Record<number, number>;
  activeColor: number;
  onSelect: (colorId: number) => void;
}

const WeeklyColorLegend: React.FC<WeeklyColorLegendProps> = ({ colorMinutes, activeColor, onSelect }) => {
  const labels = useMemo(() => loadColorLabels(), []);

  const isDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  return (
    <div className="no-print shrink-0 border-t border-border bg-muted/20 overflow-x-auto">
      <div className="flex items-center gap-3 px-2 py-1 w-max">
        {getPaletteInDisplayOrder().map((c, index) => {
          const name = labels[c.id] || c.label;
          const mins = colorMinutes[c.id] ?? 0;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              aria-label={`${name} (${index + 1})`}
              className={`flex items-center gap-1 shrink-0 px-1 py-0.5 rounded transition-all ${
                activeColor === c.id
                  ? "bg-muted/70 ring-1 ring-inset ring-foreground/10"
                  : "hover:bg-muted/40"
              }`}
            >
              <span
                className="inline-block w-3 h-3 rounded-sm border border-border/50 shrink-0"
                style={{ backgroundColor: `hsl(${isDark ? c.hslDark : c.hsl})` }}
              />
              <span className="text-[9px] font-medium text-foreground/50">{index + 1}</span>
              <span className="text-[10px] text-foreground whitespace-nowrap">{name}</span>
              {mins > 0 && (
                <span className="text-[10px] text-muted-foreground tabular-nums">{formatMinutes(mins)}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default WeeklyColorLegend;
```

Three details that matter:

- `w-max` on the inner flex is what makes `overflow-x-auto` scroll instead of squashing. Without it the flex row shrinks to the container and the entries compress. Do not remove it.
- `labels` is read once via `useMemo` with an empty dependency array rather than on every render. `loadColorLabels()` reads localStorage and parses JSON; calling it per render would do that on every drag-paint. Switching between daily and weekly remounts this component, so a label edited in the daily view still appears here.
- `onSelect` receives `c.id`, a storage id. `index + 1` is the display position and appears only in the visible number and the `aria-label`.

- [ ] **Step 2: Import it and the week calculator in StudyPlanner**

In `src/components/planner/StudyPlanner.tsx`, add the component import alongside the other component imports:

```ts
import WeeklyColorLegend from "./WeeklyColorLegend";
```

and add `calcWeekColorMinutes` to the existing import from `@/lib/planner-data`.

- [ ] **Step 3: Restructure the weekly branch and render the strip**

Replace the entire weekly branch. It currently reads:

```tsx
      {viewMode === "weekly" && (
        <div className="flex flex-1 overflow-hidden border-t border-border min-h-0">
          <WeeklyTodoSidebar todos={weekData.weeklyTodos} onChange={updateTodos} />
          <div className="flex flex-1 min-w-0 h-full overflow-x-auto">
            {visibleDays.map((day, i) => {
              const actualIndex = showWeekends ? i : i;
              return (
                <div key={actualIndex} className="flex-1 min-w-[100px] h-full">
                  <DayColumn
                    day={day}
                    dayIndex={actualIndex}
                    onChange={(d) => updateDay(actualIndex, d)}
                    activeColor={activeColor}
                    onActiveColorChange={setActiveColor}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
```

Replace it with:

```tsx
      {viewMode === "weekly" && (
        <div className="flex flex-col flex-1 overflow-hidden border-t border-border min-h-0">
          <div className="flex flex-1 overflow-hidden min-h-0">
            <WeeklyTodoSidebar todos={weekData.weeklyTodos} onChange={updateTodos} />
            <div className="flex flex-1 min-w-0 h-full overflow-x-auto">
              {visibleDays.map((day, i) => {
                const actualIndex = showWeekends ? i : i;
                return (
                  <div key={actualIndex} className="flex-1 min-w-[100px] h-full">
                    <DayColumn
                      day={day}
                      dayIndex={actualIndex}
                      onChange={(d) => updateDay(actualIndex, d)}
                      activeColor={activeColor}
                      onActiveColorChange={setActiveColor}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <WeeklyColorLegend
            colorMinutes={calcWeekColorMinutes(weekData)}
            activeColor={activeColor}
            onSelect={setActiveColor}
          />
        </div>
      )}
```

The outer div gained `flex-col`, the sidebar and columns moved into a new `flex flex-1 overflow-hidden min-h-0` wrapper, and the strip sits beneath that wrapper as a sibling. `border-t border-border` stays on the outer div so the boundary with the goal/review row is unchanged.

- [ ] **Step 4: Confirm it compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json` — expect no output.
Run: `npm test` — expect 25 tests passing across 2 files.
Run: `npm run lint` — expect 0 errors and 10 pre-existing warnings. If a new warning appears in `WeeklyColorLegend.tsx`, fix it before committing.

- [ ] **Step 5: Commit**

```bash
git add src/components/planner/WeeklyColorLegend.tsx src/components/planner/StudyPlanner.tsx
git commit -m "Add a color legend strip to the weekly view"
```

---

## Task 4: Verification

**Files:** none modified unless a check fails.

- [ ] **Step 1: Automated gates**

```bash
npm test
```

Expected: 25 tests passing across 2 files — 24 in `planner-data.test.ts` plus the placeholder in `example.test.ts`.

```bash
npm run lint
```

Expected: `0 errors`, 10 pre-existing warnings. Seven are in `src/components/ui/*`; the other three are in `MonthlyView.tsx` and `theme-context.tsx`. None should be in a file this plan touched.

```bash
npm run build
```

Expected: builds with no errors.

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

It serves at `http://localhost:8080/Daily-Log/`. Note the `/Daily-Log/` path — the base path applies in development too.

- [ ] **Step 3: Check the weekly legend**

In the weekly view, confirm:

1. A strip appears below the day columns showing nine entries, numbered 1 through 9 in order, with gray last.
2. Each entry shows a swatch, its number, and its label. An entry with no painted time shows no duration.
3. Clicking an entry highlights it, and the highlight matches the entry you clicked.
4. Pressing `9` highlights the gray entry, and pressing `6` highlights yellow. This is the display-position mapping; if `6` highlights gray, a storage id is being compared against a display position somewhere.

- [ ] **Step 4: Check the totals**

Paint several blocks in different day columns using two different colors, including one color in more than one day. Confirm:

1. Each color's total in the strip equals ten minutes per painted block, summed across all days.
2. A color painted in three separate days shows the combined total, not the last day's.
3. Whole hours read as `2h`, not `2h 0m` or `2h ` with a trailing space.

- [ ] **Step 5: Check the state lift**

1. In the weekly view, arm a color by clicking its legend entry. Switch to the daily view. The same color must be armed there, highlighted in the daily legend.
2. Arm a different color in the daily view, switch back to weekly. The strip must highlight that one.
3. Paint a block in the weekly view. It must use the armed color, not blue.

This is the check that the lift actually happened rather than the views keeping separate copies.

- [ ] **Step 6: Check the strip scrolls rather than wraps**

Narrow the browser window until the nine entries no longer fit. Confirm:

1. The strip stays on ONE line and gains a horizontal scrollbar. It must not reflow onto a second row.
2. Scrolling the day columns horizontally does not move the strip, and scrolling the strip does not move the columns. They are independent scroll regions.
3. The weekly view's overall height does not change when the window narrows.

- [ ] **Step 7: Check nothing regressed in the daily view**

1. The daily legend still shows nine tags with editable labels.
2. Type a label in the daily legend, switch to weekly, and confirm the strip shows the typed label rather than the default.
3. Per-color minutes still appear in the daily legend.
4. Typing in a daily legend label field does not change the armed color.

- [ ] **Step 8: Check persistence**

Paint blocks, reload the page, and confirm every block keeps its color. Then open devtools and confirm the stored values are storage ids: a gray block must store `6`, and a yellow block must store `7`.

```js
JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('planner-2'))))
```

- [ ] **Step 9: Clean up and report**

Clear any test data you created:

```js
localStorage.removeItem(Object.keys(localStorage).find(k => k.startsWith('planner-2')))
```

Stop the dev server. If steps 1-8 all passed with no changes needed, there is nothing to commit — report the results and stop.

Do NOT merge to `main`. Merging deploys to the live site and that is the user's call.
