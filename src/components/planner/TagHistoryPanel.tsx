import React from "react";
import { format, parse } from "date-fns";
import {
  BLOCK_COLORS,
  COLOR_IDS_IN_DISPLAY_ORDER,
  formatMinutes,
  getBlockColor,
  loadColorLabels,
} from "@/lib/planner-data";
import { TagUse, tagHistory } from "@/lib/reporting";

/** "Tue 19 Aug 2026" — the day, since that is the answer being given. */
const dayLabel = (iso: string) =>
  format(parse(iso, "yyyy-MM-dd", new Date()), "EEE d MMM yyyy");

/**
 * When a tag was last used, and every time before that.
 *
 * The tags are the user's goals, so this is "when did I last touch this goal".
 * It reads `timeBlocks` and priority rows and answers with dates, which is why
 * it is not part of text search: that reads prose and answers with passages.
 *
 * Every entry carries its **name** beside its swatch. Several pairs in this
 * palette are one colour to a deuteranope and all of them are grey in a mono
 * print, and the name is the thing being tracked.
 */
const TagHistoryPanel: React.FC<{ onJump: (monday: string) => void }> = ({ onJump }) => {
  const labels = React.useMemo(() => loadColorLabels(), []);
  const [colorId, setColorId] = React.useState<number | null>(null);

  // Recomputed on selection rather than held: weeks may have changed since the
  // dialog was last opened, including from another tab.
  const uses = React.useMemo<TagUse[]>(
    () => (colorId === null ? [] : tagHistory(colorId)),
    [colorId]
  );

  const nameOf = (id: number) => labels[id] || BLOCK_COLORS[id - 1]?.label || `Tag ${id}`;

  return (
    <>
      <ul className="flex flex-wrap gap-1">
        {COLOR_IDS_IN_DISPLAY_ORDER.map((id) => (
          <li key={id}>
            <button
              type="button"
              aria-pressed={colorId === id}
              onClick={() => setColorId(id)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] transition-colors ${
                colorId === id
                  ? "border-foreground/40 bg-muted/60 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm border border-border/50 shrink-0"
                style={{ backgroundColor: getBlockColor(id) ?? undefined }}
              />
              {nameOf(id)}
            </button>
          </li>
        ))}
      </ul>

      <div className="max-h-80 overflow-y-auto -mx-1 px-1">
        {colorId === null ? (
          <p className="text-xs text-muted-foreground py-2">Pick a tag.</p>
        ) : uses.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No time blocked or priorities tagged {nameOf(colorId)}.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {uses.map((u) => (
              <li key={`${u.weekKey}-${u.date}`}>
                <button
                  type="button"
                  onClick={() => onJump(u.monday)}
                  className="w-full flex items-baseline justify-between gap-3 text-left px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm text-foreground">{dayLabel(u.date)}</span>
                  {/* A priority row carries no minutes, and 0m would be a lie
                      about the time rather than a statement about the day. */}
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {u.minutes > 0 ? formatMinutes(u.minutes) : "on priorities"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};

export default TagHistoryPanel;
