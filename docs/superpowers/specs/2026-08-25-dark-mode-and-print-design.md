# Dark mode and the printed sheet

Date: 2026-08-25
Status: approved

## Summary

Make dark mode real, and settle printing with the same change. A `Light / Dark /
System` control joins the toolbar's palette menu; the nine tag colours move out
of JavaScript and into CSS custom properties defined three times — light, dark,
and print; and each unbroken run of one tag prints its legend number so a
black-and-white sheet can be read back.

The nine dark tag values are re-tuned. They currently sit between 36% and 42%
lightness, which makes them nine hues at one value — the hardest possible way to
tell colours apart at swatch size.

## Motivation

`tailwind.config.ts` sets `darkMode: ["class"]` and nothing ever applies the
class, so the `.dark` block in `index.css` is dead. Meanwhile `useIsDark` reads
`prefers-color-scheme` and feeds it to `getBlockColor`, so on an OS-dark machine
the tags flip to `hslDark` while the chrome stays white — dark swatches on a
light ground, and a row wash muddier than the 16% it was tuned to.

The same line explains the printing complaint. `getBlockColor(value, isDark)`
resolves the colour at paint time and printing does not change `isDark`, so an
OS-dark machine sends `hsl(213 50% 40%)` to the printer where the design intends
`hsl(213 60% 80%)`. That is the recorded "printed sheet came back with near-black
blocks", and it is a palette bug rather than a property of the laser.

Fixing the two together is not a coincidence of scheduling. Both are the same
defect: **the medium is deciding the colour at paint time, in JavaScript, where
the cascade cannot reach it.**

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Mode source | Three-way `light`/`dark`/`system`, default `system` | Follows the OS out of the box but can be pinned either way |
| Where it lives | New key `planner-color-scheme` | Mode and accent theme are independent axes |
| Tag colour delivery | CSS custom properties `--tag-1`…`--tag-9` | Lets the cascade — and therefore `@media print` — override them |
| Dark tag values | Re-tuned, spread across lightness | Nine hues at one lightness are not separable at swatch size |
| Print palette | Always the light triplets | Paper is a light medium regardless of screen mode |
| Mono legibility | Legend number, once per run | Reuses the 1–9 vocabulary the app already teaches |
| `ThemeProvider` | Emits a stylesheet, no longer inline styles | Inline styles outrank class rules and would clobber `.dark` |
| `useIsDark` | Deleted | Nothing needs the mode at paint time once CSS holds the values |

Rejected alternatives:

- **Keep the light pastels in dark mode** so screen and paper always match.
  Rejected: pastels at 74–82% lightness glare on an 8% ground, and print does not
  need the screen palette constrained to fix it — `@media print` handles paper on
  its own terms.
- **Ship the existing `hslDark` values unchanged.** Rejected: it leaves the
  muddiness already recorded as a known issue, and re-tuning is presentation-only
  work that touches no stored value.
- **Hatch patterns instead of numbers in print.** Rejected as the primary choice:
  nine patterns are a second vocabulary that exists only on paper, learned from
  the legend anyway. Kept as the fallback if a 10-minute run cannot hold a digit
  legibly at A4 — the run marker makes swapping the treatment a CSS-only change.
- **`@media print` overrides on each painted element with `!important`.**
  Rejected: it needs one rule per colour and only works because inline styles are
  being fought rather than removed.

## The colour scheme axis

`planner-color-scheme` stores `"light" | "dark" | "system"`, defaulting to
`"system"`. It is a setting, so it shares the `planner-` prefix — and it is
therefore matched by `weekKeyFromEntryKey` as *not* a week, exactly like
`planner-show-weekends` and `planner-theme`. No change is needed there; the shape
test already excludes it. It must not be added to any list that treats
`planner-`-prefixed keys as weeks.

The resolved mode is `system ? matchMedia("(prefers-color-scheme: dark)").matches
: mode === "dark"`, and it toggles `.dark` on `document.documentElement`. When the
setting is `system`, a `change` listener on the media query keeps it live; when it
is pinned, no listener runs.

Reading the setting happens during render in the provider, as `ThemeProvider`
already does, which is why `ErrorBoundary` must stay **outside** the providers —
a `SecurityError` from storage has to be caught above the thing that reads
storage. That constraint is unchanged and load-bearing.

## Tag colours become CSS custom properties

