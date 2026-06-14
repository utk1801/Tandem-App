import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { colors as defaultColors, spacing, radius, fontSize, fonts } from "@/src/theme";
import { storage } from "@/src/utils/storage";

export type ThemeColors = typeof defaultColors;

export type ThemePrefs = {
  brand: string;
  surface: string;
  onSurface: string;
  surfaceSecondary: string;
};

const STORAGE_KEY = "tandem.theme.prefs";

const DEFAULT_PREFS: ThemePrefs = {
  brand: defaultColors.brand,
  surface: defaultColors.surface,
  onSurface: defaultColors.onSurface,
  surfaceSecondary: defaultColors.surfaceSecondary,
};

type ThemeCtx = {
  colors: ThemeColors;
  prefs: ThemePrefs;
  setPref: (key: keyof ThemePrefs, value: string) => void;
  resetPrefs: () => void;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
  fonts: typeof fonts;
};

const ThemeContext = createContext<ThemeCtx | null>(null);

function mergeColors(prefs: ThemePrefs): ThemeColors {
  return {
    ...defaultColors,
    brand: prefs.brand,
    brandPrimary: prefs.brand,
    brandSecondary: prefs.brand,
    surface: prefs.surface,
    onSurface: prefs.onSurface,
    surfaceSecondary: prefs.surfaceSecondary,
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<ThemePrefs>(DEFAULT_PREFS);

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<ThemePrefs | null>(STORAGE_KEY, null);
      if (saved) setPrefs({ ...DEFAULT_PREFS, ...saved });
    })();
  }, []);

  const setPref = (key: keyof ThemePrefs, value: string) => {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      void storage.setItem(STORAGE_KEY, next);
      return next;
    });
  };

  const resetPrefs = () => {
    setPrefs(DEFAULT_PREFS);
    void storage.removeItem(STORAGE_KEY);
  };

  const value = useMemo(
    () => ({
      colors: mergeColors(prefs),
      prefs,
      setPref,
      resetPrefs,
      spacing,
      radius,
      fontSize,
      fonts,
    }),
    [prefs],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside ThemeProvider");
  return ctx;
}
