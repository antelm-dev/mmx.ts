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

export class DesktopBridge implements WebSettingsBackend {
  readonly replays: ReplayFileAccess = {
    save: async (contents, suggestedName) => {
      download(contents, suggestedName);
      return suggestedName;
    },
    open: async () => browserOpen(),
  };

  readonly clipboard: ClipboardAccess = {
    writeText: async (text) => navigator.clipboard.writeText(text),
  };

  async isFullscreen(): Promise<boolean> {
    return document.fullscreenElement != null;
  }

  async loadRaw(): Promise<unknown> {
    return readBrowserSettingsRaw();
  }

  async saveRaw(settings: ClientSettings): Promise<void> {
    writeBrowserSettings(settings);
  }

  async load(): Promise<unknown> {
    return this.loadRaw();
  }

  async save(settings: ClientSettings): Promise<void> {
    return this.saveRaw(settings);
  }

  async maxWindowScale(): Promise<number> {
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

  async setFullscreen(fullscreen: boolean): Promise<void> {
    if (fullscreen && !document.fullscreenElement)
      await document.documentElement.requestFullscreen();
    if (!fullscreen && document.fullscreenElement) await document.exitFullscreen();
  }

  onReplayDropped(_load: (file: ReplayText) => void): () => void {
    return () => {};
  }
}
