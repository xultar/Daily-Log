import React from "react";
import { TodoItem } from "@/lib/planner-data";

interface WeeklyTodoSidebarProps {
  todos: TodoItem[];
  onChange: (todos: TodoItem[]) => void;
}

const WeeklyTodoSidebar: React.FC<WeeklyTodoSidebarProps> = ({ todos, onChange }) => {
  const update = (idx: number, field: "text" | "checked", value: string | boolean) => {
    const next = todos.map((t, i) => (i === idx ? { ...t, [field]: value } : t));
    onChange(next);
  };

  return (
    <div className="border-r border-border flex flex-col w-28 shrink-0">
      <div className="bg-primary/40 text-[9px] font-semibold text-center py-1 border-b border-border text-primary-foreground">
        Weekly To Do
      </div>
      <div className="flex-1">
        {todos.map((todo, idx) => (
          <div key={idx} className="flex items-center border-b border-campus-grid px-1">
            <input
              type="checkbox"
              checked={todo.checked}
              onChange={(e) => update(idx, "checked", e.target.checked)}
              className="h-3 w-3 shrink-0 accent-campus-blue-dark"
            />
            <input
              type="text"
              value={todo.text}
              onChange={(e) => update(idx, "text", e.target.value)}
              className="flex-1 text-[9px] px-1 py-[2px] bg-transparent border-none outline-none min-w-0 text-foreground placeholder:text-muted-foreground/50"
              placeholder="—"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default WeeklyTodoSidebar;
