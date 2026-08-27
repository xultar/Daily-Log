import React, { useMemo, useState } from "react";
import { addDays, format, parse } from "date-fns";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { WeekData } from "@/lib/planner-data";
import { findTemplateSource, previewTemplate } from "@/lib/week-template";

/** "17 – 23 Aug 2026", from a Monday. */
function weekLabel(monday: string): string {
  const start = parse(monday, "yyyy-MM-dd", new Date());
  return `${format(start, "d")} – ${format(addDays(start, 6), "d MMM yyyy")}`;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * Copy the shape of the most recent painted week into the week on screen.
 *
 * The counts come from `previewTemplate`, which runs the same pass that
 * applying will run, so what this says is what will happen.
 *
 * Nothing here can overwrite: applying fills empty slots only. That is why
 * this is a preview rather than a warning, and why there is no undo.
 */
const TemplateDialog: React.FC<{
  week: WeekData;
  weekDate: Date;
  onApply: (source: WeekData) => void;
}> = ({ week, weekDate, onApply }) => {
  const [open, setOpen] = useState(false);

  // Computed when the dialog opens rather than held: weeks may have changed
  // since it was last closed, including from another tab.
  const source = useMemo(() => (open ? findTemplateSource(weekDate) : null), [open, weekDate]);
  const preview = useMemo(
    () => (open && source ? previewTemplate(week, source.week) : null),
    [open, source, week]
  );

  const nothingToDo = preview !== null && preview.blocksToFill === 0 && preview.rowsToFill === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Copy a week's shape">
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Copy a week's shape</DialogTitle>
          <DialogDescription className="text-xs">
            {source ? `From ${weekLabel(source.monday)}` : "Nothing to copy."}
          </DialogDescription>
        </DialogHeader>

        {!source ? (
          <p className="text-xs text-muted-foreground">
            No week in the last four has anything painted in it.
          </p>
        ) : nothingToDo ? (
          <p className="text-xs text-muted-foreground">
            Every slot this template would use already has something in it.
          </p>
        ) : (
          <dl className="text-xs text-muted-foreground flex flex-col gap-1">
            {/* Zero counts are omitted rather than shown, because "0 rows" is
                noise where the absence of the line says the same thing. */}
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-foreground">Will fill</dt>
              <dd>
                {[
                  preview.blocksToFill > 0 && plural(preview.blocksToFill, "empty block"),
                  preview.rowsToFill > 0 && plural(preview.rowsToFill, "empty row"),
                ]
                  .filter(Boolean)
                  .join(", ")}
              </dd>
            </div>
            {preview.blocksKept > 0 && (
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 text-foreground">Will keep</dt>
                <dd>{plural(preview.blocksKept, "painted block")} of yours</dd>
              </div>
            )}
            {preview.rowsDropped > 0 && (
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 text-foreground">Won't land</dt>
                <dd>{plural(preview.rowsDropped, "row")}</dd>
              </div>
            )}
          </dl>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!source || nothingToDo}
            onClick={() => {
              if (!source) return;
              onApply(source.week);
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateDialog;
