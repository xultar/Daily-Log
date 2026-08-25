import React, { useState, useEffect } from "react";
import { format, parse } from "date-fns";
import { DayData, calcDayTotal, calcDayColorMinutes, formatMinutes, getPaletteInDisplayOrder, loadColorLabels, saveColorLabels, getBlockColor, getBlockTint } from "@/lib/planner-data";
import TimeGrid from "./TimeGrid";
import { Flag, Plus, X } from "lucide-react";
import { useIsDark } from "@/hooks/use-is-dark";
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

  const isDark = useIsDark();

  const colorMinutes = calcDayColorMinutes(day);

  useEffect(() => {
    saveColorLabels(colorLabels);
  }, [colorLabels]);

  const updateLabel = (id: number, value: string) => {
    setColorLabels((prev) => ({ ...prev, [id]: value }));
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

  const removeSubject = (idx: number) => {
    if (day.subjects.length <= 1) return;
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
        {/* Left: Subjects + Memo */}
        <div className="flex flex-col">
          <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Priorities / Actions</div>
          <div className="border border-border rounded-md overflow-hidden mb-1">
            {day.subjects.map((s, idx) => {
              const tint = getBlockTint(s.colorId, isDark);
              const stripe = getBlockColor(s.colorId, isDark);
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
                <button
                  onClick={() => removeSubject(idx)}
                  className="opacity-0 group-hover:opacity-50 hover:!opacity-100 text-muted-foreground p-0.5 transition-opacity"
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
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4 self-start"
          >
            <Plus className="h-3 w-3" />
            Add priority / action
          </button>

          <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Memo</div>
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
                // The container draws the outer edges, so a cell adds a line
                // only where the grid itself needs one. Nine entries in two
                // columns leave the last row holding a single cell: its bottom
                // border would sit on the container's, and a right border would
                // be a stub into the empty half of the row.
                const inLastRow = index >= shown.length - (shown.length % 2 || 2);
                const hasCellToTheRight = index % 2 === 0 && index + 1 < shown.length;
                return (
                <button
                  key={c.id}
                  onClick={() => onActiveColorChange(c.id)}
                  className={`flex items-center gap-1.5 px-2 py-1 border-border/50 transition-all ${
                    inLastRow ? "" : "border-b"
                  } ${hasCellToTheRight ? "border-r" : ""} ${
                    activeColor === c.id
                      ? "bg-muted/60 ring-1 ring-inset ring-foreground/10"
                      : "hover:bg-muted/30"
                  }`}
                >
                  <span
                    className="inline-block w-3 h-3 rounded-sm border border-border/50 shrink-0"
                    style={{ backgroundColor: `hsl(${isDark ? c.hslDark : c.hsl})` }}
                  />
                  <span className="text-[10px] font-medium text-foreground/50 w-3">{index + 1}</span>
                  <input
                    type="text"
                    value={colorLabels[c.id] ?? ""}
                    onChange={(e) => updateLabel(c.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={c.label}
                    className="flex-1 text-[11px] bg-transparent border-none outline-none min-w-0 text-foreground placeholder:text-muted-foreground/40"
                  />
                  {(colorMinutes[c.id] ?? 0) > 0 && (
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {formatMinutes(colorMinutes[c.id])}
                    </span>
                  )}
                </button>
                );
              })}
            </div>
          </div>
          <div className="text-[9px] text-muted-foreground/60 mt-1">
            Press 1–9 to switch color &middot; Right-click block to pick color
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
