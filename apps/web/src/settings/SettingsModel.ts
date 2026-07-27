import type { Action } from "@mmx/engine";
import {
  BINDABLE_ACTIONS,
  DEFAULT_BINDINGS,
  DEFAULT_WINDOW_SCALE,
  MAX_WINDOW_SCALE,
  cloneBindings,
  createClientSettingsStore,
  type ClientSettings,
  type ClientSettingsStore,
  type KeyBindings,
} from "@mmx/client-settings";
import type { DesktopBridge } from "../DesktopBridge.js";
import { createWebSettingsStorage } from "./webSettingsStorage.js";

export type { KeyBindings };
export {
  BINDABLE_ACTIONS,
  DEFAULT_BINDINGS,
  DEFAULT_WINDOW_SCALE,
  MAX_WINDOW_SCALE,
  cloneBindings,
};

/** Flat projection kept for the Pixi settings menu and lifecycle callers. */
export interface DesktopSettings {
  masterVolume: number;
  scale: number;
  fullscreen: boolean;
  pauseOnBlur: boolean;
  bindings: KeyBindings;
}

export interface SettingsModelOptions {
  desktop: DesktopBridge;
  onNotice?: (message: string) => void;
  store?: ClientSettingsStore;
}

function toView(settings: ClientSettings): DesktopSettings {
  return {
    masterVolume: settings.audio.masterVolume,
    scale: settings.window.integerScale,
    fullscreen: settings.window.fullscreen,
    pauseOnBlur: settings.gameplay.pauseOnBlur,
    bindings: settings.input.bindings,
  };
}

export class SettingsModel {
  private readonly store: ClientSettingsStore;
  private readonly onNotice?: (message: string) => void;
  private readonly desktop: DesktopBridge;
  private maxWindowScale = MAX_WINDOW_SCALE;

  constructor(options: SettingsModelOptions) {
    this.desktop = options.desktop;
    this.onNotice = options.onNotice;
    this.store =
      options.store ??
      createClientSettingsStore({
        storage: createWebSettingsStorage(options.desktop),
        onSaveError: (error) => {
          console.warn("Could not save desktop settings", error);
          options.onNotice?.(`settings save failed: ${String(error)}`);
        },
      });
  }

  get storeRef(): ClientSettingsStore {
    return this.store;
  }

  get(): DesktopSettings {
    return toView(this.store.snapshot());
  }

  get maxScale(): number {
    return this.maxWindowScale;
  }

  async load(): Promise<void> {
    await this.store.load();
    this.maxWindowScale = await this.desktop.maxWindowScale().catch(() => MAX_WINDOW_SCALE);
    const scale = Math.min(this.store.snapshot().window.integerScale, this.maxWindowScale);
    if (scale !== this.store.snapshot().window.integerScale) {
      this.store.patch({ window: { integerScale: scale } });
    }
  }

  async refreshMaxScale(): Promise<void> {
    this.maxWindowScale = await this.desktop.maxWindowScale().catch(() => this.maxWindowScale);
  }

  patch(partial: Partial<DesktopSettings>): void {
    this.store.patch({
      audio: partial.masterVolume !== undefined ? { masterVolume: partial.masterVolume } : undefined,
      gameplay: partial.pauseOnBlur !== undefined ? { pauseOnBlur: partial.pauseOnBlur } : undefined,
      window: {
        fullscreen: partial.fullscreen,
        integerScale: partial.scale,
      },
      input: partial.bindings !== undefined ? { bindings: partial.bindings } : undefined,
    });
  }

  setVolume(volume: number): void {
    this.patch({ masterVolume: Math.max(0, Math.min(1, volume)) });
  }

  adjustVolume(delta: number): void {
    this.setVolume(Math.round((this.get().masterVolume + delta) * 10) / 10);
    this.onNotice?.(`volume ${Math.round(this.get().masterVolume * 100)}%`);
  }

  setPauseOnBlur(pauseOnBlur: boolean): void {
    this.patch({ pauseOnBlur });
    this.onNotice?.(`pause on focus loss ${pauseOnBlur ? "on" : "off"}`);
  }

  setBinding(action: Action, slot: number, code: string): void {
    this.store.setBinding(action, slot, code);
  }

  resetBindings(): void {
    this.store.resetBindings();
    this.onNotice?.("key bindings restored to defaults");
  }

  flush(): Promise<void> {
    return this.store.flush();
  }
}
