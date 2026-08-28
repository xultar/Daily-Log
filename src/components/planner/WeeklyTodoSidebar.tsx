import React from "react";
import { TodoItem } from "@/lib/planner-data";
import { carriedWeeks } from "@/lib/carry";
import { carryRuleClass } from "@/lib/carry-age";
import { Plus, Strikethrough } from "lucide-react";
import MigratedMarker from "./MigratedMarker";
import ScheduleMenu from "./ScheduleMenu";
import AgeMarker from "./AgeMarker";

interface WeeklyTodoSidebarProps {
  todos: TodoItem[];
  /** ISO Monday of the week being viewed, for the age calculation. */
  mondayISO: string;
  onChange: (todos: TodoItem[]) => void;
}



const WeeklyTodoSidebar: React.FC<WeeklyTodoSidebarProps> = ({ todos, mondayISO, onChange }) => {
  const update = (idx: number, field: "text" | "checked", value: string | boolean) => {
    const next = todos.map((t, i) => (i === idx ? { ...t, [field]: value } : t));
    onChange(next);
  };

  const addTodo = () => {
    onChange([...todos, { text: "", checked: false }]);
  };

  /**
   * As DailyView.toggleStruck. Weekly Actions are carry candidates too, so
   * leaving them out would keep the bar offering items already decided against.
   */
  /** Stamped only after the item has actually landed in the chosen week. */
  const markScheduled = (idx: number, destinationMonday: string) => {
    onChange(todos.map((t, i) => (i === idx ? { ...t, migratedTo: destinationMonday } : t)));
  };

  const toggleStruck = (idx: number) => {
    onChange(todos.map((t, i) => (i === idx ? { ...t, struck: !t.struck } : t)));
  };

  const removeTodo = (idx: number) => {
    if (todos.length <= 1) return;
    onChange(todos.filter((_, i) => i !== idx));
  };

  return (
    <div className="border-r border-border flex flex-col w-32 shrink-0">
      <div className="bg-primary/40 text-[9px] font-semibold text-center py-1 border-b border-border text-primary-foreground">
        Weekly Actions
      </div>
      <div className="flex-1 overflow-y-auto">
        {todos.map((todo, idx) => {
          // The rule spends margin the row was not using. A chip or dots would
          // take width from the item's own text, and this column is 128px at
          // 9px text. Thickness caps at three so a long-slipped item cannot
          // crowd the text out.
          const age = carriedWeeks(todo.origin, mondayISO);
          const rule = carryRuleClass(age);
          return (
          <div key={idx} className={`flex items-center border-b border-campus-grid px-1 group ${rule}`}>
            <input
              type="checkbox"
              checked={todo.checked}
              onChange={(e) => update(idx, "checked", e.target.checked)}
              className="h-3 w-3 shrink-0 accent-campus-blue-dark"
            />
            <MigratedMarker migratedTo={todo.migratedTo} className="text-[11px] leading-none text-muted-foreground shrink-0" />
            <input
              type="text"
              value={todo.text}
              onChange={(e) => update(idx, "text", e.target.value)}
              className={`flex-1 text-[9px] px-1 py-[3px] bg-transparent border-none outline-none min-w-0 text-foreground placeholder:text-muted-foreground/50 ${todo.checked ? "line-through text-muted-foreground" : ""} ${todo.struck ? "line-through opacity-50" : ""}`}
              placeholder="—"
            />
            <AgeMarker age={age} className="text-[7px] text-muted-foreground shrink-0 tabular-nums" />
            <ScheduleMenu
              mondayISO={mondayISO}
              text={todo.text}
              onScheduled={(destination) => markScheduled(idx, destination)}
            />
            <button
              type="button"
              onClick={() => toggleStruck(idx)}
              aria-pressed={!!todo.struck}
              aria-label={todo.struck ? "Restore" : "Strike out"}
              title={todo.struck ? "Restore" : "Strike out"}
              className={`shrink-0 p-0.5 transition-colors ${
                todo.struck
                  ? "text-foreground"
                  : "text-muted-foreground/40 hover:text-muted-foreground"
              }`}
            >
              <Strikethrough className="h-3 w-3" />
            </button>
            <button
              onClick={() => removeTodo(idx)}
              className="opacity-0 group-hover:opacity-50 hover:!opacity-100 text-[8px] text-muted-foreground px-0.5 transition-opacity"
              title="Remove"
            >
              ×
            </button>
          </div>
        );})}
      </div>
      <button
        onClick={addTodo}
        className="no-print flex items-center justify-center gap-0.5 py-1 text-[9px] text-muted-foreground hover:text-foreground border-t border-border transition-colors"
      >
        <Plus className="h-2.5 w-2.5" />
        Add
      </button>
    </div>
  );
};

export default WeeklyTodoSidebar;
