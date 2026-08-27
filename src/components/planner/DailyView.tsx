import React, { useState } from "react";
import { format, parse } from "date-fns";
import { DayData, calcDayTotal, calcDayColorMinutes, formatMinutes, getPaletteInDisplayOrder, legendCellBorders, loadColorLabels, saveColorLabels, getBlockColor, getBlockTint } from "@/lib/planner-data";
import TimeGrid from "./TimeGrid";
import { Flag, Plus, X } from "lucide-react";
import ColorPicker from "./ColorPicker";

interface DailyViewProps {
  day: DayData;
  dayIndex: number;
  onChange: (day: DayData) => void;
  activeColor: number;
  onActiveColorChange: (color: number) => void;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DailyView: React.FC<DailyViewProps> = ({ day, dayIndex, onChange, activeColor, onActiveColorChange }) => {
  const dateObj = parse(day.date, "yyyy-MM-dd", new Date());
  const total = calcDayTotal(day);
  const [colorLabels, setColorLabels] = useState<Record<number, string>>(() => loadColorLabels());
  const [rowPicker, setRowPicker] = useState<{ x: number; y: number; idx: number } | null>(null);


  const colorMinutes = calcDayColorMinutes(day);

  /**
   * Saved here rather than from an effect on `colorLabels`.
   *
   * That effect ran on mount as well as on change, so opening the day view
   * wrote the labels it had just loaded straight back — `planner-color-labels:
   * {}` on a planner where nobody had ever named a tag. Harmless in itself, and
   * the same shape as the bug `dirtyRef` exists to prevent in `StudyPlanner`,
   * where a read that writes turned an unreadable week into an empty one 300ms
   * after it was viewed.
   *
   * A guard would have worked. Removing the effect is better: this is the only
   * thing that changes the labels, so writing where the change happens leaves
   * nothing to guard and no way for a mount to write at all.
   */
  const updateLabel = (id: number, value: string) => {
    const next = { ...colorLabels, [id]: value };
    setColorLabels(next);
    saveColorLabels(next);
  };

  const updateSubject = (idx: number, field: "subject" | "checked", value: string | boolean) => {
    const subjects = day.subjects.map((s, i) =>
      i === idx ? { ...s, [field]: value } : s
    );
    onChange({ ...day, subjects });
  };

  // colorId is a storage id, matching activeColor and timeBlocks.
  const setRowColor = (idx: number, colorId: number | undefined) => {
    const subjects = day.subjects.map((s, i) => (i === idx ? { ...s, colorId } : s));
    onChange({ ...day, subjects });
  };

  // Clicking a row already carrying the armed colour clears it, mirroring
  // how clicking a filled time block clears it.
  const toggleRowColor = (idx: number) => {
    const current = day.subjects[idx].colorId;
    setRowColor(idx, current === activeColor ? undefined : activeColor);
  };

  // The spread is what carries colorId and the row text through the change;
  // listing fields here would drop them with no type error.
  const toggleFlag = (idx: number) => {
    const subjects = day.subjects.map((s, i) =>
      i === idx ? { ...s, flagged: !s.flagged } : s
    );
    onChange({ ...day, subjects });
  };

  const addSubject = () => {
    onChange({ ...day, subjects: [...day.subjects, { subject: "", checked: false }] });
  };

  // The same quantity the delete control announces, so the label cannot drift
  // from what the guard below actually does.
  const canRemoveSubject = day.subjects.length > 1;

  const removeSubject = (idx: number) => {
    if (!canRemoveSubject) return;
    onChange({ ...day, subjects: day.subjects.filter((_, i) => i !== idx) });
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Date header */}
      <div className="bg-primary/40 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-primary-foreground/80">{DAY_NAMES[dayIndex]}</div>
          <div className="text-xl font-bold text-primary-foreground">{format(dateObj, "MMMM d, yyyy")}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-primary-foreground/60">TOTAL</div>
          <div className="text-lg font-bold text-primary-foreground">{total.hours}h {total.minutes}m</div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-6">
        {/* Left: Subjects + Daily Log / Notes */}
        <div className="flex flex-col">
          <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Priorities / Actions</div>
          <div className="border border-border rounded-md overflow-hidden mb-1">
            {day.subjects.map((s, idx) => {
              const tint = getBlockTint(s.colorId);
              const stripe = getBlockColor(s.colorId);
              return (
              <div
                key={idx}
                className="flex items-stretch border-b border-campus-grid last:border-b-0 group"
                style={tint ? { backgroundColor: tint } : undefined}
              >
                <button
                  type="button"
                  onClick={() => toggleRowColor(idx)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setRowPicker({ x: e.clientX, y: e.clientY, idx });
                  }}
                  aria-label={s.colorId ? "Change row colour" : "Tag row with the armed colour"}
                  title={s.colorId ? "Click to clear, right-click to change" : "Click to tag with the armed colour"}
                  className={`w-[10px] shrink-0 cursor-pointer border-l-[3px] transition-colors ${
                    s.colorId ? "" : "border-border/70 hover:border-foreground/40"
                  }`}
                  style={stripe ? { borderLeftColor: stripe } : undefined}
                />
                <div className="flex items-center flex-1 min-w-0 px-1 py-1.5">
                <input
                  type="checkbox"
                  checked={s.checked}
                  onChange={(e) => updateSubject(idx, "checked", e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-campus-blue-dark mr-2"
                />
                <input
                  type="text"
                  value={s.subject}
                  onChange={(e) => updateSubject(idx, "subject", e.target.value)}
                  className={`flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50 ${s.checked ? "line-through text-muted-foreground" : ""}`}
                  placeholder="Add priority / action..."
                />
                <button
                  type="button"
                  onClick={() => toggleFlag(idx)}
                  aria-pressed={!!s.flagged}
                  aria-label={s.flagged ? "Remove priority flag" : "Flag as priority"}
                  title={s.flagged ? "Remove priority flag" : "Flag as priority"}
                  className={`shrink-0 p-0.5 transition-colors ${
                    s.flagged
                      ? "text-foreground"
                      : "text-muted-foreground/40 hover:text-muted-foreground"
                  }`}
                >
                  <Flag className="h-3.5 w-3.5" fill={s.flagged ? "currentColor" : "none"} />
                </button>
                {/*
                  * `aria-disabled` rather than `disabled`, because
                  * `removeSubject` already refuses the last row and a real
                  * `disabled` would take the button out of the tab order —
                  * leaving a keyboard user with no way to hear why. It also
                  * swallows the click before the guard is consulted, which
                  * would let the guard rot with its own test still green.
                  *
                  * `opacity-0` hides the browser's focus outline as well as the
                  * icon, so revealing on `focus-visible` is what makes a
                  * keyboard user able to see the control they can already reach.
                  * `focus-visible` rather than `focus` keeps it off mouse
                  * clicks; the `!` mirrors `hover:!opacity-100` so it beats
                  * `group-hover:opacity-50` by intent rather than by Tailwind's
                  * variant ordering.
                  */}
                <button
                  type="button"
                  onClick={() => removeSubject(idx)}
                  aria-disabled={!canRemoveSubject}
                  aria-label={canRemoveSubject
                    ? "Delete priority row"
                    : "Delete priority row (a day keeps at least one)"}
                  title={canRemoveSubject
                    ? "Delete priority row"
                    : "A day keeps at least one row"}
                  className="opacity-0 group-hover:opacity-50 hover:!opacity-100 focus-visible:!opacity-100 text-muted-foreground p-0.5 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
                </div>
              </div>
              );
            })}
          </div>
          <button
            onClick={addSubject}
            className="no-print flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4 self-start"
          >
            <Plus className="h-3 w-3" />
            Add priority / action
          </button>

          <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Daily Log / Notes</div>
          <textarea
            value={day.memo}
            onChange={(e) => onChange({ ...day, memo: e.target.value })}
            className="w-full flex-1 text-sm bg-transparent border border-border rounded-md outline-none resize-none min-h-[120px] p-2 text-foreground placeholder:text-muted-foreground/50"
            placeholder="Notes for the day..."
          />
        </div>

        {/* Right: Time Grid + Legend */}
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Time Log</div>
          <div className="border border-border rounded-md overflow-hidden">
            <TimeGrid
              timeBlocks={day.timeBlocks}
              onChange={(timeBlocks) => onChange({ ...day, timeBlocks })}
              size="large"
              activeColor={activeColor}
              onActiveColorChange={onActiveColorChange}
            />
          </div>

          {/* Editable Color Legend */}
          <div className="mt-2 border border-border rounded-md overflow-hidden">
            <div className="bg-muted/30 px-2 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
              Color Tags
            </div>
            <div className="grid grid-cols-2 gap-0">
              {getPaletteInDisplayOrder().map((c, index, shown) => {
                const borders = legendCellBorders(index, shown.length);
                // The name the user knows this colour by, custom or default —
                // the same value the weekly legend shows, so the two agree.
                const name = colorLabels[c.id] || c.label;
                // Display position, never the storage id: this is what the
                // number keys actually select. Position 10 is the 0 key, and
                // 11 and 12 have none, so they promise none.
                const position = index + 1;
                const keyHint =
                  position < 10 ? ` (key ${position})` : position === 10 ? " (key 0)" : "";
                return (
                <div
                  key={c.id}
                  className={`flex items-center gap-1.5 px-2 py-1 border-border/50 transition-all ${
                    borders.bottom ? "border-b" : ""
                  } ${borders.right ? "border-r" : ""} ${
                    activeColor === c.id
                      ? "bg-muted/60 ring-1 ring-inset ring-foreground/10"
                      : "hover:bg-muted/30"
                  }`}
                >
                  {/* Arming and renaming are two controls, not one. A button
                      may not contain interactive content, and the field used to
                      sit inside this button held in place by a stopPropagation.
                      aria-label names the button outright, so the swatch and the
                      number inside it need no treatment of their own. */}
                  <button
                    type="button"
                    onClick={() => onActiveColorChange(c.id)}
                    aria-pressed={activeColor === c.id}
                    aria-label={`Use ${name}${keyHint}`}
                    // Stretched to the cell's full height, and its padding
                    // pulled back out with negative margins, so the hit area
                    // covers the row without moving anything. Splitting the
                    // cell shrank this target from the whole cell to a swatch
                    // and a number; at py-0.5 it measured 19px tall, under the
                    // 24px minimum. An accessibility fix should not leave a
                    // target too small to hit.
                    className="flex items-center gap-1.5 shrink-0 self-stretch -mx-1 -my-1 px-1 py-1 rounded cursor-pointer"
                  >
                    <span
                      className="inline-block w-3 h-3 rounded-sm border border-border/50 shrink-0"
                      style={{ backgroundColor: `hsl(var(--tag-${c.id}))` }}
                    />
                    <span className="text-[10px] font-medium text-foreground/50 w-3">{position}</span>
                  </button>
                  <input
                    type="text"
                    value={colorLabels[c.id] ?? ""}
                    onChange={(e) => updateLabel(c.id, e.target.value)}
                    aria-label={`Rename ${name}`}
                    placeholder={c.label}
                    className="flex-1 text-[11px] bg-transparent border-none outline-none min-w-0 text-foreground placeholder:text-muted-foreground/40"
                  />
                  {(colorMinutes[c.id] ?? 0) > 0 && (
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {formatMinutes(colorMinutes[c.id])}
                    </span>
                  )}
                </div>
                );
              })}
            </div>
          </div>
          <div className="no-print text-[9px] text-muted-foreground/60 mt-1">
            Press 1–9 or 0 to switch color &middot; Right-click block to pick color
          </div>
        </div>
      </div>
      {rowPicker && (
        <ColorPicker
          x={rowPicker.x}
          y={rowPicker.y}
          onPick={(colorId) => {
            setRowColor(rowPicker.idx, colorId);
            onActiveColorChange(colorId);
            setRowPicker(null);
          }}
          onClear={() => {
            setRowColor(rowPicker.idx, undefined);
            setRowPicker(null);
          }}
          onClose={() => setRowPicker(null)}
        />
      )}
    </div>
  );
};

export default DailyView;
