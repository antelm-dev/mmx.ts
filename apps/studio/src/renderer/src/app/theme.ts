export type ColorTheme = "dark" | "light";

const STORAGE_KEY = "mmx-studio-theme";

export function readStoredTheme(): ColorTheme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    /* private mode / blocked storage */
  }
  return "dark";
}

export function applyColorTheme(theme: ColorTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function persistColorTheme(theme: ColorTheme): void {
  applyColorTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode / blocked storage */
  }
}

applyColorTheme(readStoredTheme());
