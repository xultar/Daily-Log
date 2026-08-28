import React, { useCallback, useEffect, useRef, useState } from "react";
import { HOUR_LABELS, formatHourLabel } from "@/lib/planner-data";
import { getBlockColor, isTagRunStart, displayPositionForColorId, colorIdForDisplayPosition } from "@/lib/palette";
import ColorPicker from "./ColorPicker";

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
      x: e.clientX,
      y: e.clientY,
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
      // "0" is the tenth key on the number row, so it means display position
      // 10. Positions 11 and 12 have no key at all: twelve colours outran the
      // row, and Shift+digit was rejected as a shortcut nobody discovers.
      const position = e.key === "0" ? 10 : parseInt(e.key);
      const colorId = colorIdForDisplayPosition(position);
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
            {formatHourLabel(hour)}
          </div>
          {[0, 1, 2, 3, 4, 5].map((blockIdx) => {
            const val = timeBlocks[hourIdx]?.[blockIdx] ?? 0;
            const bg = getBlockColor(val);
            // Twelve colour tags arrive as twelve indistinguishable grays on a
            // mono laser, so each run carries its legend number. Only the
            // first block of a run does, or a full hour would print six
            // identical digits. Invisible on screen; index.css reveals it in
            // print only.
            const runStart = isTagRunStart(timeBlocks[hourIdx], blockIdx);
            return (
              <div
                key={blockIdx}
                data-tag={runStart ? displayPositionForColorId(val) : undefined}
                className={`flex-1 ${large ? "h-[16px]" : "h-[10px]"} border-l border-campus-grid cursor-pointer transition-colors flex items-center justify-center ${
                  val === 0 ? "hover:bg-campus-grid" : ""
                } ${runStart ? "tag-run-start" : ""}`}
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
        <ColorPicker
          x={contextMenu.x}
          y={contextMenu.y}
          onPick={pickColor}
          onClear={() => {
            setBlock(contextMenu.hourIdx, contextMenu.blockIdx, 0);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default TimeGrid;
