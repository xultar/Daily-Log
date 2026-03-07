import React from "react";
import { format, parse } from "date-fns";
import { DayData, calcDayTotal } from "@/lib/planner-data";
import TimeGrid from "./TimeGrid";
import { Plus, X } from "lucide-react";

interface DailyViewProps {
  day: DayData;
  dayIndex: number;
  onChange: (day: DayData) => void;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DailyView: React.FC<DailyViewProps> = ({ day, dayIndex, onChange }) => {
  const dateObj = parse(day.date, "yyyy-MM-dd", new Date());
  const total = calcDayTotal(day);

  const updateSubject = (idx: number, field: "subject" | "checked", value: string | boolean) => {
    const subjects = day.subjects.map((s, i) =>
      i === idx ? { ...s, [field]: value } : s
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
          <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Subjects / To Do</div>
          <div className="border border-border rounded-md overflow-hidden mb-1">
            {day.subjects.map((s, idx) => (
              <div key={idx} className="flex items-center border-b border-campus-grid last:border-b-0 px-2 py-1.5 group">
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
                  placeholder="Add subject..."
                />
                <button
                  onClick={() => removeSubject(idx)}
                  className="opacity-0 group-hover:opacity-50 hover:!opacity-100 text-muted-foreground p-0.5 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addSubject}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4 self-start"
          >
            <Plus className="h-3 w-3" />
            Add subject
          </button>

          <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Memo</div>
          <textarea
            value={day.memo}
            onChange={(e) => onChange({ ...day, memo: e.target.value })}
            className="w-full flex-1 text-sm bg-transparent border border-border rounded-md outline-none resize-none min-h-[120px] p-2 text-foreground placeholder:text-muted-foreground/50"
            placeholder="Notes for the day..."
          />
        </div>

        {/* Right: Time Grid — larger */}
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Time Log</div>
          <div className="border border-border rounded-md overflow-hidden">
            <TimeGrid
              timeBlocks={day.timeBlocks}
              onChange={(timeBlocks) => onChange({ ...day, timeBlocks })}
              size="large"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyView;
