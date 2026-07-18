import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { ReplayFileAccess, ReplayText } from "./debug/DebugSession.js";

const SETTINGS_KEY = "mmx.desktop-settings.v1";

export interface DesktopSettings {
  version: 1;
  masterVolume: number;
  fullscreen: boolean;
  pauseOnBlur: boolean;
}

export const DEFAULT_SETTINGS: DesktopSettings = {
  version: 1,
  masterVolume: 1,
  fullscreen: false,
  pauseOnBlur: true,
};

function isDesktop(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function validSettings(value: unknown): value is DesktopSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<DesktopSettings>;
  return (
    settings.version === 1 &&
    typeof settings.masterVolume === "number" &&
    Number.isFinite(settings.masterVolume) &&
    settings.masterVolume >= 0 &&
    settings.masterVolume <= 1 &&
    typeof settings.fullscreen === "boolean" &&
    typeof settings.pauseOnBlur === "boolean"
  );
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
      const value = this.native
        ? await invoke<unknown>("load_settings")
        : JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
      return validSettings(value) ? value : { ...DEFAULT_SETTINGS };
    } catch (error) {
      console.warn("Could not load desktop settings; using defaults", error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings(settings: DesktopSettings): Promise<void> {
    if (!validSettings(settings)) throw new Error("refusing to save invalid desktop settings");
    if (this.native) await invoke("save_settings", { settings });
    else localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  async setFullscreen(fullscreen: boolean): Promise<void> {
    if (this.native) {
      await getCurrentWindow().setFullscreen(fullscreen);
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
