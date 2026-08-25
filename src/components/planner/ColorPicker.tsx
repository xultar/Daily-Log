import React, { useEffect, useRef } from "react";
import { getPaletteInDisplayOrder, COLOR_IDS_IN_DISPLAY_ORDER } from "@/lib/planner-data";
import { useIsDark } from "@/hooks/use-is-dark";

interface ColorPickerProps {
  /** Raw client coordinates of the triggering event. Clamped internally. */
  x: number;
  y: number;
  /** Receives a storage id. */
  onPick: (colorId: number) => void;
  onClear: () => void;
  onClose: () => void;
}

// Measured from the rendered element: buttons at 24px (w-6), gaps at 4px
// (gap-1), and 14px of chrome (p-1.5 both sides + 1px border both sides).
// Derived from the palette length rather than hardcoded so the clamp keeps
// working as BLOCK_COLORS grows. The clamp lives here rather than at the
// call sites so both callers get it and the constants sit next to the
// element they describe.
const SWATCH_PX = 24; // w-6
const GAP_PX = 4; // gap-1
const CHROME_PX = 14; // p-1.5 both sides + 1px border both sides
const BUTTON_COUNT = COLOR_IDS_IN_DISPLAY_ORDER.length + 1; // swatches plus clear
const PICKER_WIDTH = BUTTON_COUNT * SWATCH_PX + (BUTTON_COUNT - 1) * GAP_PX + CHROME_PX;
const PICKER_HEIGHT = SWATCH_PX + CHROME_PX;
const EDGE_MARGIN = 10;

const ColorPicker: React.FC<ColorPickerProps> = ({ x, y, onPick, onClear, onClose }) => {
  const isDark = useIsDark();

  // Latched in a ref rather than depended on directly: callers pass inline
  // arrows, and depending on `onClose` would tear down and rebuild the
  // subscription on every parent render. The ref keeps the subscription's
  // lifetime tied to the component instance while always invoking the
  // latest callback.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Dismiss on mousedown, not click: a right-click press never fires
    // `click`, so if a second picker is opened via right-click while this
    // one is open, a `click` listener would never see it and both pickers
    // would stay mounted. `mousedown` precedes `contextmenu` within the
    // same press, so this picker closes before the next one opens.
    const close = () => onCloseRef.current();
    window.addEventListener("mousedown", close);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const left = Math.max(EDGE_MARGIN, Math.min(x, window.innerWidth - PICKER_WIDTH - EDGE_MARGIN));
  const top = Math.max(EDGE_MARGIN, Math.min(y, window.innerHeight - PICKER_HEIGHT - EDGE_MARGIN));

  return (
    <div
      className="fixed z-50 bg-popover border border-border rounded-md shadow-lg p-1.5 flex gap-1"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
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
