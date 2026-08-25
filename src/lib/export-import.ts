import { WeekData, weekKeyForStoredWeek, weekKeyFromEntryKey } from "./planner-data";
import { readItem, writeItem, listKeys } from "./storage";

export interface ExportData {
  version: 1;
  exportedAt: string;
  weeks: Record<string, WeekData>;
}

export function exportAllData(): ExportData {
  const weeks: Record<string, WeekData> = {};
  for (const key of listKeys()) {
    // Match the entry shape, not the prefix: planner-show-weekends and
    // planner-color-labels are settings, and collecting them here exported them
    // as weeks and then broke exportAsCSV on the first one it reached.
    const weekKey = weekKeyFromEntryKey(key);
    if (!weekKey) continue;
    const raw = readItem(key);
    if (raw === null) continue;
    try {
      weeks[weekKey] = JSON.parse(raw);
    } catch {
      // Ignore entries that are not valid JSON
    }
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    weeks,
  };
}

export function exportAsJSON(): string {
  return JSON.stringify(exportAllData(), null, 2);
}

/** A CSV field: always quoted, with embedded quotes doubled per RFC 4180. */
function csvField(value: unknown): string {
  return `"${typeof value === "string" ? value.replace(/"/g, '""') : ""}"`;
}

export function exportAsCSV(): string {
  const data = exportAllData();
  const rows: string[] = ["Week,Day,Date,Subject,Checked,StudyMinutes,Memo"];

  // Weeks are read straight from storage rather than through repairWeek, so
  // every field here is shape-checked: an export must not be the one action a
  // damaged week can still break.
  for (const [weekKey, week] of Object.entries(data.weeks)) {
    const days = Array.isArray(week?.days) ? week.days : [];
    for (const day of days) {
      if (!day || typeof day !== "object") continue;

      let totalMin = 0;
      const hours = Array.isArray(day.timeBlocks) ? day.timeBlocks : [];
      for (const hourBlocks of hours) {
        if (!Array.isArray(hourBlocks)) continue;
        for (const b of hourBlocks) if (b) totalMin += 10;
      }

      const row = (subject: unknown, checked: unknown) =>
        [
          csvField(weekKey),
          csvField(day.date),
          csvField(day.date),
          csvField(subject),
          checked === true,
          totalMin,
          csvField(day.memo),
        ].join(",");

      const subjects = Array.isArray(day.subjects) ? day.subjects : [];
      const named = subjects.filter((s) => s && typeof s.subject === "string" && s.subject);
      if (named.length > 0) {
        for (const sub of named) rows.push(row(sub.subject, sub.checked));
      } else {
        rows.push(row("", false));
      }
    }
  }
  return rows.join("\n");
}

export interface ImportResult {
  success: boolean;
  weeksImported: number;
  weeksSkipped: number;
  error?: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Restore weeks from an export file.
 *
 * Import writes into the only copy of the user's data, so the whole file is
 * checked before any of it lands: a file that turns out to be unusable leaves
 * storage exactly as it was, rather than half replaced.
 *
 * A week is usable only when its own days say which week it is. That is the
 * same rule the storage key follows, and it doubles as the shape check —
 * anything that is not really a week carries no readable date, so it cannot
 * displace a real one. It also means the key always comes from the data, so a
 * backup written before the week-key fix is refiled rather than restored under
 * its old, colliding key.
 */
export function importFromJSON(jsonString: string): ImportResult {
  const refuse = (error: string, weeksSkipped = 0): ImportResult => ({
    success: false,
    weeksImported: 0,
    weeksSkipped,
    error,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return refuse("That file is not valid JSON.");
  }

  if (!isPlainObject(parsed)) return refuse("That file is not a Daily Log export.");
  if (parsed.version !== 1) return refuse("That file was written by an unsupported version.");
  if (!isPlainObject(parsed.weeks)) return refuse("That file contains no weeks.");

  const staged: [string, unknown][] = [];
  let skipped = 0;
  for (const week of Object.values(parsed.weeks)) {
    const key = weekKeyForStoredWeek(week);
    if (!key) {
      skipped++;
      continue;
    }
    staged.push([key, week]);
  }

  if (staged.length === 0) return refuse("That file contains no usable weeks.", skipped);

  let written = 0;
  for (const [key, week] of staged) {
    if (writeItem(`planner-${key}`, JSON.stringify(week))) written++;
  }
  if (written < staged.length) {
    return {
      success: false,
      weeksImported: written,
      weeksSkipped: skipped,
      error: `Storage is full or unavailable \u2014 only ${written} of ${staged.length} weeks could be saved.`,
    };
  }
  return { success: true, weeksImported: written, weeksSkipped: skipped };
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
