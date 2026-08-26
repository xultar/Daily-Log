import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // 15s, against a 5s default. Several tests render the whole app and click
    // through it, and they sit at 3-4s alone — 60-70% of the default budget.
    // Under full-suite contention they cross it: today.test.tsx timed out at
    // 5597ms on a run where the identical code passed minutes earlier.
    //
    // This was first scoped to one test on the theory that only it was exposed,
    // which was wrong. The exposure is a class of whole-app tests, not one, so
    // the ceiling belongs here where one number covers all of them.
    //
    // It matters more than it looks: npm test gates the deploy, so a
    // load-dependent timeout stops a release for no real reason.
    testTimeout: 15000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
