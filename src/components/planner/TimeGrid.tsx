import React, { useCallback, useRef, useState } from "react";
import { HOUR_LABELS } from "@/lib/planner-data";

interface TimeGridProps {
  timeBlocks: boolean[][];
  onChange: (timeBlocks: boolean[][]) => void;
  size?: "compact" | "large";
}

const TimeGrid: React.FC<TimeGridProps> = ({ timeBlocks, onChange, size = "compact" }) => {
  const [isDragging, setIsDragging] = useState(false);
  const paintValueRef = useRef<boolean>(true);
  const large = size === "large";

  const toggle = useCallback(
    (hourIdx: number, blockIdx: number, forceValue?: boolean) => {
      const next = timeBlocks.map((row) => [...row]);
      next[hourIdx][blockIdx] = forceValue ?? !next[hourIdx][blockIdx];
      onChange(next);
    },
    [timeBlocks, onChange]
  );

  const handleMouseDown = (hourIdx: number, blockIdx: number) => {
    const newVal = !timeBlocks[hourIdx][blockIdx];
    paintValueRef.current = newVal;
    setIsDragging(true);
    toggle(hourIdx, blockIdx, newVal);
  };

  const handleMouseEnter = (hourIdx: number, blockIdx: number) => {
    if (isDragging) toggle(hourIdx, blockIdx, paintValueRef.current);
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div className="select-none" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      {/* Minute header */}
      <div className="flex">
        <div className={`${large ? "w-9" : "w-6"} shrink-0`} />
        {[10, 20, 30, 40, 50, 60].map((m) => (
          <div key={m} className={`flex-1 text-center ${large ? "text-[9px]" : "text-[7px]"} text-muted-foreground border-l border-campus-grid`}>
            {m}
          </div>
        ))}
      </div>
      {/* Hour rows */}
      {HOUR_LABELS.map((hour, hourIdx) => (
        <div key={hour} className="flex border-t border-campus-grid">
          <div className={`${large ? "w-9 text-[10px]" : "w-6 text-[8px]"} shrink-0 text-muted-foreground flex items-center justify-center border-r border-campus-grid`}>
            {hour}
          </div>
          {[0, 1, 2, 3, 4, 5].map((blockIdx) => (
            <div
              key={blockIdx}
              className={`flex-1 ${large ? "h-[16px]" : "h-[10px]"} border-l border-campus-grid cursor-pointer transition-colors ${
                timeBlocks[hourIdx]?.[blockIdx] ? "bg-campus-filled" : "hover:bg-campus-grid"
              }`}
              onMouseDown={() => handleMouseDown(hourIdx, blockIdx)}
              onMouseEnter={() => handleMouseEnter(hourIdx, blockIdx)}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export default TimeGrid;
