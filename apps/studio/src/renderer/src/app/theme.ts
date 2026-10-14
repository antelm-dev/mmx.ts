export type ColorTheme = "dark" | "light";
export type ThemePreference = ColorTheme | "system";

const STORAGE_KEY = "mmx-studio-theme";

const systemDark = matchMedia("(prefers-color-scheme: dark)");

/** Missing or unknown values mean "system"; explicit `dark`/`light` from earlier versions are kept. */
export function parseThemePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveColorTheme(preference: ThemePreference, systemIsDark: boolean): ColorTheme {
  if (preference !== "system") return preference;
  return systemIsDark ? "dark" : "light";
}

export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(STORAGE_KEY));
  } catch {
    /* private mode / blocked storage */
    return "system";
  }
}

function applyColorTheme(theme: ColorTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

let stopFollowingSystem: (() => void) | undefined;

/**
 * Applies `preference` to `<html>` and returns the resolved theme. For "system"
 * it keeps following OS changes (reporting each through `onSystemChange`) until
 * the next call.
 */
export function applyThemePreference(
  preference: ThemePreference,
  onSystemChange: (theme: ColorTheme) => void,
): ColorTheme {
  stopFollowingSystem?.();
  stopFollowingSystem = undefined;
  if (preference === "system") {
    const listener = (event: MediaQueryListEvent) => {
      const theme = resolveColorTheme("system", event.matches);
      applyColorTheme(theme);
      onSystemChange(theme);
    };
    systemDark.addEventListener("change", listener);
    stopFollowingSystem = () => systemDark.removeEventListener("change", listener);
  }
  const theme = resolveColorTheme(preference, systemDark.matches);
  applyColorTheme(theme);
  return theme;
}

export function persistThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    /* private mode / blocked storage */
  }
}

applyColorTheme(resolveColorTheme(readThemePreference(), systemDark.matches));
