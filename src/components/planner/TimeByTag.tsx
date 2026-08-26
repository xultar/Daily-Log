import React from "react";
import { BLOCK_COLORS, formatMinutes, getBlockColor, loadColorLabels } from "@/lib/planner-data";
import { totalsByTag } from "@/lib/reporting";

interface TimeByTagProps {
  /** Both ends inclusive. */
  from: Date;
  to: Date;
}

/**
 * How much time is blocked against each tag over a range, as bars.
 *
 * **"Blocked", not "spent".** A painted block is a painted block, and this app
 * cannot tell a plan from a record — navigating to a future month reports the
 * plan, which is half the point of having it. Past tense would be wrong.
 *
 * Hand-drawn rather than charted. `recharts` is in `package.json` and
 * contributes nothing to the bundle today because the only file importing it is
 * an unused wrapper; pulling it in measured at +103 kB gzipped, a 74% increase,
 * for a bar list. This app already hand-draws a 19x6 grid and twelve swatches.
 *
 * Bars carry no text, so the contrast ceiling that governs the month cells does
 * not apply — these are full strength.
 */
const TimeByTag: React.FC<TimeByTagProps> = ({ from, to }) => {
  const labels = React.useMemo(() => loadColorLabels(), []);
  const totals = React.useMemo(() => totalsByTag(from, to), [from, to]);

  // Nothing blocked is not an empty chart, it is no chart. A frame with no bars
  // in it reads as something failing to load.
  if (totals.length === 0) return null;

  const largest = totals[0].minutes;

  return (
    <div className="mt-6">
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Time blocked by tag
      </h3>
      <ul className="flex flex-col gap-1">
        {totals.map(({ colorId, minutes }) => (
          <li key={colorId} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-sm border border-border/50 shrink-0"
              style={{ backgroundColor: getBlockColor(colorId) ?? undefined }}
            />
            {/* The name, not just the swatch. Several pairs in this palette are
                the same colour to a deuteranope, and a mono print renders every
                bar the same grey. */}
            <span className="text-[11px] text-foreground w-24 shrink-0 truncate">
              {labels[colorId] || BLOCK_COLORS[colorId - 1]?.label}
            </span>
            <span className="flex-1 h-3 rounded-sm bg-muted/30 overflow-hidden">
              {/* Width is a share of the largest tag, so the biggest bar fills
                  the row and the rest are read against it. */}
              <span
                className="block h-full rounded-sm"
                style={{
                  width: `${(minutes / largest) * 100}%`,
                  backgroundColor: getBlockColor(colorId) ?? undefined,
                }}
              />
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground w-16 text-right shrink-0">
              {formatMinutes(minutes)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TimeByTag;
