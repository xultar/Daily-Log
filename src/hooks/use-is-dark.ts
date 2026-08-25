import { useState, useEffect } from "react";

/**
 * Whether the OS prefers a dark colour scheme. Note this is NOT the same as the
 * app being in dark mode: tailwind.config.ts sets darkMode: ["class"] but nothing
 * ever applies the class, so the chrome stays light while the palette flips. That
 * mismatch is pre-existing and tracked separately.
 */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof window !== "undefined" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isDark;
}
