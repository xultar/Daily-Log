import React from "react";
import { TodoItem } from "@/lib/planner-data";
import { Plus } from "lucide-react";

interface WeeklyTodoSidebarProps {
  todos: TodoItem[];
  onChange: (todos: TodoItem[]) => void;
}

const WeeklyTodoSidebar: React.FC<WeeklyTodoSidebarProps> = ({ todos, onChange }) => {
  const update = (idx: number, field: "text" | "checked", value: string | boolean) => {
    const next = todos.map((t, i) => (i === idx ? { ...t, [field]: value } : t));
    onChange(next);
  };

  const addTodo = () => {
    onChange([...todos, { text: "", checked: false }]);
  };

  const removeTodo = (idx: number) => {
    if (todos.length <= 1) return;
    onChange(todos.filter((_, i) => i !== idx));
  };

  return (
    <div className="border-r border-border flex flex-col w-32 shrink-0">
      <div className="bg-primary/40 text-[9px] font-semibold text-center py-1 border-b border-border text-primary-foreground">
        Weekly To Do
      </div>
      <div className="flex-1 overflow-y-auto">
        {todos.map((todo, idx) => (
          <div key={idx} className="flex items-center border-b border-campus-grid px-1 group">
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
              className={`flex-1 text-[9px] px-1 py-[3px] bg-transparent border-none outline-none min-w-0 text-foreground placeholder:text-muted-foreground/50 ${todo.checked ? "line-through text-muted-foreground" : ""}`}
              placeholder="—"
            />
            <button
              onClick={() => removeTodo(idx)}
              className="opacity-0 group-hover:opacity-50 hover:!opacity-100 text-[8px] text-muted-foreground px-0.5 transition-opacity"
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={addTodo}
        className="flex items-center justify-center gap-0.5 py-1 text-[9px] text-muted-foreground hover:text-foreground border-t border-border transition-colors"
      >
        <Plus className="h-2.5 w-2.5" />
        Add
      </button>
    </div>
  );
};

export default WeeklyTodoSidebar;