`BLOCK_COLORS` remains the single source of truth. It keeps `id`, `label`, `hsl`
and `hslDark`, and it stays append-only — storage ids are array positions and
moving one silently repaints every saved week that used it.

What changes is that nothing reads `hsl`/`hslDark` at paint time. Instead a small
module generates one stylesheet from `BLOCK_COLORS` and installs it in a
`<style>` element:

```
:root      { --tag-1: 213 60% 80%; … }   /* light triplets  */
.dark      { --tag-1: 213 60% 52%; … }   /* dark triplets   */
@media print { :root { --tag-1: 213 60% 80%; … } }   /* light again */
```

The values are bare HSL triplets, which is already the convention throughout this
codebase and is what makes the alpha form work.

**Emission order is load-bearing.** `:root` and `.dark` have equal specificity
(0,1,0), so the later rule wins. The print block must be written last or dark
values survive into the printed sheet — reintroducing the exact bug this removes.
A test asserts the print block is last.

`getBlockColor` and `getBlockTint` lose their `isDark` parameter and return

```
getBlockColor(v) → "hsl(var(--tag-3))"
getBlockTint(v)  → "hsl(var(--tag-3) / 0.16)"
```

`ROW_TINT_ALPHA` stays 16% and stays spec-fixed. The null contract is unchanged:
`0`, `undefined` and out-of-range still yield `null`, and that is what
`calcDayTotal`'s truthiness check and `getBlockColor`'s callers already rely on.

A generated stylesheet rather than `root.style.setProperty` is deliberate. Inline
styles on `<html>` cannot be overridden by `@media print` without `!important` on
every custom property, and that is the trap `ThemeProvider` is currently sitting
in.

## The dark tag palette

Storage id order. Display positions are unchanged and remain
`[1,2,3,4,5,7,8,9,6]`.

| id | Label | Light (unchanged) | Dark — current | Dark — new |
| --- | --- | --- | --- | --- |
| 1 | Blue | `213 60% 80%` | `213 50% 40%` | `213 60% 52%` |
| 2 | Pink | `340 55% 82%` | `340 45% 42%` | `340 55% 60%` |
| 3 | Green | `140 35% 75%` | `140 30% 38%` | `140 40% 42%` |
| 4 | Lavender | `270 40% 80%` | `270 35% 42%` | `270 45% 64%` |
| 5 | Orange | `25 65% 78%` | `25 55% 40%` | `25 70% 50%` |
| 6 | Gray | `0 0% 78%` | `0 0% 42%` | `0 0% 46%` |
| 7 | Yellow | `50 70% 76%` | `50 55% 38%` | `50 70% 58%` |
| 8 | Teal | `178 40% 74%` | `178 35% 36%` | `178 45% 38%` |
| 9 | Magenta | `305 40% 80%` | `305 35% 42%` | `305 45% 56%` |

The new values span 38–64% lightness against the old 36–42%. Lightness is the
channel that survives small sizes, so spreading it is what separates the tags in
a 10px block and a legend swatch.

Changing `hslDark` is safe in a way that changing `hsl` order is not: these are
presentation values, not positions. No stored week changes meaning.

## ThemeProvider stops writing inline styles

`ThemeProvider` currently calls `root.style.setProperty` for seven variables.
Inline styles beat class rules, so the moment `.dark` exists the six accent
themes would overwrite `--primary`, `--accent` and all three `--campus-*` values
with their light pastels — dark mode would apply to backgrounds and text but not
to headers, grid lines or filled cells.

Each `PlannerTheme` therefore gains a `dark` variant of its seven values, and the
provider emits them into the same generated stylesheet under `:root` and `.dark`
rather than inline. `THEMES` keeps its ids, so `planner-theme` values already in
storage still resolve.

## Print

Six changes, five of them recorded in the working notes as defects:

1. **Palette** — the print block restores the light triplets. Fixes the
   near-black sheet at its source.
2. **Run numbers** — the first block of each unbroken run of one tag gets a
   marker class; print CSS reveals a digit there. A run is `blocks[i] &&
   blocks[i] !== blocks[i-1]`, a pure helper, testable without a DOM. `TimeGrid`
   keeps its six cells per hour, so the paint and drag interaction is untouched.
3. **Placeholders stop printing** — `placeholder:text-transparent` in print, so
   "Add priority / action…", "Notes for the day…", "Memo…" and the em-dashes
   leave the sheet.
