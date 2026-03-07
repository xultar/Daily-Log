import React, { useState, useEffect, useCallback } from "react";
import { startOfWeek } from "date-fns";
import { WeekData, DayData, TodoItem, loadWeek, saveWeek } from "@/lib/planner-data";
import PlannerHeader from "./PlannerHeader";
import WeeklyTodoSidebar from "./WeeklyTodoSidebar";
import DayColumn from "./DayColumn";

const StudyPlanner: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [weekData, setWeekData] = useState<WeekData>(() => loadWeek(currentDate));

  // Load data when week changes
  useEffect(() => {
    setWeekData(loadWeek(currentDate));
  }, [currentDate]);

  // Auto-save on changes
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

  return (
    <div className="planner-container min-h-screen flex flex-col bg-background">
      <PlannerHeader
        currentDate={currentDate}
        weekData={weekData}
        onDateChange={setCurrentDate}
        onFieldChange={updateField}
      />

      {/* Spread layout */}
      <div className="flex flex-1 overflow-x-auto border-t border-border">
        <WeeklyTodoSidebar todos={weekData.weeklyTodos} onChange={updateTodos} />

        {/* Left page: Mon-Wed */}
        <div className="flex flex-1 min-w-0">
          {weekData.days.slice(0, 3).map((day, i) => (
            <div key={i} className="flex-1 min-w-[120px]">
              <DayColumn day={day} dayIndex={i} onChange={(d) => updateDay(i, d)} />
            </div>
          ))}
        </div>

        {/* Spiral binding divider */}
        <div className="w-3 bg-muted border-x border-border flex flex-col items-center justify-center gap-3 shrink-0">
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-border" />
          ))}
        </div>

        {/* Right page: Thu-Sun */}
        <div className="flex flex-1 min-w-0">
          {weekData.days.slice(3).map((day, i) => (
            <div key={i + 3} className="flex-1 min-w-[120px]">
              <DayColumn day={day} dayIndex={i + 3} onChange={(d) => updateDay(i + 3, d)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StudyPlanner;
