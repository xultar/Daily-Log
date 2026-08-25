# Dark mode and print implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dark mode real across every screen with a Light/Dark/System control, and fix the printed sheet by moving tag colours out of JavaScript into CSS custom properties that print overrides.

**Architecture:** The nine tag colours stop being resolved at paint time. A generated stylesheet defines `--tag-1`…`--tag-9` three times — `:root` light, `.dark` dark, `@media print` light again — and components read `hsl(var(--tag-N))`. Because the values now live in the cascade, printing overrides them without JavaScript knowing printing exists. `useIsDark` is deleted. `ThemeProvider` stops writing inline styles, which would otherwise outrank the `.dark` class.

**Tech Stack:** React 18, TypeScript (strict off), Vite, Tailwind (`darkMode: ["class"]`), Vitest with jsdom v20.

Spec: `docs/superpowers/specs/2026-08-25-dark-mode-and-print-design.md`

---

## Vocabulary

Three numbers and one string get confused in this codebase. Getting them wrong corrupts saved weeks or mislabels a printed sheet.

- **Storage id** — the 1-based position in `BLOCK_COLORS`. It is what is persisted in `timeBlocks` and `SubjectRow.colorId`. It never changes. `BLOCK_COLORS` is append-only.
- **Display position** — the 1-based position in `COLOR_IDS_IN_DISPLAY_ORDER` (`[1,2,3,4,5,7,8,9,6]`). It is what the user sees beside a swatch and what the number keys select. It differs from the storage id for gray, yellow, teal and magenta.
- **CSS variable index** — `--tag-N` is keyed by **storage id**, because that is what a painted block holds.
- **Colour scheme** — `"light" | "dark" | "system"`, the user's setting. Distinct from the *resolved* scheme, which is the boolean the `.dark` class reflects.

**The printed number is the display position, not the storage id.** Printing the storage id would put `6` on a block the legend calls `9`.

