/**
 * How an item's age is drawn: a left rule that thickens the longer it has been
 * carried. Shared by the carry-forward bar and the Weekly Actions sidebar so
 * the two cannot drift — the same fact said the same way in both places.
 *
 * Thickness rather than colour alone is the point. The palette collapses under
 * deuteranopia and a mono print flattens every tint to the same grey, so the
 * width has to carry the signal on its own; `destructive` sits on top of it.
 */
const RULE_WIDTH = ["border-l-2", "border-l-2", "border-l-4", "border-l-[6px]"];

/**
 * Caps at three weeks. That ceiling is a layout constraint rather than a
 * semantic one: the sidebar's column is 128px at 9px text, and a long-slipped
 * item must not crowd its own text out. The bar has more room and mirrors the
 * cap for consistency, so this is the line to revisit if the two should ever
 * diverge.
 */
export function carryRuleClass(age: number): string {
  if (age <= 0) return "border-l-2 border-l-transparent";
  return `${RULE_WIDTH[Math.min(age, 3)]} ${
    age > 2 ? "border-l-destructive/70" : "border-l-campus-blue-dark"
  }`;
}
