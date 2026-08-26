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
import { useTheme } from "@/lib/theme-context";
import { resolveScheme, prefersDark } from "@/lib/color-scheme";
import { loadWeek, calcDayTotal, getWeekKey, getWeekDates, dominantTag, getBlockTint, tintAlpha, WASH_CEILING_DARK, WASH_CEILING_LIGHT, loadColorLabels, BLOCK_COLORS } from "@/lib/planner-data";

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

  const getDayDominantTag = (date: Date): number | null => {
    const week = weekCache[getWeekKey(date)];
    if (!week) return null;
    const day = week.days.find((d) => d.date === format(date, "yyyy-MM-dd"));
    return day ? dominantTag(day) : null;
  };

  // How strong the wash may get depends on the theme, and by a lot: dark caps
  // at 0.45 because the tags are lighter than the page and drag the cell toward
  // the colour of its own text, while light clears WCAG AA at any alpha. Both
  // numbers, and why they differ, live on the constants.
  //
  // Read through the context rather than the `.dark` class so this is not
  // reaching into the DOM during render, and recomputed on every render so a
  // system theme change — which re-renders the provider — is picked up.
  const { colorScheme } = useTheme();
  const washCeiling = resolveScheme(colorScheme, prefersDark())
    ? WASH_CEILING_DARK
    : WASH_CEILING_LIGHT;

  // Read once per mount, as WeeklyColorLegend does and for the same reason:
  // loadColorLabels hits localStorage, and StudyPlanner renders the month
  // branch conditionally rather than keeping it mounted and hidden, so
  // switching views genuinely remounts this and picks up a renamed tag.
  const labels = React.useMemo(() => loadColorLabels(), []);

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

            // Hue says what the day was spent on, strength says how much. A ten
            // minute day is a hint; four hours is unmistakable.
            const tag = getDayDominantTag(date);
            const tint = tag === null ? null : getBlockTint(tag, tintAlpha(mins, washCeiling));
            const tagName = tag === null ? null : labels[tag] || BLOCK_COLORS[tag - 1]?.label;

            return (
              <div
                key={`${wi}-${di}`}
                onClick={() => onSelectDay(date)}
                // Hover is a ring rather than a background: an inline
                // backgroundColor beats a hover background class, so on exactly
                // the days that have data the hover would silently do nothing.
                className={`border-b border-r border-border p-1.5 min-h-[70px] cursor-pointer transition-colors hover:ring-1 hover:ring-inset hover:ring-foreground/20 ${
                  !inMonth ? "opacity-40" : ""
                }`}
                data-dominant-tag={tag ?? undefined}
                style={tint ? { backgroundColor: tint } : undefined}
              >
                <div className="text-xs font-medium text-foreground">{format(date, "d")}</div>
                {tagName && (
                  // The non-colour channel. Several pairs in this palette are
                  // the same colour to a deuteranope, and a mono print turns
                  // every tint into the same grey, so the tint alone says
                  // nothing to those readers.
                  <div className="mt-1 text-[9px] leading-tight text-foreground truncate">
                    {tagName}
                  </div>
                )}
                {mins > 0 && (
                  // Plain text now: the cell's own strength carries the
                  // intensity this pill used to shade itself with, and encoding
                  // one number twice reads as two facts.
                  <div className="text-[9px] font-medium text-foreground">
                    {h}h{m > 0 ? ` ${m}m` : ""}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="no-print text-[10px] text-muted-foreground text-center mt-2">
        Click on a day to switch to daily view
      </p>
    </div>
  );
};

export default MonthlyView;
