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
  // Derive tinted variants from brand color so the whole palette stays coherent
  const brand = prefs.brand;
  const r = parseInt(brand.slice(1, 3), 16);
  const g = parseInt(brand.slice(3, 5), 16);
  const b = parseInt(brand.slice(5, 7), 16);
  const mix = (c: number, w: number) => Math.round(c * w + 255 * (1 - w)).toString(16).padStart(2, "0");
  const brandSecondary = `#${mix(r, 0.6)}${mix(g, 0.6)}${mix(b, 0.6)}`;
  const brandTertiary = `#${mix(r, 0.15)}${mix(g, 0.15)}${mix(b, 0.15)}`;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  const onBrandTertiary = luma > 180 ? "#3D3028" : brand;
  return {
    ...defaultColors,
    brand,
    brandPrimary: brand,
    brandSecondary,
    brandTertiary,
    onBrandTertiary,
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
