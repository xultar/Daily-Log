import React, { useState } from "react";
import {
  getPaletteInDisplayOrder,
  loadColorLabels,
  saveColorLabels,
  formatMinutes,
} from "@/lib/planner-data";
import RenameTagsDialog from "./RenameTagsDialog";

interface WeeklyColorLegendProps {
  colorMinutes: Record<number, number>;
  activeColor: number;
  onSelect: (colorId: number) => void;
}

const WeeklyColorLegend: React.FC<WeeklyColorLegendProps> = ({ colorMinutes, activeColor, onSelect }) => {
  // Read once per mount, not per render: loadColorLabels() hits localStorage
  // and this component re-renders at drag-paint rate. A useState initialiser
  // runs exactly once, so that property is unchanged — what it adds is that
  // the strip can now update itself when the rename dialog edits a label.
  //
  // The weekly branch in StudyPlanner is conditionally rendered (not kept
  // mounted with `hidden`), so switching to daily and back genuinely remounts
  // this component and a label edited in the daily view still shows up here.
  // If that conditional rendering is ever changed to an always-mounted/hidden
  // pattern, this would silently keep showing whatever labels existed at first
  // mount.
  const [labels, setLabels] = useState<Record<number, string>>(() => loadColorLabels());

  /**
   * Saved here rather than from an effect on `labels`, matching
   * DailyView.updateLabel. That effect ran on mount as well as on change, so
   * opening the view wrote back the labels it had just read — writing where
   * the change happens leaves nothing for a mount to trigger.
   */
  const updateLabel = (id: number, value: string) => {
    const next = { ...labels, [id]: value };
    setLabels(next);
    saveColorLabels(next);
  };


  return (
    <div className="shrink-0 border-t border-border bg-muted/20 flex items-center">
      <div className="overflow-x-auto flex-1 min-w-0">
      {/* w-max keeps this row at its content width so the parent's
          overflow-x-auto scrolls instead of squashing entries. Each button
          is already shrink-0, so entries wouldn't compress without it either
          way — what w-max actually guards is the trailing padding, which
          would otherwise get clipped at the container edge. Belt and braces. */}
      <div className="flex items-center gap-3 px-2 py-1 w-max">
        {getPaletteInDisplayOrder().map((c, index) => {
          // c.id is the storage id (position in BLOCK_COLORS) and is what
          // gets passed to onSelect/colorMinutes. index + 1 is only the
          // display position shown as the small leading number.
          const name = labels[c.id] || c.label;
          const mins = colorMinutes[c.id] ?? 0;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              aria-pressed={activeColor === c.id}
              className={`flex items-center gap-1 shrink-0 px-1 py-0.5 rounded transition-all ${
                activeColor === c.id
                  ? "bg-muted/70 ring-1 ring-inset ring-foreground/10"
                  : "hover:bg-muted/40"
              }`}
            >
              <span
                className="inline-block w-3 h-3 rounded-sm border border-border/50 shrink-0"
                style={{ backgroundColor: `hsl(var(--tag-${c.id}))` }}
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
      {/* Outside the scroller on purpose: after twelve entries it would be off
          screen at any normal width. */}
      <RenameTagsDialog labels={labels} onRename={updateLabel} />
    </div>
  );
};

export default WeeklyColorLegend;