---

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/lib/planner-data.ts` | Palette values, colour helpers, run detection, id translation | Modify |
| `src/lib/tag-palette.ts` | Build and install the generated stylesheet | Create |
| `src/lib/color-scheme.ts` | Colour-scheme type, persistence, resolution | Create |
| `src/lib/theme-context.tsx` | Theme + scheme state, stylesheet emission, `.dark` toggle | Modify |
| `src/components/planner/ToolbarActions.tsx` | Light/Dark/System picker | Modify |
| `src/components/planner/TimeGrid.tsx` | Block colours, run-start marker | Modify |
| `src/components/planner/DayColumn.tsx` | Row tint and stripe | Modify |
| `src/components/planner/DailyView.tsx` | Row tint, stripe, legend swatches, print classes | Modify |
| `src/components/planner/WeeklyColorLegend.tsx` | Legend swatches | Modify |
| `src/components/planner/ColorPicker.tsx` | Picker swatches | Modify |
| `src/components/planner/WeeklyTodoSidebar.tsx` | Print class on the Add button | Modify |
| `src/components/planner/MonthlyView.tsx` | Print class on the hint | Modify |
| `src/components/planner/StudyPlanner.tsx` | Goal/Review row prints | Modify |
| `src/hooks/use-is-dark.ts` | — | **Delete** |
| `src/index.css` | Print rules | Modify |
| `src/test/tag-palette.test.ts` | Stylesheet generation | Create |
| `src/test/color-scheme.test.ts` | Scheme resolution and persistence | Create |
| `src/test/tag-runs.test.ts` | Run-start detection, display-position lookup | Create |
| `src/test/planner-data.test.ts` | Existing palette tests | Modify |

Pure logic lives in `planner-data.ts`, `tag-palette.ts` and `color-scheme.ts` so it is testable without a DOM. Components only consume it.

---

## Task 1: Re-tune the nine dark tag values

**Files:**
- Modify: `src/lib/planner-data.ts:360-370`
- Test: `src/test/planner-data.test.ts:47-50` (modify)

The current dark values sit between 36% and 42% lightness — nine hues at one value, which is the hardest way to tell colours apart at swatch size. This task only changes numbers; nothing reads them differently yet.

- [ ] **Step 1: Write the failing test**

In `src/test/planner-data.test.ts`, add to the `describe` block that already contains `"has no duplicate colors in either theme"`:

```ts
  it("spreads the dark palette across lightness, not just hue", () => {
    // Nine hues at one lightness are not separable at swatch size. This pins
    // the property that motivated the re-tune so a later edit cannot quietly
    // flatten them back.
    const lightness = BLOCK_COLORS.map((c) => Number(c.hslDark.split(" ")[2].replace("%", "")));
    const span = Math.max(...lightness) - Math.min(...lightness);
    expect(span).toBeGreaterThan(20);
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/test/planner-data.test.ts -t "spreads the dark palette"`
Expected: FAIL — the current span is 6 (36% to 42%), so `expect(6).toBeGreaterThan(20)` fails.

- [ ] **Step 3: Re-tune the values**

In `src/lib/planner-data.ts`, replace the `BLOCK_COLORS` entries (lines 360-370). Only the `hslDark` column changes; `id`, `label` and `hsl` are untouched, and the order is untouched because storage ids are array positions.

```ts
export const BLOCK_COLORS: readonly BlockColor[] = [
  { id: 1, label: "Blue",     hsl: "213 60% 80%",  hslDark: "213 60% 52%" },
  { id: 2, label: "Pink",     hsl: "340 55% 82%",  hslDark: "340 55% 60%" },
  { id: 3, label: "Green",    hsl: "140 35% 75%",  hslDark: "140 40% 42%" },
  { id: 4, label: "Lavender", hsl: "270 40% 80%",  hslDark: "270 45% 64%" },
  { id: 5, label: "Orange",   hsl: "25 65% 78%",   hslDark: "25 70% 50%" },
  { id: 6, label: "Gray",     hsl: "0 0% 78%",     hslDark: "0 0% 46%" },
  { id: 7, label: "Yellow",   hsl: "50 70% 76%",   hslDark: "50 70% 58%" },
  { id: 8, label: "Teal",     hsl: "178 40% 74%",  hslDark: "178 45% 38%" },
  { id: 9, label: "Magenta",  hsl: "305 40% 80%",  hslDark: "305 45% 56%" },
];
```

- [ ] **Step 4: Fix the existing assertion that pins an old value**

`src/test/planner-data.test.ts` asserts `getBlockColor(6, true)` is `"hsl(0 0% 42%)"`. Gray's dark value is now `0 0% 46%`. Change that line:

```ts
    expect(getBlockColor(6, true)).toBe("hsl(0 0% 46%)");
```

- [ ] **Step 5: Run the file and verify it passes**

Run: `npx vitest run src/test/planner-data.test.ts`
Expected: PASS, all assertions in the file.

- [ ] **Step 6: Commit**

```bash
git add src/lib/planner-data.ts src/test/planner-data.test.ts
git commit -m "Spread the dark tag palette across lightness, not just hue"
```

---

## Task 2: Generate the tag stylesheet

**Files:**
- Create: `src/lib/tag-palette.ts`
- Test: `src/test/tag-palette.test.ts` (create)

A pure function that turns `BLOCK_COLORS` into CSS text, plus a thin installer. Nothing consumes it yet.

- [ ] **Step 1: Write the failing tests**

Create `src/test/tag-palette.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTagPaletteCss, buildThemeCss } from "@/lib/tag-palette";
import { BLOCK_COLORS } from "@/lib/planner-data";

describe("buildTagPaletteCss", () => {
  const css = buildTagPaletteCss();

  it("defines every tag in all three blocks", () => {
    for (const c of BLOCK_COLORS) {
      // once in :root, once in .dark, once in the print block
      const occurrences = css.split(`--tag-${c.id}:`).length - 1;
      expect(occurrences).toBe(3);
    }
  });

  it("emits each value from BLOCK_COLORS, so the sheet cannot drift", () => {
    for (const c of BLOCK_COLORS) {
      expect(css).toContain(`--tag-${c.id}: ${c.hsl}`);
      expect(css).toContain(`--tag-${c.id}: ${c.hslDark}`);
    }
  });

  it("puts the print block last, so it wins over .dark", () => {
    // :root and .dark have equal specificity, so order decides. If the print
    // block is ever emitted before .dark, dark values reach the printer and
    // the near-black-sheet bug returns silently.
    expect(css.indexOf("@media print")).toBeGreaterThan(css.indexOf(".dark"));
  });

  it("restores the light values inside the print block", () => {
    const printBlock = css.slice(css.indexOf("@media print"));
    for (const c of BLOCK_COLORS) {
      expect(printBlock).toContain(`--tag-${c.id}: ${c.hsl}`);
      expect(printBlock).not.toContain(`--tag-${c.id}: ${c.hslDark}`);
    }
  });
});

describe("buildThemeCss", () => {
  const css = buildThemeCss({ "--primary": "1 2% 3%" }, { "--primary": "4 5% 6%" });

  it("emits light values in :root and dark values in .dark", () => {
    expect(css).toContain(":root");
    expect(css).toContain("--primary: 1 2% 3%");
    expect(css).toContain("--primary: 4 5% 6%");
  });

  it("restores light values for print, and prints last", () => {
    expect(css.indexOf("@media print")).toBeGreaterThan(css.indexOf(".dark"));
    const printBlock = css.slice(css.indexOf("@media print"));
    expect(printBlock).toContain("--primary: 1 2% 3%");
    expect(printBlock).not.toContain("--primary: 4 5% 6%");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/tag-palette.test.ts`
Expected: FAIL — "Failed to resolve import @/lib/tag-palette".

- [ ] **Step 3: Write the module**

Create `src/lib/tag-palette.ts`:

```ts
import { BLOCK_COLORS } from "./planner-data";

/**
 * The tag palette as CSS custom properties, defined three times.
 *
 * Colour used to be resolved at paint time from the OS colour scheme, which is
 * why an OS-dark machine sent dark values to the printer. Defining the values
 * in the cascade instead means @media print can override them and no component
 * needs to know printing exists.
 *
 * Emission order is load-bearing. :root and .dark have equal specificity
 * (0,1,0), so the later rule wins — the print block must come last.
 */
export function buildTagPaletteCss(): string {
  const light = BLOCK_COLORS.map((c) => `  --tag-${c.id}: ${c.hsl};`).join("\n");
  const dark = BLOCK_COLORS.map((c) => `  --tag-${c.id}: ${c.hslDark};`).join("\n");
  return [
    `:root {\n${light}\n}`,
    `.dark {\n${dark}\n}`,
    `@media print {\n:root {\n${light}\n}\n}`,
  ].join("\n");
}

/**
 * The accent theme's variables, on the same three-block plan as the tags.
 *
 * Takes plain records rather than a PlannerTheme so this module has no import
 * cycle with theme-context, and so the print-last rule is testable on its own.
 */
export function buildThemeCss(
  light: Record<string, string>,
  dark: Record<string, string>
): string {
  const body = (vars: Record<string, string>) =>
    Object.entries(vars)
      .map(([name, value]) => `  ${name}: ${value};`)
      .join("\n");
  return [
    `:root {\n${body(light)}\n}`,
    `.dark {\n${body(dark)}\n}`,
    `@media print {\n:root {\n${body(light)}\n}\n}`,
  ].join("\n");
}

const STYLE_ID = "planner-generated";

/**
 * Install (or replace) the generated stylesheet.
 *
 * A stylesheet rather than root.style.setProperty: inline styles on <html>
 * outrank class rules, so inline theme values would clobber .dark, and
 * @media print could not override them without !important on every property.
 */
export function installGeneratedCss(css: string): void {
  if (typeof document === "undefined") return;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/test/tag-palette.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tag-palette.ts src/test/tag-palette.test.ts
git commit -m "Generate the tag palette as CSS variables, with print last"
```

---

## Task 3: Move every colour read to CSS variables and delete useIsDark

**Files:**
- Modify: `src/lib/planner-data.ts:375-395`
- Modify: `src/lib/theme-context.tsx` (install the sheet)
- Modify: `src/components/planner/TimeGrid.tsx:37,135`
- Modify: `src/components/planner/DayColumn.tsx:26,82-83`
- Modify: `src/components/planner/DailyView.tsx:25,95-96,214`
- Modify: `src/components/planner/WeeklyColorLegend.tsx:21,50`
- Modify: `src/components/planner/ColorPicker.tsx:30,72`
- Delete: `src/hooks/use-is-dark.ts`
- Test: `src/test/planner-data.test.ts` (modify)

The app stays light-only after this task. Only the mechanism changes.

- [ ] **Step 1: Install the sheet so the variables exist before anything reads them**

In `src/lib/theme-context.tsx`, add the import and extend the existing effect. Keep `setProperty` for now — Task 5 removes it. This ordering means the app never renders against undefined variables.

```ts
import { buildTagPaletteCss, installGeneratedCss } from "./tag-palette";
```

Inside `ThemeProvider`, add a new effect above the existing one:

```ts
  // The tag palette never changes, so it installs once.
  useEffect(() => {
    installGeneratedCss(buildTagPaletteCss());
  }, []);
```

- [ ] **Step 2: Rewrite the failing colour-helper tests**

In `src/test/planner-data.test.ts`, replace the whole `describe("getBlockColor", …)` block with:

```ts
describe("getBlockColor", () => {
  it("returns null for an empty block", () => {
    expect(getBlockColor(0)).toBeNull();
  });

  it("resolves a storage id to its CSS variable", () => {
    // The variable is keyed by storage id, because that is what a painted
    // block holds. Display position is a rendering concern only.
    expect(getBlockColor(1)).toBe("hsl(var(--tag-1))");
    expect(getBlockColor(6)).toBe("hsl(var(--tag-6))");
    expect(getBlockColor(7)).toBe("hsl(var(--tag-7))");
  });

  it("returns a distinct variable for every id", () => {
    const seen = new Set(BLOCK_COLORS.map((c) => getBlockColor(c.id)));
    expect(seen.size).toBe(BLOCK_COLORS.length);
  });

  it("returns null for an out-of-range value instead of throwing", () => {
    expect(getBlockColor(BLOCK_COLORS.length + 1)).toBeNull();
    expect(getBlockColor(99)).toBeNull();
  });
});

describe("getBlockTint", () => {
  it("applies the 16% row wash to the same variable", () => {
    expect(getBlockTint(3)).toBe("hsl(var(--tag-3) / 0.16)");
  });

  it("keeps the null contract", () => {
    expect(getBlockTint(0)).toBeNull();
    expect(getBlockTint(99)).toBeNull();
  });
});
```

Add `getBlockTint` to the imports at the top of that file if it is not already there.

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run src/test/planner-data.test.ts`
Expected: FAIL — `getBlockColor(1)` currently returns `"hsl(213 60% 80%)"`, and with one argument `isDark` is `undefined`.

- [ ] **Step 4: Rewrite the helpers**

In `src/lib/planner-data.ts`, replace `blockHsl`, `getBlockColor` and `getBlockTint` (lines 375-395):

```ts
/** Resolve a storage id to its CSS variable reference. 0, undefined and out-of-range yield null. */
function blockVar(value: number | undefined): string | null {
  if (!value) return null;
  const color = BLOCK_COLORS[value - 1];
  if (!color) return null;
  return `var(--tag-${color.id})`;
}

/**
 * The block's paint colour, as a variable reference rather than a literal.
 *
 * The caller no longer says which scheme it wants, because the cascade decides:
 * :root is light, .dark is dark, and @media print restores light. That is what
 * stopped an OS-dark machine from sending dark values to the printer.
 */
export function getBlockColor(value: number | undefined): string | null {
  const ref = blockVar(value);
  return ref ? `hsl(${ref})` : null;
}

/**
 * The faint background wash for a tagged row. Same storage-id contract as
 * getBlockColor: index 0 and out-of-range values yield null.
 */
export function getBlockTint(value: number | undefined): string | null {
  const ref = blockVar(value);
  return ref ? `hsl(${ref} / ${ROW_TINT_ALPHA})` : null;
}
```

- [ ] **Step 5: Update the five call sites**

`src/components/planner/TimeGrid.tsx` — delete line 37 (`const isDark = useIsDark();`), delete the `useIsDark` import on line 9, and change line 135:

```ts
            const bg = getBlockColor(val);
```

`src/components/planner/DayColumn.tsx` — delete line 26 and the import on line 6, and change lines 82-83:

```ts
          const tint = getBlockTint(s.colorId);
          const stripe = getBlockColor(s.colorId);
```

`src/components/planner/DailyView.tsx` — change lines 95-96 the same way:

```ts
              const tint = getBlockTint(s.colorId);
              const stripe = getBlockColor(s.colorId);
```

Keep `const isDark = useIsDark();` on line 25 for now — line 214 still uses it and is handled in the next step.

- [ ] **Step 6: Replace the three swatch expressions**

These render a palette entry directly rather than through the helpers.

`src/components/planner/ColorPicker.tsx` line 72:

```tsx
          style={{ backgroundColor: `hsl(var(--tag-${c.id}))` }}
```

Then delete `const isDark = useIsDark();` (line 30) and the import (line 3).

`src/components/planner/WeeklyColorLegend.tsx` line 50:

```tsx
                style={{ backgroundColor: `hsl(var(--tag-${c.id}))` }}
```

Then delete `const isDark = useIsDark();` (line 21) and the import (line 3).

`src/components/planner/DailyView.tsx` line 214:

```tsx
                    style={{ backgroundColor: `hsl(var(--tag-${c.id}))` }}
```

Then delete `const isDark = useIsDark();` (line 25) and the import (line 6).

- [ ] **Step 7: Delete the hook**

```bash
git rm src/hooks/use-is-dark.ts
```

- [ ] **Step 8: Verify nothing still references it**

Run: `grep -rn "useIsDark\|isDark" src --include=*.ts --include=*.tsx`
Expected: no output.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS. `daily-view.test.tsx` asserts on `onChange` payloads rather than styles, so it is unaffected.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Read tag colours from CSS variables, and delete useIsDark"
```

---

## Task 4: Add the colour-scheme axis

**Files:**
- Create: `src/lib/color-scheme.ts`
- Test: `src/test/color-scheme.test.ts` (create)
- Modify: `src/lib/theme-context.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/color-scheme.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { readColorScheme, writeColorScheme, resolveScheme } from "@/lib/color-scheme";

beforeEach(() => localStorage.clear());

describe("resolveScheme", () => {
  it("ignores the OS when the scheme is pinned", () => {
    expect(resolveScheme("light", true)).toBe(false);
    expect(resolveScheme("light", false)).toBe(false);
    expect(resolveScheme("dark", true)).toBe(true);
    expect(resolveScheme("dark", false)).toBe(true);
  });

  it("follows the OS when the scheme is system", () => {
    expect(resolveScheme("system", true)).toBe(true);
    expect(resolveScheme("system", false)).toBe(false);
  });
});

describe("readColorScheme", () => {
  it("defaults to system when nothing is stored", () => {
    expect(readColorScheme()).toBe("system");
  });

  it("round-trips a stored value", () => {
    writeColorScheme("dark");
    expect(readColorScheme()).toBe("dark");
  });

  it("falls back to system for an unreadable value", () => {
    localStorage.setItem("planner-color-scheme", "chartreuse");
    expect(readColorScheme()).toBe("system");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/color-scheme.test.ts`
Expected: FAIL — "Failed to resolve import @/lib/color-scheme".

- [ ] **Step 3: Write the module**

Create `src/lib/color-scheme.ts`:

```ts
import { readItem, writeItem } from "./storage";

export type ColorScheme = "light" | "dark" | "system";

const KEY = "planner-color-scheme";
const VALUES: ColorScheme[] = ["light", "dark", "system"];

/**
 * A setting, so it shares the planner- prefix with the weeks. That overlap is
 * why entries are identified by shape rather than prefix — weekKeyFromEntryKey
 * matches planner-YYYY-Www and returns null for this key, so the exporter and
 * the key migration already skip it. Nothing here needs adding to either.
 */
export function readColorScheme(): ColorScheme {
  const stored = readItem(KEY);
  return VALUES.includes(stored as ColorScheme) ? (stored as ColorScheme) : "system";
}

export function writeColorScheme(scheme: ColorScheme): boolean {
  return writeItem(KEY, scheme);
}

/** Whether the app should be dark, given the setting and what the OS prefers. */
export function resolveScheme(scheme: ColorScheme, prefersDark: boolean): boolean {
  if (scheme === "system") return prefersDark;
  return scheme === "dark";
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/test/color-scheme.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire it into ThemeProvider**

In `src/lib/theme-context.tsx`, add imports:

```ts
import { ColorScheme, readColorScheme, writeColorScheme, resolveScheme } from "./color-scheme";
```

Extend the context value type:

```ts
interface ThemeContextValue {
  theme: PlannerTheme;
  setTheme: (themeId: string) => void;
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
}
```

Extend the default context:

```ts
const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES[0],
  setTheme: () => {},
  colorScheme: "system",
  setColorScheme: () => {},
});
```

Inside `ThemeProvider`, add state and effects:

```ts
  const [colorScheme, setSchemeState] = useState<ColorScheme>(() => readColorScheme());

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setSchemeState(scheme);
    writeColorScheme(scheme);
  }, []);

  // Toggle the .dark class, and keep following the OS while the setting is
  // "system". tailwind.config.ts sets darkMode: ["class"], so this class is
  // what makes the .dark rules in index.css and the generated sheet apply.
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle("dark", resolveScheme(colorScheme, mql.matches));
    apply();
    if (colorScheme !== "system") return;
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [colorScheme]);
```

Include both in the provider value:

```ts
    <ThemeContext.Provider value={{ theme, setTheme, colorScheme, setColorScheme }}>
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add a light, dark and system colour scheme setting"
```

---

## Task 5: Give the six themes dark variants, and stop writing inline styles

**Files:**
- Modify: `src/lib/theme-context.tsx`

Inline styles on `<html>` outrank class rules, so the six accent themes currently would clobber `.dark` — dark mode would apply to backgrounds but not headers, grid lines or filled cells.

- [ ] **Step 1: Add a dark variant to the PlannerTheme shape**

In `src/lib/theme-context.tsx`, extend the interface:

```ts
export interface PlannerTheme {
  id: string;
  name: string;
  primary: string;
  primaryForeground: string;
  campusBlue: string;
  campusBlueDark: string;
  campusGrid: string;
  campusFilled: string;
  accent: string;
  /** The same seven values, tuned for a dark ground. */
  dark: {
    primary: string;
    primaryForeground: string;
    campusBlue: string;
    campusBlueDark: string;
    campusGrid: string;
    campusFilled: string;
    accent: string;
  };
}
```

- [ ] **Step 2: Add the dark values to all six themes**

Replace the `THEMES` array in `src/lib/theme-context.tsx`:

```ts
export const THEMES: PlannerTheme[] = [
  {
    id: "campus-blue", name: "Campus Blue",
    primary: "213 60% 87%", primaryForeground: "220 30% 25%",
    campusBlue: "213 60% 87%", campusBlueDark: "213 50% 65%",
    campusGrid: "214 30% 90%", campusFilled: "213 60% 80%", accent: "213 60% 87%",
    dark: {
      primary: "213 45% 32%", primaryForeground: "210 25% 92%",
      campusBlue: "213 45% 32%", campusBlueDark: "213 50% 55%",
      campusGrid: "217 22% 22%", campusFilled: "213 45% 38%", accent: "213 45% 32%",
    },
  },
  {
    id: "sakura-pink", name: "Sakura Pink",
    primary: "340 60% 88%", primaryForeground: "340 30% 30%",
    campusBlue: "340 60% 88%", campusBlueDark: "340 45% 65%",
    campusGrid: "340 25% 92%", campusFilled: "340 55% 82%", accent: "340 60% 88%",
    dark: {
      primary: "340 40% 34%", primaryForeground: "340 25% 92%",
      campusBlue: "340 40% 34%", campusBlueDark: "340 45% 58%",
      campusGrid: "340 15% 22%", campusFilled: "340 40% 40%", accent: "340 40% 34%",
    },
  },
  {
    id: "matcha-green", name: "Matcha Green",
    primary: "140 35% 82%", primaryForeground: "140 30% 25%",
    campusBlue: "140 35% 82%", campusBlueDark: "140 30% 55%",
    campusGrid: "140 20% 90%", campusFilled: "140 35% 75%", accent: "140 35% 82%",
    dark: {
      primary: "140 30% 28%", primaryForeground: "140 20% 92%",
      campusBlue: "140 30% 28%", campusBlueDark: "140 30% 48%",
      campusGrid: "140 12% 21%", campusFilled: "140 30% 34%", accent: "140 30% 28%",
    },
  },
  {
    id: "lavender", name: "Lavender",
    primary: "270 45% 87%", primaryForeground: "270 30% 28%",
    campusBlue: "270 45% 87%", campusBlueDark: "270 35% 62%",
    campusGrid: "270 25% 92%", campusFilled: "270 40% 80%", accent: "270 45% 87%",
    dark: {
      primary: "270 35% 34%", primaryForeground: "270 20% 92%",
      campusBlue: "270 35% 34%", campusBlueDark: "270 35% 56%",
      campusGrid: "270 15% 22%", campusFilled: "270 35% 40%", accent: "270 35% 34%",
    },
  },
  {
    id: "sunset-orange", name: "Sunset Orange",
    primary: "25 70% 85%", primaryForeground: "25 40% 28%",
    campusBlue: "25 70% 85%", campusBlueDark: "25 55% 60%",
    campusGrid: "25 30% 92%", campusFilled: "25 65% 78%", accent: "25 70% 85%",
    dark: {
      primary: "25 50% 32%", primaryForeground: "25 25% 92%",
      campusBlue: "25 50% 32%", campusBlueDark: "25 55% 52%",
      campusGrid: "25 18% 22%", campusFilled: "25 50% 38%", accent: "25 50% 32%",
    },
  },
  {
    id: "monochrome", name: "Monochrome",
    primary: "0 0% 88%", primaryForeground: "0 0% 20%",
    campusBlue: "0 0% 88%", campusBlueDark: "0 0% 55%",
    campusGrid: "0 0% 92%", campusFilled: "0 0% 75%", accent: "0 0% 88%",
    dark: {
      primary: "0 0% 30%", primaryForeground: "0 0% 92%",
      campusBlue: "0 0% 30%", campusBlueDark: "0 0% 52%",
      campusGrid: "0 0% 21%", campusFilled: "0 0% 36%", accent: "0 0% 30%",
    },
  },
];
```

- [ ] **Step 3: Replace the inline-style effect with stylesheet emission**

In `src/lib/theme-context.tsx`, add `buildThemeCss` to the existing import from `./tag-palette`, then replace the effect that calls `root.style.setProperty` and merge it with the tag-palette effect:

```ts
  // One generated stylesheet holds the tag palette and the accent theme, both
  // on the same three-block plan: :root light, .dark dark, @media print light.
  //
  // A stylesheet rather than root.style.setProperty. Inline styles on <html>
  // outrank class rules, so the theme's light pastels would clobber .dark and
  // dark mode would apply to backgrounds but not to headers, grid lines or
  // filled cells — and print could not override them without !important on
  // every property.
  useEffect(() => {
    const vars = (t: PlannerTheme | PlannerTheme["dark"]) => ({
      "--primary": t.primary,
      "--primary-foreground": t.primaryForeground,
      "--campus-blue": t.campusBlue,
      "--campus-blue-dark": t.campusBlueDark,
      "--campus-grid": t.campusGrid,
      "--campus-filled": t.campusFilled,
      "--accent": t.accent,
      "--accent-foreground": t.primaryForeground,
    });
    installGeneratedCss(buildTagPaletteCss() + "\n" + buildThemeCss(vars(theme), vars(theme.dark)));
  }, [theme]);
```

Delete the separate tag-palette-only effect added in Task 3 Step 1, and delete the old `setProperty` effect entirely.

- [ ] **Step 4: Verify no inline theme styles remain**

Run: `grep -n "setProperty" src/lib/theme-context.tsx`
Expected: no output.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Give each theme a dark variant, and emit it as a stylesheet"
```

---

## Task 6: Add the Light/Dark/System picker

**Files:**
- Modify: `src/components/planner/ToolbarActions.tsx:1-13,61-63`

- [ ] **Step 1: Add the imports**

In `src/components/planner/ToolbarActions.tsx`, change line 4 and add the scheme type:

```ts
import { Download, Upload, Palette, Sun, Moon, Monitor } from "lucide-react";
import { ColorScheme } from "@/lib/color-scheme";
```

Change line 17 to pull the scheme out of the context:

```ts
  const { theme, setTheme, colorScheme, setColorScheme } = useTheme();
```

- [ ] **Step 2: Add the mode group above the themes**

In the same file, replace lines 62-63 (the `Theme` label and the separator that follow `DropdownMenuContent`) with the mode group followed by the existing theme label:

```tsx
          <DropdownMenuLabel className="text-[10px]">Appearance</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {([
            { id: "light", name: "Light", Icon: Sun },
            { id: "dark", name: "Dark", Icon: Moon },
            { id: "system", name: "System", Icon: Monitor },
          ] as { id: ColorScheme; name: string; Icon: typeof Sun }[]).map((m) => (
            <DropdownMenuItem
              key={m.id}
              onClick={() => setColorScheme(m.id)}
              className="text-xs gap-2"
            >
              <m.Icon className="w-3 h-3 shrink-0" />
              {m.name}
              {m.id === colorScheme && <span className="ml-auto text-[10px]">✓</span>}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px]">Theme</DropdownMenuLabel>
          <DropdownMenuSeparator />
```

**Do not add `role="menu"`, `role="dialog"` or `role="listbox"` anywhere here.** `TimeGrid`'s keydown guard tests `closest?.('[role="menu"], [role="dialog"], [role="listbox"]')` so Radix menus can swallow digits; adding any of them silently disables the 1–9 paint shortcuts whenever focus sits inside.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS. The toolbar sits inside `StudyPlanner`'s `no-print` header row, above both week chevrons, so `container.querySelectorAll("button")[1]` in `autosave.test.tsx` and `pending-save.test.tsx` is unchanged — the new items are inside a dropdown that is not rendered until opened.

- [ ] **Step 4: See it working in a browser**

Run: `npm run dev` and open `http://localhost:8080/Daily-Log/`.

Check: switching to Dark darkens the whole chrome, not just the background; the nine legend swatches stay tellable apart; switching accent theme while dark keeps the app dark; the choice survives a reload; on System, changing the OS setting flips the app live.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Offer light, dark and system in the palette menu"
```

---

## Task 7: Fix the printed sheet

**Files:**
- Modify: `src/lib/planner-data.ts` (two new helpers)
- Test: `src/test/tag-runs.test.ts` (create)
- Modify: `src/components/planner/TimeGrid.tsx:132-146`
- Modify: `src/components/planner/DailyView.tsx:157,235`
- Modify: `src/components/planner/WeeklyTodoSidebar.tsx:56`
- Modify: `src/components/planner/MonthlyView.tsx:102`
- Modify: `src/components/planner/StudyPlanner.tsx:236`
- Modify: `src/index.css:88-109`

- [ ] **Step 1: Write the failing tests**

Create `src/test/tag-runs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isTagRunStart, displayPositionForColorId } from "@/lib/planner-data";

describe("isTagRunStart", () => {
  it("marks the first block of a full-hour run and no others", () => {
    const hour = [3, 3, 3, 3, 3, 3];
    expect(hour.map((_, i) => isTagRunStart(hour, i))).toEqual([true, false, false, false, false, false]);
  });

  it("marks every block when tags alternate", () => {
    const hour = [1, 2, 1, 2, 1, 2];
    expect(hour.map((_, i) => isTagRunStart(hour, i))).toEqual([true, true, true, true, true, true]);
  });

  it("marks nothing in an empty hour", () => {
    const hour = [0, 0, 0, 0, 0, 0];
    expect(hour.map((_, i) => isTagRunStart(hour, i))).toEqual([false, false, false, false, false, false]);
  });

  it("starts a new run after a gap", () => {
    const hour = [5, 5, 0, 0, 5, 5];
    expect(hour.map((_, i) => isTagRunStart(hour, i))).toEqual([true, false, false, false, true, false]);
  });

  it("does not throw on a missing hour", () => {
    expect(isTagRunStart(undefined, 0)).toBe(false);
  });
});

describe("displayPositionForColorId", () => {
  it("is the inverse of colorIdForDisplayPosition", () => {
    // The printed number must be the display position, not the storage id.
    // They differ for gray, yellow, teal and magenta, so printing the storage
    // id would put a 6 on a block the legend calls 9.
    expect(displayPositionForColorId(6)).toBe(9);
    expect(displayPositionForColorId(7)).toBe(6);
    expect(displayPositionForColorId(8)).toBe(7);
    expect(displayPositionForColorId(9)).toBe(8);
    expect(displayPositionForColorId(1)).toBe(1);
  });

  it("returns null for an id that is not in the palette", () => {
    expect(displayPositionForColorId(0)).toBeNull();
    expect(displayPositionForColorId(99)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/tag-runs.test.ts`
Expected: FAIL — neither export exists.

- [ ] **Step 3: Add the helpers**

In `src/lib/planner-data.ts`, add below `colorIdForDisplayPosition`:

```ts
/**
 * The number to show the user for a storage id — the inverse of
 * colorIdForDisplayPosition. Printing the storage id instead would label a
 * block 6 that the legend calls 9, for the four colours where the two differ.
 */
export function displayPositionForColorId(id: number): number | null {
  const index = COLOR_IDS_IN_DISPLAY_ORDER.indexOf(id);
  return index === -1 ? null : index + 1;
}

/**
 * Whether this block begins an unbroken run of one tag within its hour row.
 *
 * Only the first block of a run prints its number, so a full hour of one tag
 * prints one digit rather than six. Runs do not cross hour rows — each row is
 * rendered separately — so a two-hour block prints one digit per hour, which
 * reads correctly on the sheet.
 */
export function isTagRunStart(hourBlocks: number[] | undefined, blockIdx: number): boolean {
  const value = hourBlocks?.[blockIdx] ?? 0;
  if (!value) return false;
  const previous = blockIdx === 0 ? 0 : hourBlocks?.[blockIdx - 1] ?? 0;
  return value !== previous;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/test/tag-runs.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Mark run starts in the grid**

In `src/components/planner/TimeGrid.tsx`, add to the existing import from `@/lib/planner-data`:

```ts
  isTagRunStart,
  displayPositionForColorId,
```

Replace the block map (lines 132-146):

```tsx
          {[0, 1, 2, 3, 4, 5].map((blockIdx) => {
            const val = timeBlocks[hourIdx]?.[blockIdx] ?? 0;
            const bg = getBlockColor(val);
            // Only the first block of a run carries the number, so a full hour
            // of one tag prints one digit rather than six. Screen-invisible;
            // index.css reveals it in print only.
            const runStart = isTagRunStart(timeBlocks[hourIdx], blockIdx);
            return (
              <div
                key={blockIdx}
                data-tag={runStart ? displayPositionForColorId(val) : undefined}
                className={`flex-1 ${large ? "h-[16px]" : "h-[10px]"} border-l border-campus-grid cursor-pointer transition-colors flex items-center justify-center ${
                  val === 0 ? "hover:bg-campus-grid" : ""
                } ${runStart ? "tag-run-start" : ""}`}
                style={bg ? { backgroundColor: bg } : undefined}
                onMouseDown={() => handleMouseDown(hourIdx, blockIdx)}
                onMouseEnter={() => handleMouseEnter(hourIdx, blockIdx)}
                onContextMenu={(e) => handleContextMenu(e, hourIdx, blockIdx)}
              />
            );
          })}
```

- [ ] **Step 6: Add `no-print` to the four UI-only controls**

`src/components/planner/DailyView.tsx` line 157 — the Add button:

```tsx
            className="no-print flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4 self-start"
```

`src/components/planner/DailyView.tsx` line 235 — the keyboard hint:

```tsx
          <div className="no-print text-[9px] text-muted-foreground/60 mt-1">
            Press 1–9 to switch color &middot; Right-click block to pick color
          </div>
```

`src/components/planner/WeeklyTodoSidebar.tsx` line 58 — the Add button:

```tsx
        className="no-print flex items-center justify-center gap-0.5 py-1 text-[9px] text-muted-foreground hover:text-foreground border-t border-border transition-colors"
```

`src/components/planner/MonthlyView.tsx` line 102 — the "Click on a day…" hint:

```tsx
      <p className="no-print text-[10px] text-muted-foreground text-center mt-2">
        Click on a day to switch to daily view
      </p>
```

- [ ] **Step 7: Let the Goal and Review print**

In `src/components/planner/StudyPlanner.tsx` line 236, remove `no-print` from the Goal/Review row:

```tsx
        <div className="flex border-b border-border shrink-0">
```

This is a deliberate behaviour change: a sheet that gets pinned up wants the week's goal on it. The toolbar row on line 171 keeps its `no-print`.

- [ ] **Step 8: Extend the print CSS**

In `src/index.css`, replace the `@media print` block (lines 88-109):

```css
@media print {
  @page {
    size: A4 landscape;
    margin: 6mm;
  }
  body {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .no-print {
    display: none !important;
  }
  .planner-container {
    padding: 0 !important;
    max-width: none !important;
  }
  input, textarea {
    border: none !important;
    padding: 0 !important;
    background: transparent !important;
  }
  /* Placeholders are prompts, not content. Six rows of "Add priority /
     action..." on a printed sheet read as though they were written there. */
  ::placeholder {
    color: transparent !important;
  }
  /* A scrollbar has no meaning on paper, and the weekly sheet printed one down
     its right edge from the view container. */
  .overflow-auto, .overflow-x-auto, .overflow-y-auto {
    overflow: visible !important;
  }
  /* Nine colour tags arrive as nine indistinguishable grays on a mono laser.
     The first block of each run carries its legend number so the sheet can be
     read back. The number is print-only; on screen the block stays clean. */
  .tag-run-start::after {
    content: attr(data-tag);
    font-size: 6pt;
    line-height: 1;
    font-weight: 700;
    color: #000;
  }
}
```

Note the tag variables themselves are restored to light values by the generated stylesheet's own print block, not here.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Check the sheet in a browser**

Run `npm run dev`, open `http://localhost:8080/Daily-Log/`, paint a week including at least one lone 10-minute block, then use the browser's print preview.

Check: no placeholder text; no "+ Add", hint text or scrollbar; the Goal and Review appear; every painted run carries a number; all seven days and the legend still fit one A4 landscape page. Then **switch to Dark and preview again** — the sheet must be identical to the light one. That is the regression this whole change exists to prevent.

Finally, print one sheet on the laser and confirm the digit is legible in a 10-minute block. If it is not, the fallback is hatch patterns, which is a change to `.tag-run-start` in this same CSS block and nothing else.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Print the sheet as designed: light tags, run numbers, no UI"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: PASS. The count rises from 167 by the tests added here — 6 in `tag-palette.test.ts`, 5 in `color-scheme.test.ts`, 7 in `tag-runs.test.ts`, plus 1 added and 3 rewritten in `planner-data.test.ts`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: **0 errors.** Warnings should stay at 10 — the new exports live in `tag-palette.ts` and `color-scheme.ts`, which export no components, so `react-refresh/only-export-components` does not apply. Treat any error as new. If the warning count moved, find out why before continuing.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Confirm nothing reads a colour at paint time**

Run: `grep -rn "hslDark" src --include=*.tsx`
Expected: no output — `hslDark` should now be read only by `tag-palette.ts` via `BLOCK_COLORS`.

Run: `grep -rn "localStorage" src --include=*.ts --include=*.tsx | grep -v "src/lib/storage.ts"`
Expected: no output. `color-scheme.ts` goes through `readItem`/`writeItem`.

- [ ] **Step 5: Update the working notes**

In `CLAUDE.md`, replace the "Dark mode is half-wired" entry under **Known open issues** with a short description of how the scheme now resolves and why the print block must be emitted last. Move the print defects out of the "Printing is a real use case" section, keeping only what remains true. Update the **Baselines** test count.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Record how the colour scheme resolves, and refresh the baselines"
```

---

## Self-review notes

Spec sections and the task that implements each:

| Spec section | Task |
| --- | --- |
| The colour scheme axis | 4 |
| Tag colours become CSS custom properties | 2, 3 |
| The dark tag palette | 1 |
| ThemeProvider stops writing inline styles | 5 |
| Print — palette | 2 (print block), verified in 7 |
| Print — run numbers | 7 |
| Print — placeholders, controls, scrollbar, Goal/Review | 7 |
| Delete `useIsDark` | 3 |
| Testing | 1-7, gathered in 8 |

Not carried into this plan, and deliberately: hatch patterns in print (held as the fallback if the digit fails at A4, noted in Task 7 Step 10), and per-theme tag palettes (out of scope in the spec — the nine tags are one palette across all six themes).
