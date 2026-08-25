import { WeekData, getWeekKey, loadWeek, createEmptyWeek } from "./planner-data";
import { startOfWeek, addWeeks, format } from "date-fns";

export interface ExportData {
  version: 1;
  exportedAt: string;
  weeks: Record<string, WeekData>;
}

export function exportAllData(): ExportData {
  const weeks: Record<string, WeekData> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("planner-") && !key.includes("theme")) {
      try {
        const weekKey = key.replace("planner-", "");
        weeks[weekKey] = JSON.parse(localStorage.getItem(key)!);
      } catch {
        // Ignore entries that are not valid JSON
      }
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

export function exportAsCSV(): string {
  const data = exportAllData();
  const rows: string[] = ["Week,Day,Date,Subject,Checked,StudyMinutes,Memo"];

  for (const [weekKey, week] of Object.entries(data.weeks)) {
    for (const day of week.days) {
      let totalMin = 0;
      for (const hourBlocks of day.timeBlocks) {
        for (const b of hourBlocks) if (b) totalMin += 10;
      }
      for (const sub of day.subjects) {
        if (sub.subject) {
          rows.push(
            `"${weekKey}","${day.date}","${day.date}","${sub.subject.replace(/"/g, '""')}",${sub.checked},${totalMin},"${day.memo.replace(/"/g, '""')}"`
          );
        }
      }
      if (!day.subjects.some((s) => s.subject)) {
        rows.push(`"${weekKey}","${day.date}","${day.date}","",false,${totalMin},"${day.memo.replace(/"/g, '""')}"`);
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
      localStorage.setItem(`planner-${weekKey}`, JSON.stringify(weekData));
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
