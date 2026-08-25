import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { readItem, writeItem } from "./storage";
import { buildTagPaletteCss, buildThemeCss, installGeneratedCss } from "./tag-palette";
import {
  ColorScheme,
  readColorScheme,
  writeColorScheme,
  resolveScheme,
  applySchemeClass,
} from "./color-scheme";

export interface PlannerTheme {
  id: string;
  name: string;
  primary: string;
  primaryForeground: string;
  campusBlue: string;
  campusBlueDark: string;
  campusGrid: string;
  campusFilled: string;
  accent: string;
  /**
   * The same seven values tuned for a dark ground. Every theme needs one:
   * without it, switching to dark would leave headers, grid lines and filled
   * cells showing their light pastels against a near-black background.
   */
  dark: {
    primary: string;
    primaryForeground: string;
    campusBlue: string;
    campusBlueDark: string;
    campusGrid: string;
    campusFilled: string;
    accent: string;
  };
}

export const THEMES: PlannerTheme[] = [
  {
    id: "campus-blue",
    name: "Campus Blue",
    primary: "213 60% 87%",
    primaryForeground: "220 30% 25%",
    campusBlue: "213 60% 87%",
    campusBlueDark: "213 50% 65%",
    campusGrid: "214 30% 90%",
    campusFilled: "213 60% 80%",
    accent: "213 60% 87%",
    dark: {
      primary: "213 45% 32%", primaryForeground: "210 25% 92%",
      campusBlue: "213 45% 32%", campusBlueDark: "213 50% 55%",
      campusGrid: "217 22% 22%", campusFilled: "213 45% 38%", accent: "213 45% 32%",
    },
  },
  {
    id: "sakura-pink",
    name: "Sakura Pink",
    primary: "340 60% 88%",
    primaryForeground: "340 30% 30%",
    campusBlue: "340 60% 88%",
    campusBlueDark: "340 45% 65%",
    campusGrid: "340 25% 92%",
    campusFilled: "340 55% 82%",
    accent: "340 60% 88%",
    dark: {
      primary: "340 40% 34%", primaryForeground: "340 25% 92%",
      campusBlue: "340 40% 34%", campusBlueDark: "340 45% 58%",
      campusGrid: "340 15% 22%", campusFilled: "340 40% 40%", accent: "340 40% 34%",
    },
  },
  {
    id: "matcha-green",
    name: "Matcha Green",
    primary: "140 35% 82%",
    primaryForeground: "140 30% 25%",
    campusBlue: "140 35% 82%",
    campusBlueDark: "140 30% 55%",
    campusGrid: "140 20% 90%",
    campusFilled: "140 35% 75%",
    accent: "140 35% 82%",
    dark: {
      primary: "140 30% 28%", primaryForeground: "140 20% 92%",
      campusBlue: "140 30% 28%", campusBlueDark: "140 30% 48%",
      campusGrid: "140 12% 21%", campusFilled: "140 30% 34%", accent: "140 30% 28%",
    },
  },
  {
    id: "lavender",
    name: "Lavender",
    primary: "270 45% 87%",
    primaryForeground: "270 30% 28%",
    campusBlue: "270 45% 87%",
    campusBlueDark: "270 35% 62%",
    campusGrid: "270 25% 92%",
    campusFilled: "270 40% 80%",
    accent: "270 45% 87%",
    dark: {
      primary: "270 35% 34%", primaryForeground: "270 20% 92%",
      campusBlue: "270 35% 34%", campusBlueDark: "270 35% 56%",
      campusGrid: "270 15% 22%", campusFilled: "270 35% 40%", accent: "270 35% 34%",
    },
  },
  {
    id: "sunset-orange",
    name: "Sunset Orange",
    primary: "25 70% 85%",
    primaryForeground: "25 40% 28%",
    campusBlue: "25 70% 85%",
    campusBlueDark: "25 55% 60%",
    campusGrid: "25 30% 92%",
    campusFilled: "25 65% 78%",
    accent: "25 70% 85%",
    dark: {
      primary: "25 50% 32%", primaryForeground: "25 25% 92%",
      campusBlue: "25 50% 32%", campusBlueDark: "25 55% 52%",
      campusGrid: "25 18% 22%", campusFilled: "25 50% 38%", accent: "25 50% 32%",
    },
  },
  {
    id: "monochrome",
    name: "Monochrome",
    primary: "0 0% 88%",
    primaryForeground: "0 0% 20%",
    campusBlue: "0 0% 88%",
    campusBlueDark: "0 0% 55%",
    campusGrid: "0 0% 92%",
    campusFilled: "0 0% 75%",
    accent: "0 0% 88%",
    dark: {
      primary: "0 0% 30%", primaryForeground: "0 0% 92%",
      campusBlue: "0 0% 30%", campusBlueDark: "0 0% 52%",
      campusGrid: "0 0% 21%", campusFilled: "0 0% 36%", accent: "0 0% 30%",
    },
  },
];

interface ThemeContextValue {
  theme: PlannerTheme;
  setTheme: (themeId: string) => void;
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES[0],
  setTheme: () => {},
  colorScheme: "system",
  setColorScheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<PlannerTheme>(() => {
    const stored = readItem("planner-theme");
    return THEMES.find((t) => t.id === stored) || THEMES[0];
  });

  const setTheme = useCallback((themeId: string) => {
    const found = THEMES.find((t) => t.id === themeId);
    if (found) {
      setThemeState(found);
      writeItem("planner-theme", themeId);
    }
  }, []);

  const [colorScheme, setSchemeState] = useState<ColorScheme>(() => readColorScheme());

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setSchemeState(scheme);
    writeColorScheme(scheme);
  }, []);

  // main.tsx applies the class before the first paint, so this effect is not
  // what makes dark mode appear — it is what keeps it correct afterwards, when
  // the setting changes or, on "system", when the OS does. The listener is
  // only registered while the setting actually follows the OS.
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applySchemeClass(resolveScheme(colorScheme, mql.matches));
    apply();
    if (colorScheme !== "system") return;
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [colorScheme]);

  // One generated stylesheet holds the tag palette and the accent theme, both
  // on the same three-block plan: :root light, .dark dark, @media print light.
  //
  // A stylesheet rather than root.style.setProperty, which is what this used to
  // do. Inline styles on <html> outrank class rules, so the theme's light
  // pastels would have clobbered .dark — dark mode would have applied to
  // backgrounds but not to headers, grid lines or filled cells — and print
  // could not override them without !important on every property.
  useEffect(() => {
    const vars = (t: PlannerTheme | PlannerTheme["dark"]) => ({
      "--primary": t.primary,
      "--primary-foreground": t.primaryForeground,
      "--campus-blue": t.campusBlue,
      "--campus-blue-dark": t.campusBlueDark,
      "--campus-grid": t.campusGrid,
      "--campus-filled": t.campusFilled,
      "--accent": t.accent,
      "--accent-foreground": t.primaryForeground,
    });
    installGeneratedCss(
      buildTagPaletteCss() + "\n" + buildThemeCss(vars(theme), vars(theme.dark))
    );
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colorScheme, setColorScheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
