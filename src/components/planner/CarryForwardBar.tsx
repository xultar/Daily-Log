import React, { useId, useState } from "react";
import { CarryCandidate, carriedWeeks } from "@/lib/planner-data";
import { CornerDownRight } from "lucide-react";
import AgeMarker from "./AgeMarker";

interface CarryForwardBarProps {
  candidates: CarryCandidate[];
  /** ISO Monday of the week being viewed, for the age calculation. */
  mondayISO: string;
  onBring: (chosen: CarryCandidate[]) => void;
  onDismiss: () => void;
}

/**
 * The review moment. Everything is ticked to begin with, so bringing the lot
 * forward is one click — but unticking is the same gesture as keeping, which is
 * what stops the list growing into a wall of things the user has silently
 * decided not to do.
 *
 * State tracks what got unticked rather than what's chosen, so "everything
 * ticked" is simply an empty set on mount — there is nothing to seed from
 * `candidates` and nothing to keep in sync with it afterwards.
 *
 * The tick state is keyed by position, so a parent must remount this bar
 * rather than swap `candidates` in place — otherwise an outstanding untick
 * stays glued to the index rather than the item.
 *
 * Purely presentational: it reports the chosen subset and never touches storage.
 */
const CarryForwardBar: React.FC<CarryForwardBarProps> = ({
  candidates,
  mondayISO,
  onBring,
  onDismiss,
}) => {
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const headingId = useId();

  const toggle = (idx: number) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const chosen = candidates.filter((_, i) => !excluded.has(i));

  return (
    <div className="no-print border-b border-border bg-accent/20 px-3 py-1.5 shrink-0">
      {/* The id names the whole sentence, not just the count. On the <strong>
          alone a screen reader announces "group, 3 items" — a number with no
          noun, which is the half of the context this labelling exists to give.
          The icon contributes nothing to name-from-content. */}
      <div id={headingId} className="flex items-center gap-1.5 text-[10px] text-foreground mb-1">
        <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        <strong>
          {candidates.length} item{candidates.length === 1 ? "" : "s"}
        </strong>
        <span className="text-muted-foreground">unfinished from last week</span>
      </div>
      <div
        role="group"
        aria-labelledby={headingId}
        className="flex flex-wrap gap-x-4 gap-y-0.5 mb-1.5 max-h-24 overflow-y-auto"
      >
        {candidates.map((c, i) => {
          const age = carriedWeeks(c.origin, mondayISO);
          return (
            <label key={i} className="flex items-center gap-1 text-[10px] cursor-pointer">
              <input
                type="checkbox"
                checked={!excluded.has(i)}
                onChange={() => toggle(i)}
                className="h-3 w-3 shrink-0 accent-campus-blue-dark"
              />
              <span className="text-foreground">{c.text}</span>
              <AgeMarker age={age} className="text-muted-foreground tabular-nums" />
            </label>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onBring(chosen)}
          className="text-[10px] px-2 py-0.5 rounded bg-campus-blue-dark text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Bring {chosen.length} forward
        </button>
        <button
          onClick={onDismiss}
          className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
};

export default CarryForwardBar;
