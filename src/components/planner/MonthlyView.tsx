import React from "react";
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  format,
  isSameMonth,
  getISOWeek,
} from "date-fns";
import { loadWeek, calcDayTotal, getWeekKey, getWeekDates } from "@/lib/planner-data";

interface MonthlyViewProps {
  currentDate: Date;
  onSelectDay: (date: Date) => void;
}

const MonthlyView: React.FC<MonthlyViewProps> = ({ currentDate, onSelectDay }) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const allDays = eachDayOfInterval({ start: calStart, end: calEnd });

  // Preload relevant weeks
  const weekCache = React.useMemo(() => {
    const cache: Record<string, ReturnType<typeof loadWeek>> = {};
    for (const d of allDays) {
      const key = getWeekKey(d);
      if (!cache[key]) cache[key] = loadWeek(d);
    }
    return cache;
  }, [currentDate]);

  const getDayStudyMinutes = (date: Date): number => {
    const key = getWeekKey(date);
    const week = weekCache[key];
    if (!week) return 0;
    const dateStr = format(date, "yyyy-MM-dd");
    const day = week.days.find((d) => d.date === dateStr);
    if (!day) return 0;
    const { hours, minutes } = calcDayTotal(day);
    return hours * 60 + minutes;
  };

  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-foreground">{format(currentDate, "MMMM yyyy")}</h2>
      </div>

      <div className="grid grid-cols-7 border border-border rounded-lg overflow-hidden">
        {/* Day headers */}
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-primary/30 text-center text-[10px] font-semibold py-1.5 text-primary-foreground border-b border-border">
            {d}
          </div>
        ))}

        {/* Calendar cells */}
        {weeks.map((week, wi) =>
          week.map((date, di) => {
            const mins = getDayStudyMinutes(date);
            const inMonth = isSameMonth(date, currentDate);
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            // Intensity based on study time (max 4h = full)
            const intensity = Math.min(mins / 240, 1);

            return (
              <div
                key={`${wi}-${di}`}
                onClick={() => onSelectDay(date)}
                className={`border-b border-r border-border p-1.5 min-h-[70px] cursor-pointer hover:bg-primary/10 transition-colors ${
                  !inMonth ? "opacity-40" : ""
                }`}
              >
                <div className="text-xs font-medium text-foreground">{format(date, "d")}</div>
                {mins > 0 && (
                  <div
                    className="mt-1 rounded-sm px-1 py-0.5 text-[9px] font-medium text-center"
                    style={{
                      backgroundColor: `hsl(var(--campus-filled) / ${0.3 + intensity * 0.7})`,
                      color: `hsl(var(--primary-foreground))`,
                    }}
                  >
                    {h}h{m > 0 ? ` ${m}m` : ""}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="text-[10px] text-muted-foreground text-center mt-2">
        Click on a day to switch to daily view
      </p>
    </div>
  );
};

export default MonthlyView;
