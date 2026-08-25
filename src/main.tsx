import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { migrateWeekKeys } from "./lib/planner-data";
import { buildTagPaletteCss, installGeneratedCss } from "./lib/tag-palette";
import "./index.css";

// Before anything reads a week: refile any that the old getWeekKey misplaced.
// Safe to run on every start, and it never throws.
migrateWeekKeys();

// Before the first paint, not in an effect: effects run after paint, so
// installing this from React would show one frame of unpainted blocks. The
// tag palette never changes, so installing it once here is enough — the theme
// provider replaces this sheet with tags plus accent once it mounts.
installGeneratedCss(buildTagPaletteCss());

createRoot(document.getElementById("root")!).render(<App />);
