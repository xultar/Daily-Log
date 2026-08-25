import { BLOCK_COLORS } from "./planner-data";

/**
 * The tag palette as CSS custom properties, defined three times.
 *
 * Colour used to be resolved at paint time from the OS colour scheme, which is
 * why an OS-dark machine sent dark values to the printer — getBlockColor took
 * an isDark argument and printing never changed it. Defining the values in the
 * cascade instead means @media print can override them and no component needs
 * to know printing exists.
 *
 * The variables are keyed by STORAGE id, the position in BLOCK_COLORS, because
 * that is what a painted block holds. Display position is a rendering concern
 * and never appears here.
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
 * A stylesheet rather than root.style.setProperty. Inline styles on <html>
 * outrank class rules, so the theme's light pastels would clobber .dark — dark
 * mode would apply to backgrounds but not to headers, grid lines or filled
 * cells — and @media print could not override them without !important on every
 * property.
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
