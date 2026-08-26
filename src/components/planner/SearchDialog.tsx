import React, { useMemo, useState } from "react";
import { addDays, format, parse } from "date-fns";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SearchField, SearchMatch, searchWeeks } from "@/lib/search";

/** What a result row calls the field it matched. */
const FIELD_LABEL: Record<SearchField, string> = {
  goal: "Goal",
  review: "Review",
  action: "Weekly action",
  priority: "Priority",
  memo: "Memo",
};

/** "24 – 30 Aug 2026", from the Monday a match reported. */
function weekLabel(monday: string): string {
  const start = parse(monday, "yyyy-MM-dd", new Date());
  const end = addDays(start, 6);
  return `${format(start, "d")} – ${format(end, "d MMM yyyy")}`;
}

const dayName = (monday: string, dayIndex: number) =>
  format(addDays(parse(monday, "yyyy-MM-dd", new Date()), dayIndex), "EEEE");

/**
 * Search across every stored week.
 *
 * Deliberately a real `Dialog`. `TimeGrid`'s keydown handler ignores keys when
 * focus sits inside `[role="dialog"]`, so a query containing digits does not
 * repaint the grid behind it — the guard that exists for Radix menus pays for
 * itself here.
 *
 * Results are not capped. A cap reads as "that is everything" when it is not,
 * and the list scrolls.
 */
const SearchDialog: React.FC<{ onJump: (monday: string) => void }> = ({ onJump }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Recomputed when the dialog opens as well as on every keystroke: weeks may
  // have changed since it was last closed, including from another tab.
  const matches = useMemo<SearchMatch[]>(
    () => (open ? searchWeeks(query) : []),
    [query, open]
  );

  const jump = (monday: string) => {
    onJump(monday);
    setOpen(false);
    setQuery("");
  };

  const tooShort = query.trim().length < 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Search all weeks">
          <Search className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Search all weeks</DialogTitle>
          <DialogDescription className="text-xs">
            Goals, reviews, weekly actions, priorities and memos.
          </DialogDescription>
        </DialogHeader>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search all weeks"
          placeholder="Search…"
          autoFocus
          className="w-full text-sm bg-transparent border border-border rounded-md px-2 py-1.5 outline-none text-foreground placeholder:text-muted-foreground/50"
        />

        <div className="max-h-80 overflow-y-auto -mx-1 px-1">
          {tooShort ? (
            <p className="text-xs text-muted-foreground py-2">
              Type at least two characters.
            </p>
          ) : matches.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No matches.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {matches.map((m, i) => (
                <li key={`${m.weekKey}-${m.field}-${m.dayIndex ?? ""}-${i}`}>
                  <button
                    type="button"
                    onClick={() => jump(m.monday)}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
                  >
                    <span className="block text-sm text-foreground">{m.snippet}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {weekLabel(m.monday)} · {FIELD_LABEL[m.field]}
                      {m.dayIndex === undefined ? "" : ` · ${dayName(m.monday, m.dayIndex)}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SearchDialog;