4. **UI-only controls get `no-print`** — "+ Add", "+ Add priority / action",
   "Press 1-9 to switch color / Right-click block to pick color", and "Click on a
   day to switch to daily view".
5. **The scrollbar goes** — `overflow: visible` on the offending container in
   print.
6. **Goal and Review start printing** — the row loses `no-print`. This is a
   behaviour change, made deliberately: a sheet that gets pinned up wants the
   week's goal on it, and its absence reads as an accident of markup.

`print-color-adjust: exact` stays. Light row tints printing as pale gray is
correct and must not be "fixed".

## Changes

### 1. `src/lib/planner-data.ts`
Re-tune the nine `hslDark` values. Drop the `isDark` parameter from
`getBlockColor`, `getBlockTint` and `blockHsl`; return the `var()` forms. Add the
pure run-start helper.

### 2. `src/lib/tag-palette.ts` (new)
Generate the stylesheet text from `BLOCK_COLORS` and install it. Exported as a
pure text-producing function plus a thin installer, so the text is testable
without a DOM.

### 3. `src/lib/theme-context.tsx`
Add `dark` variants to all six themes. Replace `setProperty` with stylesheet
emission. Add the colour-scheme state, its persistence, the `.dark` toggle and
the `system` media listener.

### 4. `src/components/planner/ToolbarActions.tsx`
Add the three-item mode group above the six themes in the palette menu. It must
not gain `role="menu"`, `role="dialog"` or `role="listbox"` — `TimeGrid`'s keydown
guard tests for exactly those and would swallow the 1–9 shortcuts.

### 5. `TimeGrid.tsx`, `DayColumn.tsx`, `DailyView.tsx`, `WeeklyColorLegend.tsx`, `ColorPicker.tsx`
Drop `useIsDark` and its five call sites. Update the five `getBlockColor` /
`getBlockTint` calls to the one-argument form — two in `DailyView`, two in
`DayColumn`, one in `TimeGrid`. Replace the three inline
`hsl(${isDark ? c.hslDark : c.hsl})` swatch expressions with `hsl(var(--tag-N))`.
`TimeGrid` also applies the run-start marker class.

### 6. `src/hooks/use-is-dark.ts`
Deleted.

### 7. `src/index.css`
Extend the `@media print` block per the six points above.

## Testing

- The generated stylesheet contains all nine tags in all three blocks, and the
  print block is emitted last.
- Every generated value matches its `BLOCK_COLORS` entry, so the palette cannot
  drift from the stylesheet.
- The nine dark values are distinct, and their lightness spans more than 20
  points — the property that motivated the re-tune, pinned so a later edit cannot
  quietly flatten them again.
- `getBlockColor`/`getBlockTint` return `var()` forms; `0`, `undefined` and
  out-of-range still return `null`. Existing assertions in `planner-data.test.ts`
  move to the new form.
- Resolution: `light` and `dark` ignore the media query; `system` follows it and
  updates on `change`.
- `planner-color-scheme` round-trips, and an unreadable value falls back to
  `system`.
- Run-start detection: a full-hour run marks one cell; alternating tags mark
  every cell; an empty hour marks none.

**Do not assert on rendered styles.** jsdom v20's `cssstyle` predates CSS Color
4, so `style.backgroundColor = "hsl(213 60% 80%)"` yields an empty string and a
negative assertion passes vacuously. `hsl(var(--tag-1))` will behave the same
way. Assert on the generated stylesheet text and on returned strings instead.

## Out of scope

- Hatch patterns in print. Held as the fallback if the digit fails at A4.
- Per-theme dark tag palettes. The nine tags are one palette across all six
  accent themes.
- Colour in the month view, trends, and search — separate backlog items.

## Risks

- **The print block must be last.** If the emission order is ever reversed, dark
  values reach the printer and the original bug returns silently. Pinned by test.
- **The digit at 10 minutes.** A 10-minute run is roughly 6mm at A4 landscape and
  a 6pt digit roughly 2mm. It fits, but it needs confirming on a real sheet
  before this is called done. Fallback is the hatch treatment.
- **Deleting `useIsDark` touches five components.** Each is a mechanical edit, but
  `DailyView` and `DayColumn` both sit near `updateSubject`, which must not be
  rewritten — its spread is the only thing preserving `colorId` and `flagged`
  through a keystroke.
