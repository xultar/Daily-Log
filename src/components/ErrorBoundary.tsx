import React from "react";
import { exportAsJSON, downloadFile } from "@/lib/export-import";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render-phase throw and shows a way out instead of a blank page.
 *
 * This matters more here than in a typical app: the data lives only in this
 * browser's localStorage, so a crash caused by stored data reproduces on every
 * reload, and there is no server-side copy to fall back on. The fallback
 * therefore offers a backup download as well as a reload — while the app is
 * down, it is the only route to the user's own data.
 *
 * Note this catches rendering, lifecycle and constructor errors only. Throws
 * inside event handlers do not reach it; React 18 leaves those to window.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Daily Log stopped rendering:", error, info.componentStack);
  }

  private saveBackup = () => {
    try {
      downloadFile(
        exportAsJSON(),
        `daily-log-backup-${new Date().toISOString().slice(0, 10)}.json`,
        "application/json"
      );
    } catch {
      // Storage itself is unreadable, so there is nothing to hand over. The
      // fallback stays on screen rather than throwing on top of a crash.
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        className="min-h-screen flex items-center justify-center bg-background p-6"
      >
        <div className="max-w-md w-full border border-border rounded-lg p-5">
          <h1 className="text-lg font-semibold text-foreground mb-2">
            The planner stopped rendering
          </h1>
          <p className="text-sm text-muted-foreground mb-3">
            Your weeks are still saved in this browser. Download a backup before
            anything else — it is the surest way to keep them.
          </p>
          <pre className="text-[11px] bg-muted/50 rounded p-2 mb-4 overflow-x-auto text-foreground">
            {error.message || String(error)}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={this.saveBackup}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors text-foreground"
            >
              Download a backup
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
