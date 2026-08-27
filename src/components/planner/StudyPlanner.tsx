import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { startOfWeek, addWeeks, subWeeks, addMonths, subMonths, format, parse } from "date-fns";
import { WeekData, DayData, TodoItem, CarryCandidate, loadWeek, saveWeek, collectCarryForward, applyCarryForward } from "@/lib/planner-data";
import { findCarrySource, isCurrentOrFutureWeek } from "@/lib/carry-source";
import WeeklyTodoSidebar from "./WeeklyTodoSidebar";
import DayColumn from "./DayColumn";
import DailyView from "./DailyView";
import MonthlyView from "./MonthlyView";
import ToolbarActions from "./ToolbarActions";
import SearchDialog from "./SearchDialog";
import TemplateDialog from "./TemplateDialog";
import TrendsDialog from "./TrendsDialog";
import { applyTemplate } from "@/lib/week-template";
import WeeklyColorLegend from "./WeeklyColorLegend";
import CarryForwardBar from "./CarryForwardBar";
import { ChevronLeft, ChevronRight, Printer, Calendar, CalendarDays, CalendarRange, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calcWeekTotal, calcWeekColorMinutes, getWeekDates, getWeekKey } from "@/lib/planner-data";
import { readItem, writeItem, onExternalChange } from "@/lib/storage";
import CrossTabNotice from "./CrossTabNotice";
import { toast } from "@/hooks/use-toast";

type ViewMode = "daily" | "weekly" | "monthly";

