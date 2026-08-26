import React from "react";
import { RefreshCw } from "lucide-react";

interface CrossTabNoticeProps {
  onReload: () => void;
  onKeepMine: () => void;
}

/**
 * Shown when another tab wrote the week on screen while this tab had edited it.
 *
 * The wording is about the other tab, not about unsaved changes. dirtyRef means
 * "edited since loaded" and is never cleared by a successful write, so this bar
 * can appear when everything local is already stored — and that tab is exactly
 * the one whose work the other tab may have just overwritten.
 *
 * Purely presentational. The decision about what Reload actually does, and the
 * ordering it depends on, lives in StudyPlanner.
 */
const CrossTabNotice: React.FC<CrossTabNoticeProps> = ({ onReload, onKeepMine }) => (
  <div className="no-print flex items-center gap-2 border-b border-border bg-destructive/15 px-3 py-1.5 shrink-0">
    <RefreshCw className="h-3 w-3 shrink-0 text-muted-foreground" />
    <span className="text-[10px] text-foreground">This week was changed in another tab.</span>
    <span className="ml-auto flex gap-2">
      <button
        onClick={onReload}
        className="text-[10px] px-2 py-0.5 rounded bg-campus-blue-dark text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Reload
      </button>
      <button
        onClick={onKeepMine}
        className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        Keep mine
      </button>
    </span>
  </div>
);

export default CrossTabNotice;
