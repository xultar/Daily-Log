import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { migrateWeekKeys } from "./lib/planner-data";
import "./index.css";

// Before anything reads a week: refile any that the old getWeekKey misplaced.
// Safe to run on every start, and it never throws.
migrateWeekKeys();

createRoot(document.getElementById("root")!).render(<App />);