const StudyPlanner: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [weekData, setWeekData] = useState<WeekData>(() => loadWeek(currentDate));
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showWeekends, setShowWeekends] = useState(() => {
    return readItem("planner-show-weekends") !== "false";
  });
  // Storage id of the armed color, shared by every view. Not a display position.
  const [activeColor, setActiveColor] = useState(1);

  // Candidates are looked up per week, not per edit: recomputing on every
  // weekData change would re-scan storage on every keystroke. This reads only,
  // so it cannot write to a week the user has merely opened.
  const [candidates, setCandidates] = useState<CarryCandidate[]>([]);

  useEffect(() => {
    if (!isCurrentOrFutureWeek(currentDate)) {
      setCandidates([]);
      return;
    }
    const source = findCarrySource(currentDate);
    setCandidates(source ? collectCarryForward(source.week, source.monday) : []);
  }, [currentDate, refreshKey]);

  // Two separate questions, both refs so that neither causes a render:
  //   dirtyRef   — does weekData hold a change the user made? This gates saving
  //                at all, so merely opening a week never writes it back.
  //   pendingRef — is a write still waiting out the debounce, and which week
  //                does it belong to? Anything that ends the debounce early has
  //                to write this rather than drop it.
  const dirtyRef = useRef(false);
  const pendingRef = useRef<{ date: Date; data: WeekData } | null>(null);
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  // Another tab wrote the week on screen while this tab had edited it.
  const [conflict, setConflict] = useState(false);

  // dirtyRef picks between the two cases: a clean tab has nothing to lose and
  // simply reloads, while a tab that has edited this week is told rather than
  // overwritten. The conflict belongs to one week, so arriving at a week clears
  // it. Declared after dirtyRef because it reads it.
  useEffect(() => {
    setConflict(false);
    const weekKey = `planner-${getWeekKey(currentDate)}`;
    return onExternalChange((key) => {
      // null means another tab called clear(), so everything changed.
      if (key !== null && key !== weekKey) return;
      if (dirtyRef.current) setConflict(true);
      else setRefreshKey((k) => k + 1);
    });
  }, [currentDate]);

  // Whether the last autosave was refused. A storage failure persists, so
  // warning on every keystroke would bury the message under itself; warn on the
  // transition into failure instead, and again if it recurs after recovering.
  const saveFailedRef = useRef(false);

  // Touches only refs, so it is stable and safe to list as an effect dependency.
  const flushPendingSave = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    const saved = saveWeek(pending.date, pending.data);
    if (!saved && !saveFailedRef.current) {
      toast({
        title: "Your changes are not being saved",
        description:
          "This browser's storage is full or unavailable. Export a backup before closing the tab.",
        variant: "destructive",
      });
    }
    saveFailedRef.current = !saved;
  }, []);

  useEffect(() => {
    // React runs the save effect's cleanup — which clears the debounce timer —
    // before this effect, so an edit made in the last 300ms is written here or
    // not at all. It goes to the week it was made in, which pendingRef carries.
    flushPendingSave();
    setWeekData(loadWeek(currentDate));
    // A freshly loaded week has nothing unsaved.
    dirtyRef.current = false;
  }, [currentDate, refreshKey, flushPendingSave]);

  useEffect(() => {
    if (!dirtyRef.current) return;
    pendingRef.current = { date: currentDate, data: weekData };
    const timer = setTimeout(flushPendingSave, 300);
    return () => clearTimeout(timer);
  }, [weekData, currentDate, flushPendingSave]);

  // The other two ways the debounce ends early. React does not unmount when the
  // tab closes, so pagehide covers that; this effect's cleanup covers unmount.
  useEffect(() => {
    window.addEventListener("pagehide", flushPendingSave);
    return () => {
      window.removeEventListener("pagehide", flushPendingSave);
      flushPendingSave();
    };
  }, [flushPendingSave]);

  useEffect(() => {
    writeItem("planner-show-weekends", String(showWeekends));
  }, [showWeekends]);

  const updateDay = useCallback((dayIndex: number, day: DayData) => {
    markDirty();
    setWeekData((prev) => ({
      ...prev,
      days: prev.days.map((d, i) => (i === dayIndex ? day : d)),
    }));
  }, [markDirty]);

  const updateTodos = useCallback((todos: TodoItem[]) => {
    markDirty();
    setWeekData((prev) => ({ ...prev, weeklyTodos: todos }));
  }, [markDirty]);

  const updateField = useCallback((field: "weekGoal" | "weekReview", value: string) => {
    markDirty();
    setWeekData((prev) => ({ ...prev, [field]: value }));
  }, [markDirty]);

  const reloadFromOtherTab = useCallback(() => {
    // Drop the pending write BEFORE reloading. The load effect calls
    // flushPendingSave first, so a bare refreshKey bump would write this tab's
    // stale copy over the other tab's work and then read back its own write —
    // Reload doing the opposite of its label.
    //
    // Race-free rather than lucky: flushPendingSave returns early on a null
    // pendingRef, so a debounce timer firing in the gap is a no-op. dirtyRef is
    // deliberately NOT cleared here — the load effect does it, and nothing
    // reads the flag in between, so a second assignment would be dead code
    // dressed as a safeguard. Mutation-tested: removing it changes nothing.
    pendingRef.current = null;
    setConflict(false);
    setRefreshKey((k) => k + 1);
  }, []);

  const keepMine = useCallback(() => setConflict(false), []);

  const bringForward = useCallback((chosen: CarryCandidate[]) => {
    markDirty();
    setWeekData((prev) => ({ ...applyCarryForward(prev, chosen), carryResolved: true }));
  }, [markDirty]);

  const dismissCarry = useCallback(() => {
    markDirty();
    setWeekData((prev) => ({ ...prev, carryResolved: true }));
  }, [markDirty]);

  /**
   * The updater form is load-bearing, for the reason bringForward's is. This
   * is a useCallback with a stable dependency, so closing over weekData would
   * capture the mount-time week and write it under whatever week is on screen
   * later.
   */
  const applyWeekTemplate = useCallback((source: WeekData) => {
    markDirty();
    setWeekData((prev) => applyTemplate(prev, source));
  }, [markDirty]);

  /**
   * Back to now, from wherever the user has navigated to. Setting both pieces of
   * state covers all three views at once: the day view lands on today itself,
   * the week view on this week, and the month view on this month, since it
   * derives from currentDate.
   */
  const goToToday = () => {
    const now = new Date();
    setCurrentDate(startOfWeek(now, { weekStartsOn: 1 }));
    // getDay() counts Sunday as 0; the planner's week starts on Monday.
    setSelectedDayIndex(now.getDay() === 0 ? 6 : now.getDay() - 1);
  };

  const navigatePrev = () => {
    if (viewMode === "daily") {
      if (selectedDayIndex > 0) setSelectedDayIndex(selectedDayIndex - 1);
      else { setCurrentDate(subWeeks(currentDate, 1)); setSelectedDayIndex(6); }
    } else if (viewMode === "weekly") setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subMonths(currentDate, 1));
  };

  const navigateNext = () => {
    if (viewMode === "daily") {
      if (selectedDayIndex < 6) setSelectedDayIndex(selectedDayIndex + 1);
      else { setCurrentDate(addWeeks(currentDate, 1)); setSelectedDayIndex(0); }
    } else if (viewMode === "weekly") setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addMonths(currentDate, 1));
  };

  const dates = getWeekDates(currentDate);
  const mondayISO = format(dates[0], "yyyy-MM-dd");
  // Both memos recompute on every weekData change, which includes every
  // painted block, memo/priority edit, and goal/review keystroke — they do
  // not save the drag-paint walk. What they save is re-running the ~798-cell
  // walk on renders that don't touch weekData: armed-color changes, view-mode
  // switches, and the weekend toggle.
  const total = useMemo(() => calcWeekTotal(weekData), [weekData]);
  const weekColorMinutes = useMemo(() => calcWeekColorMinutes(weekData), [weekData]);
  // slice(0, 5) is a prefix slice (Mon-Fri are days 0-4), so index i below
  // always equals the real day index in weekData.days for both branches.
  const visibleDays = showWeekends ? weekData.days : weekData.days.slice(0, 5);

  const getNavLabel = () => {
    if (viewMode === "monthly") return format(currentDate, "MMMM yyyy");
    if (viewMode === "daily") return format(dates[selectedDayIndex], "EEEE, MMMM d, yyyy");
    return `${format(dates[0], "MMM d")} — ${format(dates[showWeekends ? 6 : 4], "MMM d, yyyy")}`;
  };

  const viewButtons: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
    { mode: "daily", icon: <Calendar className="h-3 w-3" />, label: "Day" },
    { mode: "weekly", icon: <CalendarDays className="h-3 w-3" />, label: "Week" },
    { mode: "monthly", icon: <CalendarRange className="h-3 w-3" />, label: "Month" },
  ];

  return (
    <div className="planner-container h-screen flex flex-col bg-background overflow-hidden">
      {/* Top toolbar */}
      <div className="no-print flex items-center justify-between px-3 py-1.5 bg-primary/30 border-b border-border shrink-0">
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
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 ml-1"
            onClick={goToToday}
          >
            Today
          </Button>
        </div>

        <div className="flex items-center gap-2">
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

          {viewMode === "weekly" && (
            <button
              onClick={() => setShowWeekends(!showWeekends)}
              className="flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              title={showWeekends ? "Hide weekends" : "Show weekends"}
            >
              {showWeekends ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {showWeekends ? "Hide" : "Show"} weekends
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="text-[10px] text-primary-foreground/70">
            Week: <span className="font-bold text-primary-foreground">{total.hours}h {total.minutes}m</span>
          </div>
          <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => window.print()}>
            <Printer className="h-3 w-3" />
            Print
          </Button>
          {/* A result always lands on the week view: one rule, no exceptions
              to remember. The row itself names the day for a memo or priority,
              which is what makes that rule workable when the week view shows a
              memo as one truncated line. */}
          <SearchDialog
            onJump={(monday) => {
              setCurrentDate(parse(monday, "yyyy-MM-dd", new Date()));
              setViewMode("weekly");
            }}
            // A month result opens the month view, so it cannot ride onJump —
            // that handler hardcodes the weekly view, and TagHistoryPanel shares
            // it. The first of the month is an arbitrary but stable day inside
            // the month, which is all MonthlyView reads from currentDate.
            onJumpToMonth={(monthKey) => {
              setCurrentDate(parse(`${monthKey}-01`, "yyyy-MM-dd", new Date()));
              setViewMode("monthly");
            }}
          />
          {/* Deliberately after SearchDialog rather than earlier in the
              toolbar: carry-bar.test.tsx finds the week chevrons positionally,
              as querySelectorAll("button")[0] and [1], so a button inserted
              before them renumbers every one and breaks an unrelated file. */}
          <TemplateDialog week={weekData} weekDate={currentDate} onApply={applyWeekTemplate} />
          <TrendsDialog />
          <ToolbarActions onDataImported={() => setRefreshKey((k) => k + 1)} />
        </div>
      </div>

      {/* Goal / Review row. Prints deliberately: a sheet that gets pinned up
          wants the week's goal on it, and this row carrying no-print read as
          an accident of markup rather than a decision. */}
      {viewMode !== "monthly" && (
        <div className="flex border-b border-border shrink-0">
          <div className="flex-1 flex items-center gap-1 px-2 py-1 border-r border-border">
            <span className="text-[9px] font-semibold text-muted-foreground shrink-0 uppercase">Goal</span>
            <input
              type="text"
              value={weekData.weekGoal}
              onChange={(e) => updateField("weekGoal", e.target.value)}
              className="flex-1 text-xs bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50"
              placeholder="What do you want to achieve this week?"
            />
          </div>
          <div className="flex-1 flex items-center gap-1 px-2 py-1">
            <span className="text-[9px] font-semibold text-muted-foreground shrink-0 uppercase">Review</span>
            <input
              type="text"
              value={weekData.weekReview}
              onChange={(e) => updateField("weekReview", e.target.value)}
              className="flex-1 text-xs bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50"
              placeholder="How did the week go?"
            />
          </div>
        </div>
      )}

      {/* Both bars sit below the week chevrons on purpose — see the note on the
          carry-forward block below. */}
      {conflict && <CrossTabNotice onReload={reloadFromOtherTab} onKeepMine={keepMine} />}

      {/* Carry-forward review. Sits below both week chevrons on purpose: the
          suite reaches the next week with querySelectorAll("button")[1], so a
          control inserted before them repoints that lookup at the wrong button
          and the failure reads as a rendering bug rather than a layout change.
          The tests that would actually catch it are the navigating ones in
          carry-bar.test.tsx — autosave.test.tsx and pending-save.test.tsx seed
          no prior week, so no bar renders there and their indices are safe. */}
      {/* Weekly view only. The items land in the Weekly Actions sidebar, which
          the day view does not show — pressing Bring there would make the bar
          vanish with nothing visibly happening, and carryResolved would then
          stop it reappearing in the week view. */}
      {viewMode === "weekly" && !weekData.carryResolved && candidates.length > 0 && (
        <CarryForwardBar
          // Keyed so the bar remounts whenever its candidate list can change.
          // Its tick state is by array position, so a reused mount would leave
          // an outstanding untick glued to the index rather than the item.
          // refreshKey belongs here too: an import changes the candidates
          // without changing the Monday.
          key={`${mondayISO}:${refreshKey}`}
          candidates={candidates}
          mondayISO={mondayISO}
          onBring={bringForward}
          onDismiss={dismissCarry}
        />
      )}

      {/* View content */}
      {viewMode === "daily" && (
        <div className="flex-1 overflow-auto min-h-0">
          <DailyView
            day={weekData.days[selectedDayIndex]}
            dayIndex={selectedDayIndex}
            onChange={(d) => updateDay(selectedDayIndex, d)}
            activeColor={activeColor}
            onActiveColorChange={setActiveColor}
          />
        </div>
      )}

      {viewMode === "weekly" && (
        <div className="flex flex-col flex-1 overflow-hidden border-t border-border min-h-0">
          <div className="flex flex-1 overflow-hidden min-h-0">
            <WeeklyTodoSidebar
              todos={weekData.weeklyTodos}
              mondayISO={mondayISO}
              onChange={updateTodos}
            />
            <div className="flex flex-1 min-w-0 h-full overflow-x-auto">
              {visibleDays.map((day, i) => (
                <div key={day.date} className="flex-1 min-w-[100px] h-full">
                  <DayColumn
                    day={day}
                    dayIndex={i}
                    onChange={(d) => updateDay(i, d)}
                    activeColor={activeColor}
                    onActiveColorChange={setActiveColor}
                  />
                </div>
              ))}
            </div>
          </div>
          <WeeklyColorLegend
            colorMinutes={weekColorMinutes}
            activeColor={activeColor}
            onSelect={setActiveColor}
          />
        </div>
      )}

      {viewMode === "monthly" && (
        <div className="flex-1 overflow-auto min-h-0">
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
