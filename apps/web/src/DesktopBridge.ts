import { invoke } from "@tauri-apps/api/core";
import { PhysicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";

import { VIEW_HEIGHT, VIEW_WIDTH } from "@mmx/engine";
import {
  clampScale,
  DEFAULT_WINDOW_SCALE,
  MAX_WINDOW_SCALE,
  type ClientSettings,
} from "@mmx/client-settings";
import type { ClipboardAccess, ReplayFileAccess, ReplayText } from "@mmx/runtime/debug";
import {
  readBrowserSettingsRaw,
  writeBrowserSettings,
  type WebSettingsBackend,
} from "./settings/webSettingsStorage.js";

export { clampScale, DEFAULT_WINDOW_SCALE, MAX_WINDOW_SCALE };

function isDesktop(): boolean {
  return "__TAURI_INTERNALS__" in window;
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
export class DesktopBridge implements WebSettingsBackend {
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

  readonly clipboard: ClipboardAccess = {
    writeText: async (text) => navigator.clipboard.writeText(text),
  };

  async isFullscreen(): Promise<boolean> {
    if (this.native) {
      const win = getCurrentWindow();
      return win.isFullscreen();
    }
    return document.fullscreenElement != null;
  }

  async loadRaw(): Promise<unknown> {
    if (this.native) return invoke<unknown>("load_settings");
    return readBrowserSettingsRaw();
  }

  async saveRaw(settings: ClientSettings): Promise<void> {
    if (this.native) await invoke("save_settings", { settings });
    else writeBrowserSettings(settings);
  }

  async load(): Promise<unknown> {
    return this.loadRaw();
  }

  async save(settings: ClientSettings): Promise<void> {
    return this.saveRaw(settings);
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

  async maxIntegerScale(): Promise<number> {
    return this.maxWindowScale();
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

  async applyIntegerScale(scale: number): Promise<void> {
    return this.applyWindowScale(scale);
  }

  async setFullscreen(fullscreen: boolean): Promise<void> {
    if (this.native) {
      const win = getCurrentWindow();
      if (fullscreen) {
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

  async onReplayDropped(load: (file: ReplayText) => void): Promise<() => void> {
    if (!this.native) return () => {};
    const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") return;
      const path = event.payload.paths.find((candidate) =>
        candidate.toLowerCase().endsWith(".json"),
      );
      if (!path) return;
      void invoke<ReplayText>("read_replay_path", { path })
        .then(load)
        .catch((error: unknown) => console.warn("Could not open dropped replay", error));
    });
    if (typeof unlisten === "function") return unlisten as unknown as () => void;
    return () => {};
  }
}
