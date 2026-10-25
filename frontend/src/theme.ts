// FinPlanner — dark-first utility theme. The app ships dark only; both scheme
// slots resolve to the same obsidian/rust palette so the look never changes.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#121212",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#1E1E1E",
  onSurfaceSecondary: "#E0E0E0",
  surfaceTertiary: "#2C2C2C",
  onSurfaceTertiary: "#BDBDBD",
  surfaceInverse: "#F5F5F5",
  onSurfaceInverse: "#121212",
  muted: "#757575",

  brand: "#D35400",
  onBrand: "#FFFFFF",
  brandPrimary: "#E55934",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#D87D4A",
  onBrandSecondary: "#121212",
  brandTertiary: "#3E2723",
  onBrandTertiary: "#FFCCBC",

  success: "#66BB6A",
  onSuccess: "#1B5E20",
  warning: "#FFA726",
  onWarning: "#E65100",
  error: "#E57373",
  onError: "#B71C1C",
  info: "#8D6E63",
  onInfo: "#3E2723",

  border: "#333333",
  borderStrong: "#555555",
  divider: "#2A2A2A",
};

export type ThemeColors = typeof dark;

export const defaultScheme = "dark" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light: dark, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.("dark");

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

// Font family helpers (loaded in _layout via expo-font). Fall back gracefully.
export const fonts = {
  display: "BarlowCondensed",
  displayBold: "BarlowCondensedBold",
  text: "DMSans",
  textMedium: "DMSansMedium",
  textBold: "DMSansBold",
};
