import React from "react";
import { format, parse } from "date-fns";
import { DayData, calcDayTotal } from "@/lib/planner-data";
import TimeGrid from "./TimeGrid";

interface DayColumnProps {
  day: DayData;
  dayIndex: number;
  onChange: (day: DayData) => void;
  compact?: boolean;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DayColumn: React.FC<DayColumnProps> = ({ day, dayIndex, onChange, compact }) => {
  const dateObj = parse(day.date, "yyyy-MM-dd", new Date());
  const total = calcDayTotal(day);

  const updateSubject = (idx: number, field: "subject" | "checked", value: string | boolean) => {
    const subjects = day.subjects.map((s, i) =>
      i === idx ? { ...s, [field]: value } : s
    );
    onChange({ ...day, subjects });
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
        {day.subjects.map((s, idx) => (
          <div key={idx} className="flex items-center border-b border-campus-grid last:border-b-0">
            <input
              type="checkbox"
              checked={s.checked}
              onChange={(e) => updateSubject(idx, "checked", e.target.checked)}
              className="ml-0.5 h-3 w-3 shrink-0 accent-campus-blue-dark"
            />
            <input
              type="text"
              value={s.subject}
              onChange={(e) => updateSubject(idx, "subject", e.target.value)}
              className="flex-1 text-[9px] px-0.5 py-[1px] bg-transparent border-none outline-none min-w-0 text-foreground placeholder:text-muted-foreground/50"
              placeholder="—"
            />
          </div>
        ))}
      </div>

      {/* Time Grid */}
      <div className="border-b border-border">
        <TimeGrid
          timeBlocks={day.timeBlocks}
          onChange={(timeBlocks) => onChange({ ...day, timeBlocks })}
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
    </div>
  );
};

export default DayColumn;
