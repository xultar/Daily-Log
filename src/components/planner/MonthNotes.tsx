import React, { useLayoutEffect, useRef, useState } from "react";
import { loadMonthNote, monthLabel, saveMonthNote } from "@/lib/month-notes";
import { toast } from "@/hooks/use-toast";

interface MonthNotesProps {
  /**
   * "yyyy-MM". The caller passes this as `key` as well, which is what reseeds
   * the field when the user pages to another month.
   */
  monthKey: string;
}

/**
 * What the user made of the month, under the evidence for it.
 *
 * **Nothing here reads storage from an effect.** The initial value comes from a
 * lazy `useState` initialiser and a change of month remounts the component via
 * its `key`, exactly as the carry bar does with `key={monday}`. An effect that
 * seeds state from storage is one edit away from an effect that writes it back,
 * which is how `DailyView` once overwrote every colour label it had just read.
 *
 * Saving is not debounced. One short string under its own key is a cheap write,
 * and paying for it outright removes the entire `pendingRef` problem — there is
 * no timer to flush on unmount, on leaving the month, or on `pagehide`, and so
 * no way for the last sentence typed to be the one lost.
 */
const MonthNotes: React.FC<MonthNotesProps> = ({ monthKey }) => {
  const [text, setText] = useState(() => loadMonthNote(monthKey));
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Whether the last write was refused. A storage failure persists, so warning
  // on every keystroke would bury the message under itself; warn on the
  // transition into failure instead, and again if it recurs after recovering.
  // The same rule, ref and wording as StudyPlanner.flushPendingSave.
  const saveFailedRef = useRef(false);

  // Grow to fit the text.
  //
  // **This is not the mount-write pattern and must not be deleted as if it
  // were.** That rule is about effects which *persist state*; this one measures
  // a DOM node and sets a DOM property, and persists nothing.
  //
  // It is also load-bearing rather than cosmetic. The print block resets
  // overflow on the `.overflow-*` utility classes, but a textarea scrolls by its
  // own nature rather than through those, so a fixed-height one prints only the
  // lines that happen to be in view and silently drops the rest.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // `scrollHeight` alone is one border too short. The box is border-box —
    // Tailwind's default — so `height` covers the borders as well as the
    // content, and setting it to the content height leaves the field
    // permanently unable to show its own last line. On screen that is an
    // invisible one pixel; on paper it shaves the descenders off the final row,
    // which is precisely what this effect exists to prevent.
    //
    // `offsetHeight - clientHeight` is the vertical border, measured rather
    // than assumed, so a change to the border width in the class list below
    // cannot quietly reintroduce the clipping.
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + border}px`;
  }, [text]);

  const change = (value: string) => {
    setText(value);
    const saved = saveMonthNote(monthKey, value);
    if (!saved && !saveFailedRef.current) {
      toast({
        title: "Your notes are not being saved",
        description:
          "This browser's storage is full or unavailable. Export a backup before closing the tab.",
        variant: "destructive",
      });
    }
    saveFailedRef.current = !saved;
  };

  return (
    // An empty month prints nothing at all. A blank frame under the tag bars
    // reads as something that failed to load, which is what TimeByTag returning
    // null already avoids for itself.
    <div className={`mt-6 ${text.trim() === "" ? "no-print" : ""}`}>
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Notes and reflections
      </h3>
      <textarea
        ref={areaRef}
        value={text}
        onChange={(e) => change(e.target.value)}
        aria-label={`Notes and reflections for ${monthLabel(monthKey)}`}
        placeholder="What went well this month? What would you change?"
        rows={3}
        className="w-full resize-none overflow-hidden text-xs bg-transparent border border-border rounded-md px-2 py-1.5 outline-none text-foreground placeholder:text-muted-foreground/50"
      />
    </div>
  );
};

export default MonthNotes;
