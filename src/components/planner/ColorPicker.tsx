import React, { useEffect } from "react";
import { getPaletteInDisplayOrder } from "@/lib/planner-data";

interface ColorPickerProps {
  /** Raw client coordinates of the triggering event. Clamped internally. */
  x: number;
  y: number;
  /** Receives a storage id. */
  onPick: (colorId: number) => void;
  onClear: () => void;
  onClose: () => void;
}

// Measured from the rendered element: 10 buttons at 24px, 9 gaps at 4px,
// 6px padding each side, 1px border each side. The clamp lives here rather
// than at the call sites so both callers get it and the constants sit next
// to the element they describe.
const PICKER_WIDTH = 290;
const PICKER_HEIGHT = 38;
const EDGE_MARGIN = 10;

const ColorPicker: React.FC<ColorPickerProps> = ({ x, y, onPick, onClear, onClose }) => {
  const isDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - PICKER_WIDTH - EDGE_MARGIN);
  const top = Math.min(y, window.innerHeight - PICKER_HEIGHT - EDGE_MARGIN);

  return (
    <div
      className="fixed z-50 bg-popover border border-border rounded-md shadow-lg p-1.5 flex gap-1"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      {getPaletteInDisplayOrder().map((c, index) => (
        <button
          key={c.id}
          className="w-6 h-6 rounded-sm border border-border/50 hover:scale-110 transition-transform flex items-center justify-center text-[9px] font-bold"
          style={{ backgroundColor: `hsl(${isDark ? c.hslDark : c.hsl})` }}
          title={`${c.label} (${index + 1})`}
          aria-label={`${c.label} (${index + 1})`}
          onClick={() => onPick(c.id)}
        >
          {index + 1}
        </button>
      ))}
      <button
        className="w-6 h-6 rounded-sm border border-border/50 hover:scale-110 transition-transform bg-background text-[9px] text-muted-foreground"
        title="Clear"
        aria-label="Clear colour"
        onClick={onClear}
      >
        &times;
      </button>
    </div>
  );
};

export default ColorPicker;
