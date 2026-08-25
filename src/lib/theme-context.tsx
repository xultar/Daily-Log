import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { readItem, writeItem } from "./storage";

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
  },
];

interface ThemeContextValue {
  theme: PlannerTheme;
  setTheme: (themeId: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES[0],
  setTheme: () => {},
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

  // Apply CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--primary", theme.primary);
    root.style.setProperty("--primary-foreground", theme.primaryForeground);
    root.style.setProperty("--campus-blue", theme.campusBlue);
    root.style.setProperty("--campus-blue-dark", theme.campusBlueDark);
    root.style.setProperty("--campus-grid", theme.campusGrid);
    root.style.setProperty("--campus-filled", theme.campusFilled);
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--accent-foreground", theme.primaryForeground);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
