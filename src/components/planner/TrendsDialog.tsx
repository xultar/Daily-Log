import React, { useMemo, useState } from "react";
import { format, parse } from "date-fns";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  BLOCK_COLORS,
  formatMinutes,
  getBlockColor,
  loadColorLabels,
} from "@/lib/planner-data";
import { Trends, trendsByMonth } from "@/lib/reporting";

/** A rolling year. Twelve columns fit at dialog width without crowding. */
const MONTHS_SHOWN = 12;

const monthDate = (key: string) => parse(key, "yyyy-MM", new Date());

/**
 * How time against each tag moves across the last twelve months.
 *
 * One row per tag, one bar per month, **scaled to that row's own busiest
 * month**. A single global scale would flatten a tag used an hour a week into
 * a row of stubs, hiding exactly the trend this exists to show. What per-row
 * scaling hides — magnitude — is printed at the end of the row instead.
 *
 * Hand-drawn, as `TimeByTag` is. `recharts` earns its weight for axes,
 * tooltips, zoom or real time series, and this has none of the four; importing
 * it measured at +102 kB gzipped against 0.5 kB for bars.
 *
 * A table rather than divs: `scope="col"` and `scope="row"` name the month and
 * the tag for every cell, which 144 individually labelled divs would do worse.
 */
const TrendsDialog: React.FC = () => {
  const [open, setOpen] = useState(false);

  // Recomputed when the dialog opens rather than held: weeks and labels may
  // have changed since it was last closed, including from another tab.
  const labels = useMemo(() => (open ? loadColorLabels() : {}), [open]);
  const trends = useMemo<Trends | null>(
    () => (open ? trendsByMonth(new Date(), MONTHS_SHOWN) : null),
    [open]
  );

  const span =
    trends === null
      ? ""
      : `${format(monthDate(trends.months[0]), "LLL yyyy")} – ${format(
          monthDate(trends.months[trends.months.length - 1]),
          "LLL yyyy"
        )}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          // Deliberately does not contain "month": the view switcher's Month
          // button is found by name in carry-bar.test.tsx, and two buttons
          // matching there breaks a file unrelated to this feature.
          aria-label="Trends by tag"
        >
          <BarChart3 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Time across months</DialogTitle>
          <DialogDescription className="text-xs">{span}</DialogDescription>
        </DialogHeader>

        {trends === null || trends.tags.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No time blocked in the last twelve months.
          </p>
        ) : (
          <table className="w-full text-[10px]">
            <thead>
              <tr>
                <th className="font-normal" />
                {trends.months.map((m) => (
                  <th key={m} scope="col" className="font-medium text-muted-foreground px-px">
                    {/* Twelve initials contain three Js and two each of M and
                        A, so the letter is a position marker and the month
                        name is the fact. */}
                    <span aria-hidden="true">{format(monthDate(m), "LLLLL")}</span>
                    <span className="sr-only">{format(monthDate(m), "LLLL yyyy")}</span>
                  </th>
                ))}
                <th scope="col" className="font-medium text-muted-foreground text-right pl-2">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {trends.tags.map((tag) => {
                // Never zero: a tag only has a row when its total is above
                // zero, so at least one month is. No guard needed, and adding
                // one would silently change the scale if that rule loosened.
                const rowMax = Math.max(...tag.months);
                const name = labels[tag.colorId] || BLOCK_COLORS[tag.colorId - 1]?.label;
                return (
                  <tr key={tag.colorId}>
                    <th scope="row" className="font-normal text-left py-0.5 pr-2">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-sm border border-border/50 shrink-0"
                          style={{ backgroundColor: getBlockColor(tag.colorId) ?? undefined }}
                        />
                        {/* The name, not just the swatch: several pairs here
                            are one colour to a deuteranope, and every bar is
                            grey in a mono print. */}
                        <span className="truncate max-w-[5rem] text-foreground">{name}</span>
                      </span>
                    </th>
                    {tag.months.map((minutes, i) => (
                      <td key={trends.months[i]} className="px-px align-bottom">
                        <span className="flex h-6 w-3 items-end rounded-sm bg-muted/30 overflow-hidden">
                          {minutes > 0 && (
                            <span
                              className="block w-full rounded-sm"
                              style={{
                                height: `${(minutes / rowMax) * 100}%`,
                                backgroundColor: getBlockColor(tag.colorId) ?? undefined,
                              }}
                            />
                          )}
                        </span>
                        {minutes > 0 && <span className="sr-only">{formatMinutes(minutes)}</span>}
                      </td>
                    ))}
                    <td className="text-right tabular-nums text-muted-foreground pl-2">
                      {formatMinutes(tag.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TrendsDialog;
