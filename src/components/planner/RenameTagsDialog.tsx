import React, { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getPaletteInDisplayOrder } from "@/lib/planner-data";

/**
 * Rename every colour tag in one place.
 *
 * The weekly strip is a horizontal scroller of twelve entries at 10px text,
 * so the day view's answer — a permanent field beside each swatch — does not
 * transfer. A dialog adds one control to the strip instead of twelve, and
 * gives the fields room the strip does not have.
 *
 * **Renaming only; arming stays in the strip.** That is what keeps a row free
 * of buttons, so the nested-interactive defect the day view's legend once
 * shipped is impossible here rather than guarded against.
 *
 * Holds no label state. Editing calls `onRename` straight through, so the
 * strip behind updates as the user types and there is no draft to lose.
 */
const RenameTagsDialog: React.FC<{
  labels: Record<number, string>;
  onRename: (id: number, value: string) => void;
}> = ({ labels, onRename }) => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 mr-2"
          aria-label="Rename colour tags"
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-sm">Rename colour tags</DialogTitle>
          <DialogDescription className="text-xs">
            Clear a name to go back to its default.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-1">
          {getPaletteInDisplayOrder().map((c, index) => (
            <li key={c.id} className="flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-sm border border-border/50 shrink-0"
                style={{ backgroundColor: `hsl(var(--tag-${c.id}))` }}
              />
              {/* Display position, never the storage id. The two differ for
                  four of the twelve, and this is the number the keyboard
                  shortcuts actually select. */}
              <span className="text-[10px] font-medium text-foreground/50 w-3 shrink-0">
                {index + 1}
              </span>
              <input
                type="text"
                value={labels[c.id] ?? ""}
                onChange={(e) => onRename(c.id, e.target.value)}
                aria-label={`Rename ${labels[c.id] || c.label}`}
                placeholder={c.label}
                className="flex-1 text-xs bg-transparent border border-border rounded px-1.5 py-1 outline-none text-foreground placeholder:text-muted-foreground/40"
              />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
};

export default RenameTagsDialog;
