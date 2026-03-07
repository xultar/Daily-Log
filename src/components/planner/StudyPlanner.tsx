import React, { useState, useEffect, useCallback } from "react";
import { startOfWeek, addWeeks, subWeeks, addDays, subDays, addMonths, subMonths, format } from "date-fns";
import { WeekData, DayData, TodoItem, loadWeek, saveWeek } from "@/lib/planner-data";
import WeeklyTodoSidebar from "./WeeklyTodoSidebar";
import DayColumn from "./DayColumn";
import DailyView from "./DailyView";
import MonthlyView from "./MonthlyView";
import ToolbarActions from "./ToolbarActions";
import { ChevronLeft, ChevronRight, Printer, Calendar, LayoutGrid, CalendarDays, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calcWeekTotal, getWeekDates } from "@/lib/planner-data";

type ViewMode = "daily" | "weekly" | "monthly";

const StudyPlanner: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [weekData, setWeekData] = useState<WeekData>(() => loadWeek(currentDate));
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setWeekData(loadWeek(currentDate));
  }, [currentDate, refreshKey]);

  useEffect(() => {
    const timer = setTimeout(() => saveWeek(currentDate, weekData), 300);
    return () => clearTimeout(timer);
  }, [weekData, currentDate]);

  const updateDay = useCallback((dayIndex: number, day: DayData) => {
    setWeekData((prev) => ({
      ...prev,
      days: prev.days.map((d, i) => (i === dayIndex ? day : d)),
    }));
  }, []);

  const updateTodos = useCallback((todos: TodoItem[]) => {
    setWeekData((prev) => ({ ...prev, weeklyTodos: todos }));
  }, []);

  const updateField = useCallback((field: "weekGoal" | "weekReview", value: string) => {
    setWeekData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const navigatePrev = () => {
    if (viewMode === "daily") {
      if (selectedDayIndex > 0) {
        setSelectedDayIndex(selectedDayIndex - 1);
      } else {
        setCurrentDate(subWeeks(currentDate, 1));
        setSelectedDayIndex(6);
      }
    } else if (viewMode === "weekly") {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(subMonths(currentDate, 1));
    }
  };

  const navigateNext = () => {
    if (viewMode === "daily") {
      if (selectedDayIndex < 6) {
        setSelectedDayIndex(selectedDayIndex + 1);
      } else {
        setCurrentDate(addWeeks(currentDate, 1));
        setSelectedDayIndex(0);
      }
    } else if (viewMode === "weekly") {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(addMonths(currentDate, 1));
    }
  };

  const dates = getWeekDates(currentDate);
  const total = calcWeekTotal(weekData);

  const getNavLabel = () => {
    if (viewMode === "monthly") return format(currentDate, "MMMM yyyy");
    if (viewMode === "daily") {
      const d = dates[selectedDayIndex];
      return format(d, "EEEE, MMMM d, yyyy");
    }
    return `${format(dates[0], "MMM d")} — ${format(dates[6], "MMM d, yyyy")}`;
  };

  const viewButtons: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
    { mode: "daily", icon: <Calendar className="h-3 w-3" />, label: "Day" },
    { mode: "weekly", icon: <CalendarDays className="h-3 w-3" />, label: "Week" },
    { mode: "monthly", icon: <CalendarRange className="h-3 w-3" />, label: "Month" },
  ];

  return (
    <div className="planner-container min-h-screen flex flex-col bg-background">
      {/* Top toolbar */}
      <div className="no-print flex items-center justify-between px-3 py-1.5 bg-primary/30 border-b border-border">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={navigatePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-semibold text-primary-foreground min-w-[180px] text-center">
            {getNavLabel()}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={navigateNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* View mode tabs */}
        <div className="flex items-center gap-0.5 bg-background/50 rounded-md p-0.5">
          {viewButtons.map(({ mode, icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                viewMode === mode
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="text-[10px] text-primary-foreground/70">
            Week: <span className="font-bold text-primary-foreground">{total.hours}h {total.minutes}m</span>
          </div>
          <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => window.print()}>
            <Printer className="h-3 w-3" />
            Print
          </Button>
          <ToolbarActions onDataImported={() => setRefreshKey((k) => k + 1)} />
        </div>
      </div>

      {/* Goal / Review row (show in weekly/daily) */}
      {viewMode !== "monthly" && (
        <div className="no-print flex border-b border-border">
          <div className="flex-1 flex items-center gap-1 px-2 py-1 border-r border-border">
            <span className="text-[9px] font-semibold text-muted-foreground shrink-0">WEEKLY GOAL</span>
            <input
              type="text"
              value={weekData.weekGoal}
              onChange={(e) => updateField("weekGoal", e.target.value)}
              className="flex-1 text-xs bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50"
              placeholder="Set your weekly goal..."
            />
          </div>
          <div className="flex-1 flex items-center gap-1 px-2 py-1">
            <span className="text-[9px] font-semibold text-muted-foreground shrink-0">WEEK IN REVIEW</span>
            <input
              type="text"
              value={weekData.weekReview}
              onChange={(e) => updateField("weekReview", e.target.value)}
              className="flex-1 text-xs bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50"
              placeholder="Reflect on your week..."
            />
          </div>
        </div>
      )}

      {/* View content */}
      {viewMode === "daily" && (
        <div className="flex-1 overflow-auto">
          <DailyView
            day={weekData.days[selectedDayIndex]}
            dayIndex={selectedDayIndex}
            onChange={(d) => updateDay(selectedDayIndex, d)}
          />
        </div>
      )}

      {viewMode === "weekly" && (
        <div className="flex overflow-x-auto border-t border-border">
          <WeeklyTodoSidebar todos={weekData.weeklyTodos} onChange={updateTodos} />
          <div className="flex flex-1 min-w-0">
            {weekData.days.slice(0, 3).map((day, i) => (
              <div key={i} className="flex-1 min-w-[120px]">
                <DayColumn day={day} dayIndex={i} onChange={(d) => updateDay(i, d)} />
              </div>
            ))}
          </div>
          <div className="w-3 bg-muted border-x border-border flex flex-col items-center justify-center gap-3 shrink-0">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-border" />
            ))}
          </div>
          <div className="flex flex-1 min-w-0">
            {weekData.days.slice(3).map((day, i) => (
              <div key={i + 3} className="flex-1 min-w-[120px]">
                <DayColumn day={day} dayIndex={i + 3} onChange={(d) => updateDay(i + 3, d)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === "monthly" && (
        <div className="flex-1 overflow-auto">
          <MonthlyView
            currentDate={currentDate}
            onSelectDay={(date) => {
              setCurrentDate(startOfWeek(date, { weekStartsOn: 1 }));
              setSelectedDayIndex(date.getDay() === 0 ? 6 : date.getDay() - 1);
              setViewMode("daily");
            }}
          />
        </div>
      )}
    </div>
  );
};

export default StudyPlanner;
