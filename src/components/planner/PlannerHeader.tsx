import React from "react";
import { format, addWeeks, subWeeks } from "date-fns";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { getWeekDates, calcWeekTotal, WeekData } from "@/lib/planner-data";
import { Button } from "@/components/ui/button";

interface PlannerHeaderProps {
  currentDate: Date;
  weekData: WeekData;
  onDateChange: (date: Date) => void;
  onFieldChange: (field: "weekGoal" | "weekReview", value: string) => void;
}

const PlannerHeader: React.FC<PlannerHeaderProps> = ({
  currentDate,
  weekData,
  onDateChange,
  onFieldChange,
}) => {
  const dates = getWeekDates(currentDate);
  const total = calcWeekTotal(weekData);
  const rangeLabel = `${format(dates[0], "MMM d")} — ${format(dates[6], "MMM d, yyyy")}`;

  return (
    <div className="no-print">
      {/* Nav row */}
      <div className="flex items-center justify-between px-4 py-2 bg-primary/30 border-b border-border">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onDateChange(subWeeks(currentDate, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold text-primary-foreground">{rangeLabel}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onDateChange(addWeeks(currentDate, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs font-medium text-primary-foreground/80">
            Weekly Total:{" "}
            <span className="font-bold text-primary-foreground">{total.hours}h {total.minutes}m</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => window.print()}
          >
            <Printer className="h-3 w-3" />
            Print
          </Button>
        </div>
      </div>

      {/* Goal / Review row */}
      <div className="flex border-b border-border">
        <div className="flex-1 flex items-center gap-1 px-2 py-1 border-r border-border">
          <span className="text-[9px] font-semibold text-muted-foreground shrink-0">WEEKLY GOAL</span>
          <input
            type="text"
            value={weekData.weekGoal}
            onChange={(e) => onFieldChange("weekGoal", e.target.value)}
            className="flex-1 text-xs bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50"
            placeholder="Set your weekly goal..."
          />
        </div>
        <div className="flex-1 flex items-center gap-1 px-2 py-1">
          <span className="text-[9px] font-semibold text-muted-foreground shrink-0">WEEK IN REVIEW</span>
          <input
            type="text"
            value={weekData.weekReview}
            onChange={(e) => onFieldChange("weekReview", e.target.value)}
            className="flex-1 text-xs bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50"
            placeholder="Reflect on your week..."
          />
        </div>
      </div>
    </div>
  );
};

export default PlannerHeader;
