import { invoke } from "@tauri-apps/api/core";
import { PhysicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";

import { VIEW_HEIGHT, VIEW_WIDTH } from "../core/constants.js";
import type { Action } from "../core/Input.js";
import { REPLAY_ACTIONS } from "../core/Replay.js";
import type { ReplayFileAccess, ReplayText } from "./debug/DebugSession.js";

const SETTINGS_KEY = "mmx.desktop-settings.v1";

/** Default integer zoom; matches the tauri.conf.json window size (3 × 398×224). */
export const DEFAULT_WINDOW_SCALE = 3;
/** Hard ceiling so the menu cannot walk off into absurd sizes. */
export const MAX_WINDOW_SCALE = 8;

/**
 * The two key slots every action carries, as `KeyboardEvent.code` values.
 *
 * Two and not a variable-length list because the default map has always had
 * exactly two spellings of each action (arrows and WASD, Space and K), and a
 * fixed pair is what lets the settings menu lay bindings out as a grid the
 * arrow keys walk. An empty string is an unbound slot.
 */
export type KeyBindings = Record<Action, [string, string]>;

/** Every bindable action, in the order the settings menu lists them. */
export const BINDABLE_ACTIONS: readonly Action[] = REPLAY_ACTIONS;

export const DEFAULT_BINDINGS: KeyBindings = {
  move_left: ["ArrowLeft", "KeyA"],
  move_right: ["ArrowRight", "KeyD"],
  move_up: ["ArrowUp", "KeyW"],
  move_down: ["ArrowDown", "KeyS"],
  jump: ["Space", "KeyK"],
  dash: ["ShiftLeft", "KeyL"],
  fire: ["KeyJ", "KeyF"],
};

export interface DesktopSettings {
  version: 2;
  masterVolume: number;
  /** Device pixels per world pixel; also the locked window size multiplier. */
  scale: number;
  fullscreen: boolean;
  pauseOnBlur: boolean;
  bindings: KeyBindings;
}

export const DEFAULT_SETTINGS: DesktopSettings = {
  version: 2,
  masterVolume: 1,
  scale: DEFAULT_WINDOW_SCALE,
  fullscreen: false,
  pauseOnBlur: true,
  bindings: DEFAULT_BINDINGS,
};

export function clampScale(scale: number, max = MAX_WINDOW_SCALE): number {
  if (!Number.isFinite(scale)) return DEFAULT_WINDOW_SCALE;
  return Math.max(1, Math.min(max, Math.round(scale)));
}

export function cloneBindings(bindings: KeyBindings): KeyBindings {
  return Object.fromEntries(
    BINDABLE_ACTIONS.map((action) => [action, [...bindings[action]] as [string, string]]),
  ) as KeyBindings;
}

function isDesktop(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function validBindings(value: unknown): value is KeyBindings {
  if (!value || typeof value !== "object") return false;
  const bindings = value as Record<string, unknown>;
  // Exactly the known actions: an unknown key here would be a binding the game
  // can never dispatch, and Tauri's deserializer rejects it on the way back out.
  if (Object.keys(bindings).length !== BINDABLE_ACTIONS.length) return false;
  return BINDABLE_ACTIONS.every((action) => {
    const slots = bindings[action];
    return Array.isArray(slots) && slots.length === 2 && slots.every((s) => typeof s === "string");
  });
}

function validSettings(value: unknown): value is DesktopSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<DesktopSettings>;
  const scaleOk =
    settings.scale === undefined ||
    (typeof settings.scale === "number" &&
      Number.isInteger(settings.scale) &&
      settings.scale >= 1 &&
      settings.scale <= MAX_WINDOW_SCALE);
  return (
    settings.version === 2 &&
    typeof settings.masterVolume === "number" &&
    Number.isFinite(settings.masterVolume) &&
    settings.masterVolume >= 0 &&
    settings.masterVolume <= 1 &&
    scaleOk &&
    typeof settings.fullscreen === "boolean" &&
    typeof settings.pauseOnBlur === "boolean" &&
    validBindings(settings.bindings)
  );
}

function withScale(settings: DesktopSettings): DesktopSettings {
  return {
    ...settings,
    scale: clampScale(settings.scale ?? DEFAULT_WINDOW_SCALE),
    bindings: cloneBindings(settings.bindings),
  };
}

/**
 * Bring a stored file forward to the current version.
 *
 * v1 predates rebinding, so it is upgraded by giving it the default map rather
 * than being discarded — a player who had turned the volume down should not get
 * it back at full the first time they launch a build with a settings menu.
 */
function migrate(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const settings = value as Record<string, unknown>;
  if (settings.version !== 1) return value;
  return { ...settings, version: 2, bindings: cloneBindings(DEFAULT_BINDINGS) };
}

function download(contents: string, suggestedName: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  link.click();
  URL.revokeObjectURL(url);
}

function browserOpen(): Promise<ReplayText | null> {
  return new Promise((resolve, reject) => {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".json,application/json";
    picker.addEventListener(
      "change",
      () => {
        const file = picker.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        file
          .text()
          .then((contents) => resolve({ path: file.name, contents }))
          .catch(reject);
      },
      { once: true },
    );
    picker.click();
  });
}

/** Desktop services with equivalent browser fallbacks. */
export class DesktopBridge {
  readonly native = isDesktop();

  readonly replays: ReplayFileAccess = {
    save: async (contents, suggestedName) => {
      if (!this.native) {
        download(contents, suggestedName);
        return suggestedName;
      }
      return invoke<string | null>("save_replay", { contents, suggestedName });
    },
    open: async () => {
      if (!this.native) return browserOpen();
      return invoke<ReplayText | null>("open_replay");
    },
  };

  async loadSettings(): Promise<DesktopSettings> {
    try {
      const stored = this.native
        ? await invoke<unknown>("load_settings")
        : JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
      const value = migrate(stored);
      return validSettings(value)
        ? withScale(value)
        : { ...DEFAULT_SETTINGS, bindings: cloneBindings(DEFAULT_BINDINGS) };
    } catch (error) {
      console.warn("Could not load desktop settings; using defaults", error);
      return { ...DEFAULT_SETTINGS, bindings: cloneBindings(DEFAULT_BINDINGS) };
    }
  }

  async saveSettings(settings: DesktopSettings): Promise<void> {
    const normalized = withScale(settings);
    if (!validSettings(normalized)) throw new Error("refusing to save invalid desktop settings");
    if (this.native) await invoke("save_settings", { settings: normalized });
    else localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  }

  /**
   * Largest integer zoom that still fits the current monitor (desktop) or the
   * screen (browser). The menu uses this as the right-hand stop for the scale row.
   */
  async maxWindowScale(): Promise<number> {
    if (this.native) {
      const monitor = await currentMonitor();
      if (monitor) {
        return clampScale(
          Math.floor(Math.min(monitor.size.width / VIEW_WIDTH, monitor.size.height / VIEW_HEIGHT)),
        );
      }
    }
    const dpr = window.devicePixelRatio || 1;
    return clampScale(
      Math.floor(
        Math.min(
          (window.screen.width * dpr) / VIEW_WIDTH,
          (window.screen.height * dpr) / VIEW_HEIGHT,
        ),
      ),
    );
  }

  /**
   * Lock the native window to an exact integer zoom of the 398×224 view.
   *
   * Uses physical pixels so a chosen "3x" is three device pixels per world pixel
   * on every display, matching {@link Renderer.fit}. No-op in the browser.
   */
  async applyWindowScale(scale: number): Promise<void> {
    if (!this.native) return;
    const zoom = clampScale(scale);
    const win = getCurrentWindow();
    if (await win.isFullscreen()) await win.setFullscreen(false);
    const size = new PhysicalSize(VIEW_WIDTH * zoom, VIEW_HEIGHT * zoom);
    await win.setResizable(false);
    await win.setMinSize(null);
    await win.setMaxSize(null);
    await win.setSize(size);
    await win.setMinSize(size);
    await win.setMaxSize(size);
  }

  async setFullscreen(fullscreen: boolean): Promise<void> {
    if (this.native) {
      const win = getCurrentWindow();
      if (fullscreen) {
        // Fullscreen cannot grow past a locked max-size constraint.
        await win.setMinSize(null);
        await win.setMaxSize(null);
        await win.setFullscreen(true);
        return;
      }
      await win.setFullscreen(false);
      return;
    }
    if (fullscreen && !document.fullscreenElement)
      await document.documentElement.requestFullscreen();
    if (!fullscreen && document.fullscreenElement) await document.exitFullscreen();
  }

  async onReplayDropped(load: (file: ReplayText) => void): Promise<void> {
    if (!this.native) return;
    await getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") return;
      const path = event.payload.paths.find((candidate) =>
        candidate.toLowerCase().endsWith(".json"),
      );
      if (!path) return;
      void invoke<ReplayText>("read_replay_path", { path })
        .then(load)
        .catch((error: unknown) => console.warn("Could not open dropped replay", error));
    });
  }
}
