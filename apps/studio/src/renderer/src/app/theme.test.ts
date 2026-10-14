import { beforeAll, describe, expect, it, vi } from "vitest";

// theme.ts bootstraps against the DOM on import; give it the minimal browser surface.
const listeners = new Set<(event: { matches: boolean }) => void>();
const systemDark = {
  matches: true,
  addEventListener: (_: string, l: (event: { matches: boolean }) => void) => listeners.add(l),
  removeEventListener: (_: string, l: (event: { matches: boolean }) => void) => listeners.delete(l),
};
const root = { dataset: {} as Record<string, string>, style: { colorScheme: "" } };
const setSystemDark = (matches: boolean) => {
  systemDark.matches = matches;
  for (const l of listeners) l({ matches });
};

let theme: typeof import("./theme.js");

beforeAll(async () => {
  vi.stubGlobal("matchMedia", () => systemDark);
  vi.stubGlobal("document", { documentElement: root });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  theme = await import("./theme.js");
});

describe("theme preference", () => {
  it("defaults to system and keeps stored dark/light", () => {
    expect(theme.parseThemePreference(null)).toBe("system");
    expect(theme.parseThemePreference("bogus")).toBe("system");
    expect(theme.parseThemePreference("system")).toBe("system");
    expect(theme.parseThemePreference("dark")).toBe("dark");
    expect(theme.parseThemePreference("light")).toBe("light");
  });

  it("resolves system against the OS and pins explicit choices", () => {
    expect(theme.resolveColorTheme("system", true)).toBe("dark");
    expect(theme.resolveColorTheme("system", false)).toBe("light");
    expect(theme.resolveColorTheme("light", true)).toBe("light");
    expect(theme.resolveColorTheme("dark", false)).toBe("dark");
  });

  it("bootstraps a fresh profile from the OS scheme", () => {
    expect(root.dataset.theme).toBe("dark");
  });

  it("follows OS changes only while the preference is system", () => {
    const changes: string[] = [];
    expect(theme.applyThemePreference("system", (t) => changes.push(t))).toBe("dark");
    setSystemDark(false);
    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
    expect(changes).toEqual(["light"]);

    theme.applyThemePreference("system", (t) => changes.push(t));
    expect(listeners.size).toBe(1);

    expect(theme.applyThemePreference("dark", (t) => changes.push(t))).toBe("dark");
    expect(listeners.size).toBe(0);
    setSystemDark(true);
    setSystemDark(false);
    expect(root.dataset.theme).toBe("dark");
    expect(changes).toEqual(["light"]);
  });
});
