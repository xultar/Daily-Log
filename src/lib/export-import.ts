import {
  BLOCK_COLORS,
  WeekData,
  loadAllWeeks,
  loadColorLabels,
  saveColorLabels,
  weekKeyForStoredWeek,
} from "./planner-data";
import { writeItem } from "./storage";
import { isMonthKey, loadAllMonthNotes, saveMonthNote } from "./month-notes";

/**
 * What travels besides the weeks. Colour labels only: they are the one piece of
 * user-typed content that does not live inside a week. Whether weekends are
 * showing, and which theme is on, are properties of a device rather than of the
 * data, and restoring last month's planning should not repaint the app.
 */
export interface ExportSettings {
  /** Keyed by storage id, never display position — as planner-color-labels is. */
  colorLabels: Record<number, string>;
}

export interface ExportData {
  version: 2;
  exportedAt: string;
  weeks: Record<string, WeekData>;
  /**
   * Keyed "yyyy-MM". A month with no note is absent, never an empty string.
   *
   * A sibling of `weeks` rather than a member of `settings`, because it is
   * content: `settings` is what travels *besides* the weeks, and the colour
   * labels are there because they are the mapping the stored numbers are read
   * through, not because they are prose.
   */
  monthNotes: Record<string, string>;
  settings: ExportSettings;
}

/**
 * Versions this build can read. Writing is always the newest.
 *
 * Adding `monthNotes` deliberately did not move the number. Bumping to 3 would
 * make a backup written today refused outright by an older cached build, losing
 * the weeks as well as the notes; leaving it at 2 lets that build restore the
 * weeks and the labels and silently drop the notes. Both lose something and the
 * smaller loss was chosen — but the reasoning should be revisited rather than
 * inherited if a third stored shape is ever added, because the unversioned
 * surface grows with each one.
 */
const READABLE_VERSIONS = [1, 2];

export function exportAllData(): ExportData {
  // Matching the entry shape rather than the prefix is what stopped
  // planner-show-weekends and planner-color-labels being exported as weeks and
  // killing exportAsCSV on the first one it reached. That rule now lives in
  // loadAllWeeks, so search does not have to reimplement it.
  const weeks = loadAllWeeks() as Record<string, WeekData>;
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    weeks,
    // Written unconditionally, like settings: an empty object and an absent one
    // mean the same thing on read, and writing it always keeps the shape of an
    // export predictable.
    monthNotes: loadAllMonthNotes(),
    // Always present, even when nothing is labelled. An empty object and an
    // absent one mean the same thing on read, and writing it unconditionally
    // keeps the shape of an export predictable.
    settings: { colorLabels: loadColorLabels() },
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
  if (!READABLE_VERSIONS.includes(parsed.version as number)) {
    return refuse("That file was written by an unsupported version.");
  }
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
  // After the weeks, deliberately. The weeks are what the user came for, so a
  // label write that fails on full storage must not turn a restore that
  // restored everything important into a failure.
  const labels = usableLabels(isPlainObject(parsed.settings) ? parsed.settings.colorLabels : null);
  if (Object.keys(labels).length > 0) {
    // Merged by id, exactly as the weeks above are merged by key: what the file
    // names is overwritten, what it does not name is left alone. A file that
    // mentions no labels is not an instruction to delete them.
    saveColorLabels({ ...loadColorLabels(), ...labels });
  }

  return { success: true, weeksImported: written, weeksSkipped: skipped };
}

/**
 * The labels from an untrusted file, minus anything unusable.
 *
 * `loadColorLabels` does no shape checking of its own — it returns whatever
 * `JSON.parse` produced — so whatever passes through here is handed straight to
 * the legend. A key must name a colour that exists, and a label must be text.
 */
function usableLabels(value: unknown): Record<number, string> {
  if (!isPlainObject(value)) return {};
  const out: Record<number, string> = {};
  for (const [key, label] of Object.entries(value)) {
    if (typeof label !== "string") continue;
    if (!/^\d+$/.test(key)) continue;
    const id = Number(key);
    if (id < 1 || id > BLOCK_COLORS.length) continue;
    out[id] = label;
  }
  return out;
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
