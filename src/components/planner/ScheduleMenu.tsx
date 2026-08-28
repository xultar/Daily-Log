import React from "react";
import { addWeeks, format, parse, isValid } from "date-fns";
import { CalendarClock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { scheduleToWeek } from "@/lib/planner-data";
import { toast } from "@/hooks/use-toast";

/**
 * Weeks ahead the menu offers. Relative rather than a date picker: this planner
 * thinks in weeks, and offsets cannot be pointed at the past or at the week
 * already on screen, so there is no date to validate and no way to schedule
 * backwards.
 */
const OFFSETS = [1, 2, 4, 8];

const labelFor = (weeks: number) => (weeks === 1 ? "Next week" : `In ${weeks} weeks`);

interface ScheduleMenuProps {
  /** ISO Monday of the week being viewed. Offsets are counted from it. */
  mondayISO: string;
  /** The item's text. Nothing renders when it is blank — there is nothing to send. */
  text: string;
  /** Called with the destination's ISO Monday, only once the item has landed. */
  onScheduled: (destinationMonday: string) => void;
  className?: string;
}

/**
 * The Bullet Journal `<`: send an open item to a week you pick.
 *
 * The write happens here and `onScheduled` fires only if it landed, which is
 * what keeps the two halves in the right order. Marking the origin first would
 * leave a week saying an item went somewhere it never arrived.
 *
 * Radix gives the content `role="menu"`, and that is load-bearing rather than
 * incidental: `TimeGrid`'s keydown guard tests for it so an open menu swallows
 * digits. Without it, typing while the menu is open would arm colour tags.
 */
const ScheduleMenu: React.FC<ScheduleMenuProps> = ({ mondayISO, text, onScheduled, className }) => {
  if (text.trim() === "") return null;
  const monday = parse(mondayISO, "yyyy-MM-dd", new Date());
  if (!isValid(monday)) return null;

  const choose = (weeks: number) => {
    const destination = format(addWeeks(monday, weeks), "yyyy-MM-dd");
    if (scheduleToWeek(destination, text)) {
      onScheduled(destination);
      return;
    }
    toast({
      title: "Could not schedule that",
      description: "The week it was going to could not be saved, so nothing moved.",
      variant: "destructive",
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Schedule for a later week"
          title="Schedule for a later week"
          className={`shrink-0 p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors ${className ?? ""}`}
        >
          <CalendarClock className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OFFSETS.map((weeks) => (
          <DropdownMenuItem key={weeks} onClick={() => choose(weeks)} className="text-xs">
            {labelFor(weeks)} · {format(addWeeks(monday, weeks), "d MMM")}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ScheduleMenu;
