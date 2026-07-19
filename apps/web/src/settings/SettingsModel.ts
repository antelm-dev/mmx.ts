import type { Action } from "@mmx/engine/core/Input.js";
import {
  BINDABLE_ACTIONS,
  cloneBindings,
  DEFAULT_BINDINGS,
  DEFAULT_SETTINGS,
  DesktopBridge,
  MAX_WINDOW_SCALE,
  type DesktopSettings,
} from "../DesktopBridge.js";

/**
 * The single copy of {@link DesktopSettings}, plus its persistence.
 *
 * Everything downstream (the settings menu, the debug F-keys, window
 * lifecycle) reads and mutates settings through here rather than holding its
 * own copy, so there is exactly one place a rebind or a volume change can
 * actually take effect. Window/OS operations (applying a scale, entering
 * fullscreen) are deliberately not here — see `AppLifecycle` — this class
 * only ever touches the data and disk/localStorage.
 */

export interface SettingsModelOptions {
  desktop: DesktopBridge;
  /** Transient user-facing feedback, e.g. routed to the debug HUD. */
  onNotice?: (message: string) => void;
}

export class SettingsModel {
  private settings: DesktopSettings = {
    ...DEFAULT_SETTINGS,
    bindings: cloneBindings(DEFAULT_BINDINGS),
  };
  private maxWindowScale = MAX_WINDOW_SCALE;
  private saveTimer = 0;

  constructor(private readonly options: SettingsModelOptions) {}

  get(): DesktopSettings {
    return this.settings;
  }

  get maxScale(): number {
    return this.maxWindowScale;
  }

  /** Load persisted settings and the display's scale ceiling. Call once at startup. */
  async load(): Promise<void> {
    this.settings = await this.options.desktop.loadSettings();
    this.maxWindowScale = await this.options.desktop
      .maxWindowScale()
      .catch(() => MAX_WINDOW_SCALE);
    this.settings = { ...this.settings, scale: Math.min(this.settings.scale, this.maxWindowScale) };
  }

  /** Refresh the scale ceiling — the menu calls this whenever it opens. */
  async refreshMaxScale(): Promise<void> {
    this.maxWindowScale = await this.options.desktop.maxWindowScale().catch(() => this.maxWindowScale);
  }

  /** Merge a partial update into the live settings and persist it. */
  patch(partial: Partial<DesktopSettings>): void {
    this.settings = { ...this.settings, ...partial };
    this.persist();
  }

  setVolume(volume: number): void {
    this.patch({ masterVolume: Math.max(0, Math.min(1, volume)) });
  }

  adjustVolume(delta: number): void {
    this.setVolume(Math.round((this.settings.masterVolume + delta) * 10) / 10);
    this.options.onNotice?.(`volume ${Math.round(this.settings.masterVolume * 100)}%`);
  }

  setPauseOnBlur(pauseOnBlur: boolean): void {
    this.patch({ pauseOnBlur });
    this.options.onNotice?.(`pause on focus loss ${pauseOnBlur ? "on" : "off"}`);
  }

  setBinding(action: Action, slot: number, code: string): void {
    const bindings = cloneBindings(this.settings.bindings);
    // A key can only mean one thing: taking it for this slot releases it
    // everywhere else, or the earlier action would keep winning the lookup and
    // the rebind would look like it silently failed.
    if (code) {
      for (const other of BINDABLE_ACTIONS) {
        for (let i = 0; i < bindings[other].length; i++) {
          if (bindings[other][i] === code) bindings[other][i] = "";
        }
      }
    }
    bindings[action][slot] = code;
    this.patch({ bindings });
  }

  resetBindings(): void {
    this.patch({ bindings: cloneBindings(DEFAULT_BINDINGS) });
    this.options.onNotice?.("key bindings restored to defaults");
  }

  /**
   * Write the settings out, coalescing a burst into one write.
   *
   * Holding an arrow key on the menu's volume row emits a change per key repeat,
   * and each one is a disk write on desktop. The delay is short enough that a
   * player who closes the menu and quits immediately still keeps their choice,
   * because closing the window does not cancel a pending timer that has already
   * been given the final value.
   */
  private persist(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      void this.options.desktop.saveSettings(this.settings).catch((error: unknown) => {
        console.warn("Could not save desktop settings", error);
        this.options.onNotice?.(`settings save failed: ${String(error)}`);
      });
    }, 200);
  }
}
