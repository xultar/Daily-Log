import React, { useRef } from "react";
import { THEMES, useTheme } from "@/lib/theme-context";
import { exportAsJSON, exportAsCSV, importFromJSON, downloadFile } from "@/lib/export-import";
import { Download, Upload, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";

const ToolbarActions: React.FC<{ onDataImported: () => void }> = ({ onDataImported }) => {
  const { theme, setTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJSON = () => {
    downloadFile(exportAsJSON(), `daily-log-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
    toast({ title: "Exported as JSON" });
  };

  const handleExportCSV = () => {
    downloadFile(exportAsCSV(), `daily-log-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv");
    toast({ title: "Exported as CSV" });
  };

  const handleImport = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importFromJSON(reader.result as string);
      if (result.success) {
        const skipped = result.weeksSkipped ? `, ${result.weeksSkipped} skipped` : "";
        toast({ title: `Imported ${result.weeksImported} week(s)${skipped}` });
        onDataImported();
      } else {
        toast({ title: "Import failed", description: result.error, variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="flex items-center gap-1">
      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />

      {/* Theme picker */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Palette className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="text-[10px]">Theme</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {THEMES.map((t) => (
            <DropdownMenuItem
              key={t.id}
              onClick={() => setTheme(t.id)}
              className="text-xs gap-2"
            >
              <div
                className="w-3 h-3 rounded-full border border-border shrink-0"
                style={{ backgroundColor: `hsl(${t.campusFilled})` }}
              />
              {t.name}
              {t.id === theme.id && <span className="ml-auto text-[10px]">✓</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Export */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Download className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="text-[10px]">Export</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleExportJSON} className="text-xs">Export as JSON</DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportCSV} className="text-xs">Export as CSV</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Import */}
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleImport}>
        <Upload className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

export default ToolbarActions;
