import React, { useState } from "react";
import { format, parse, isToday } from "date-fns";
import { DayData, calcDayTotal, getBlockColor, getBlockTint } from "@/lib/planner-data";
import TimeGrid from "./TimeGrid";
import ColorPicker from "./ColorPicker";
import { Flag } from "lucide-react";

interface DayColumnProps {
  day: DayData;
  dayIndex: number;
  onChange: (day: DayData) => void;
  activeColor: number;
  onActiveColorChange: (color: number) => void;
  /**
   * How many priority row slots to draw, real rows plus spacers.
   *
   * The week grid only reads across days if every column agrees on this, and a
   * column cannot know the longest day by itself — `StudyPlanner` computes it
   * from `visibleDays` and passes it down.
   *
   * Optional, defaulting to this day's own length, which is exactly the
   * unpadded behaviour. A caller that renders one column in isolation has
   * nothing to line up against and should not have to say so.
   */
  rowCount?: number;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DayColumn: React.FC<DayColumnProps> = ({ day, dayIndex, onChange, activeColor, onActiveColorChange, rowCount }) => {
  const dateObj = parse(day.date, "yyyy-MM-dd", new Date());
  const total = calcDayTotal(day);
  // isToday compares against an invalid date without throwing, so a damaged
  // date simply reads as not-today rather than taking the column down.
  const isCurrentDay = isToday(dateObj);


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

  // The spread is what carries colorId and the row text through the change;
  // listing fields here would drop them with no type error.
  const toggleFlag = (idx: number) => {
    const subjects = day.subjects.map((s, i) =>
      i === idx ? { ...s, flagged: !s.flagged } : s
    );
    onChange({ ...day, subjects });
  };

  return (
    <div className="border-r border-border flex flex-col min-w-0 h-full">
      {/* Date header */}
      <div
        aria-current={isCurrentDay ? "date" : undefined}
        className={`px-1 py-0.5 text-center border-b border-border ${
          isCurrentDay
            ? "bg-primary/80 ring-1 ring-inset ring-primary-foreground/25"
            : "bg-primary/40"
        }`}
      >
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
          const tint = getBlockTint(s.colorId);
          const stripe = getBlockColor(s.colorId);
          return (
          <div
            key={idx}
            data-row-slot=""
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
              className={`flex-1 self-center text-[9px] px-0.5 py-[1px] bg-transparent border-none outline-none min-w-0 text-foreground placeholder:text-muted-foreground/50 ${s.struck ? "line-through opacity-50" : ""}`}
              placeholder="—"
            />
            <button
              type="button"
              onClick={() => toggleFlag(idx)}
              aria-pressed={!!s.flagged}
              aria-label={s.flagged ? "Remove priority flag" : "Flag as priority"}
              title={s.flagged ? "Remove priority flag" : "Flag as priority"}
              className={`shrink-0 self-center pr-0.5 transition-colors ${
                s.flagged
                  ? "text-foreground"
                  : "text-muted-foreground/40 hover:text-muted-foreground"
              }`}
            >
              <Flag className="h-2.5 w-2.5" fill={s.flagged ? "currentColor" : "none"} />
            </button>
          </div>
          );
        })}

        {/* Spacers, so this column ends up the same height as its neighbours.
            A day may hold any number of rows — the day view can delete down to
            one and add without limit — and the week grid only reads across days
            if every column agrees. Padding the stored array instead would
            resurrect rows the user deleted on purpose; see repairList.

            Each child below is the empty equivalent of a real row's: the colour
            stripe, the checkbox, the text input. The height is matched **by
            construction, not by assertion** — jsdom does no layout, so nothing
            in the suite can catch this drifting if a real row's markup changes.
            Re-measure TimeGrid's offsetTop across columns in a browser if you
            touch either. */}
        {Array.from({ length: Math.max(0, (rowCount ?? day.subjects.length) - day.subjects.length) }, (_, i) => (
          <div
            key={`spacer-${i}`}
            data-row-slot=""
            aria-hidden="true"
            className="flex items-stretch border-b border-campus-grid last:border-b-0"
          >
            <span className="w-[8px] shrink-0 border-l-[3px] border-transparent" />
            <span className="h-3 w-3 shrink-0 self-center" />
            <span className="flex-1 self-center text-[9px] px-0.5 py-[1px] min-w-0">&nbsp;</span>
          </div>
        ))}
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

      {/* Daily Log / Notes — fills remaining height.
          Today's column gets a wash of the same token the header uses at full
          strength, so it follows the accent theme rather than being a fixed
          colour. Decoration only: aria-current belongs to the header alone, or
          the week announces the same day twice.

          Different alpha per theme, and the first place in this app to need
          one. Tokens flip themselves, which is why no `dark:` variant existed
          before — but alpha is not a token. `--primary` is a deep purple in
          dark and a pale lavender in light, so a single value that reads in one
          is invisible in the other: at 10% the light wash moved the page by
          three of 255. Measured rather than guessed, and unlike the month
          view's wash nothing here threatens text contrast — the constraint is
          only that it be seen. */}
      <div
        className={`flex-1 p-0.5 min-h-0 ${
          isCurrentDay ? "bg-primary/40 dark:bg-primary/15" : ""
        }`}
      >
        <textarea
          value={day.memo}
          onChange={(e) => onChange({ ...day, memo: e.target.value })}
          className="w-full h-full text-[8px] bg-transparent border-none outline-none resize-none text-foreground placeholder:text-muted-foreground/50"
          placeholder="Daily Log / Notes..."
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
