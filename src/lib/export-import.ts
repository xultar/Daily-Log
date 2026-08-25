import { WeekData, weekKeyForStoredWeek, weekKeyFromEntryKey } from "./planner-data";

export interface ExportData {
  version: 1;
  exportedAt: string;
  weeks: Record<string, WeekData>;
}

export function exportAllData(): ExportData {
  const weeks: Record<string, WeekData> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    // Match the entry shape, not the prefix: planner-show-weekends and
    // planner-color-labels are settings, and collecting them here exported them
    // as weeks and then broke exportAsCSV on the first one it reached.
    const weekKey = key && weekKeyFromEntryKey(key);
    if (!weekKey) continue;
    try {
      weeks[weekKey] = JSON.parse(localStorage.getItem(key)!);
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

export function importFromJSON(jsonString: string): { success: boolean; weeksImported: number; error?: string } {
  try {
    const data: ExportData = JSON.parse(jsonString);
    if (data.version !== 1 || !data.weeks) {
      return { success: false, weeksImported: 0, error: "Invalid format" };
    }
    let count = 0;
    for (const [weekKey, weekData] of Object.entries(data.weeks)) {
      // A backup written before the week-key fix carries the old, colliding key.
      // The week's own dates say where it belongs; fall back to the file's key
      // only when it carries no readable date.
      const key = weekKeyForStoredWeek(weekData) ?? weekKey;
      localStorage.setItem(`planner-${key}`, JSON.stringify(weekData));
      count++;
    }
    return { success: true, weeksImported: count };
  } catch (e) {
    return { success: false, weeksImported: 0, error: "Failed to parse JSON" };
  }
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
