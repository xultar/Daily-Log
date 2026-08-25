import React, { useState } from "react";
import { format, parse } from "date-fns";
import { DayData, calcDayTotal, getBlockColor, getBlockTint } from "@/lib/planner-data";
import TimeGrid from "./TimeGrid";
import ColorPicker from "./ColorPicker";
import { useIsDark } from "@/hooks/use-is-dark";

interface DayColumnProps {
  day: DayData;
  dayIndex: number;
  onChange: (day: DayData) => void;
  compact?: boolean;
  activeColor: number;
  onActiveColorChange: (color: number) => void;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DayColumn: React.FC<DayColumnProps> = ({ day, dayIndex, onChange, compact, activeColor, onActiveColorChange }) => {
  const dateObj = parse(day.date, "yyyy-MM-dd", new Date());
  const total = calcDayTotal(day);

  const isDark = useIsDark();

  const [rowPicker, setRowPicker] = useState<{ x: number; y: number; idx: number } | null>(null);

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

  return (
    <div className="border-r border-border flex flex-col min-w-0 h-full">
      {/* Date header */}
      <div className="bg-primary/40 px-1 py-0.5 text-center border-b border-border">
        <div className="text-[10px] font-medium text-primary-foreground/80">{DAY_NAMES[dayIndex]}</div>
        <div className="text-xs font-semibold text-primary-foreground">
          {format(dateObj, "M/d")}
        </div>
      </div>

      {/* Priorities + Actions */}
      <div className="border-b border-border">
        <div className="bg-primary/20 text-[8px] font-medium text-center py-0.5 border-b border-campus-grid text-primary-foreground/70">
          Priorities / Actions
        </div>
        {day.subjects.map((s, idx) => {
          const tint = getBlockTint(s.colorId, isDark);
          const stripe = getBlockColor(s.colorId, isDark);
          return (
          <div
            key={idx}
            className="flex items-stretch border-b border-campus-grid last:border-b-0"
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
              className={`w-[8px] shrink-0 cursor-pointer border-l-[3px] transition-colors ${
                s.colorId ? "" : "border-border/70 hover:border-foreground/40"
              }`}
              style={stripe ? { borderLeftColor: stripe } : undefined}
            />
            <input
              type="checkbox"
              checked={s.checked}
              onChange={(e) => updateSubject(idx, "checked", e.target.checked)}
              className="h-3 w-3 shrink-0 self-center accent-campus-blue-dark"
            />
            <input
              type="text"
              value={s.subject}
              onChange={(e) => updateSubject(idx, "subject", e.target.value)}
              className="flex-1 self-center text-[9px] px-0.5 py-[1px] bg-transparent border-none outline-none min-w-0 text-foreground placeholder:text-muted-foreground/50"
              placeholder="—"
            />
          </div>
          );
        })}
      </div>

      {/* Time Grid */}
      <div className="border-b border-border">
        <TimeGrid
          timeBlocks={day.timeBlocks}
          onChange={(timeBlocks) => onChange({ ...day, timeBlocks })}
          activeColor={activeColor}
          onActiveColorChange={onActiveColorChange}
        />
      </div>

      {/* Total */}
      <div className="bg-primary/20 text-center py-0.5 border-b border-border">
        <span className="text-[9px] font-medium text-primary-foreground/80">
          {total.hours}h {total.minutes}m
        </span>
      </div>

      {/* Memo — fills remaining height */}
      <div className="flex-1 p-0.5 min-h-0">
        <textarea
          value={day.memo}
          onChange={(e) => onChange({ ...day, memo: e.target.value })}
          className="w-full h-full text-[8px] bg-transparent border-none outline-none resize-none text-foreground placeholder:text-muted-foreground/50"
          placeholder="Memo..."
        />
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

export default DayColumn;
