import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  HOUR_LABELS,
  getBlockColor,
  getPaletteInDisplayOrder,
  colorIdForDisplayPosition,
} from "@/lib/planner-data";

interface TimeGridProps {
  timeBlocks: number[][];
  onChange: (timeBlocks: number[][]) => void;
  size?: "compact" | "large";
  activeColor: number;
  onActiveColorChange: (color: number) => void;
}

const TimeGrid: React.FC<TimeGridProps> = ({
  timeBlocks,
  onChange,
  size = "compact",
  activeColor,
  onActiveColorChange: setActiveColor,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const paintValueRef = useRef<number>(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    hourIdx: number;
    blockIdx: number;
  } | null>(null);
  const large = size === "large";
  const containerRef = useRef<HTMLDivElement>(null);

  const isDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const setBlock = useCallback(
    (hourIdx: number, blockIdx: number, value: number) => {
      const next = timeBlocks.map((row) => [...row]);
      next[hourIdx][blockIdx] = value;
      onChange(next);
    },
    [timeBlocks, onChange]
  );

  const handleMouseDown = (hourIdx: number, blockIdx: number) => {
    const current = timeBlocks[hourIdx]?.[blockIdx] ?? 0;
    // If filled, clear it; if empty, paint with active color
    const newVal = current !== 0 ? 0 : activeColor;
    paintValueRef.current = newVal;
    setIsDragging(true);
    setBlock(hourIdx, blockIdx, newVal);
  };

  const handleMouseEnter = (hourIdx: number, blockIdx: number) => {
    if (isDragging) setBlock(hourIdx, blockIdx, paintValueRef.current);
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleContextMenu = (
    e: React.MouseEvent,
    hourIdx: number,
    blockIdx: number
  ) => {
    e.preventDefault();
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 300),
      y: Math.min(e.clientY, window.innerHeight - 44),
      hourIdx,
      blockIdx,
    });
  };

  const pickColor = (colorId: number) => {
    if (contextMenu) {
      setBlock(contextMenu.hourIdx, contextMenu.blockIdx, colorId);
    }
    setActiveColor(colorId);
    setContextMenu(null);
  };

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  // Number keys select by display position, not storage id
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (
        target.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
        target.closest?.('[role="menu"], [role="dialog"], [role="listbox"]')
      ) {
        return;
      }
      const colorId = colorIdForDisplayPosition(parseInt(e.key));
      if (colorId !== null) {
        setActiveColor(colorId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setActiveColor]);

  return (
    <div
      className="select-none"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      ref={containerRef}
    >
      {/* Minute header */}
      <div className="flex">
        <div className={`${large ? "w-9" : "w-6"} shrink-0`} />
        {[10, 20, 30, 40, 50, 60].map((m) => (
          <div
            key={m}
            className={`flex-1 text-center ${large ? "text-[9px]" : "text-[7px]"} text-muted-foreground border-l border-campus-grid`}
          >
            {m}
          </div>
        ))}
      </div>
      {/* Hour rows */}
      {HOUR_LABELS.map((hour, hourIdx) => (
        <div key={hour} className="flex border-t border-campus-grid">
          <div
            className={`${large ? "w-9 text-[10px]" : "w-6 text-[8px]"} shrink-0 text-muted-foreground flex items-center justify-center border-r border-campus-grid`}
          >
            {hour}
          </div>
          {[0, 1, 2, 3, 4, 5].map((blockIdx) => {
            const val = timeBlocks[hourIdx]?.[blockIdx] ?? 0;
            const bg = getBlockColor(val, isDark);
            return (
              <div
                key={blockIdx}
                className={`flex-1 ${large ? "h-[16px]" : "h-[10px]"} border-l border-campus-grid cursor-pointer transition-colors ${
                  val === 0 ? "hover:bg-campus-grid" : ""
                }`}
                style={bg ? { backgroundColor: bg } : undefined}
                onMouseDown={() => handleMouseDown(hourIdx, blockIdx)}
                onMouseEnter={() => handleMouseEnter(hourIdx, blockIdx)}
                onContextMenu={(e) => handleContextMenu(e, hourIdx, blockIdx)}
              />
            );
          })}
        </div>
      ))}

      {/* Context menu for color picking */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border border-border rounded-md shadow-lg p-1.5 flex gap-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {getPaletteInDisplayOrder().map((c, index) => (
            <button
              key={c.id}
              className="w-6 h-6 rounded-sm border border-border/50 hover:scale-110 transition-transform flex items-center justify-center text-[9px] font-bold"
              style={{ backgroundColor: `hsl(${isDark ? c.hslDark : c.hsl})` }}
              title={`${c.label} (${index + 1})`}
              aria-label={`${c.label} (${index + 1})`}
              onClick={() => pickColor(c.id)}
            >
              {index + 1}
            </button>
          ))}
          <button
            className="w-6 h-6 rounded-sm border border-border/50 hover:scale-110 transition-transform bg-background text-[9px] text-muted-foreground"
            title="Clear"
            onClick={() => {
              if (contextMenu) {
                setBlock(contextMenu.hourIdx, contextMenu.blockIdx, 0);
              }
              setContextMenu(null);
            }}
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
};

export default TimeGrid;
