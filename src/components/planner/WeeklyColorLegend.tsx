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
