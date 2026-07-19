import type { Container } from "pixi.js";
import type { Action } from "@mmx/engine/core/Input.js";
import { DEFAULT_WINDOW_SCALE } from "../DesktopBridge.js";
import type { AppLifecycle } from "../runtime/AppLifecycle.js";
import type { SoundEffects } from "../SoundEffects.js";
import { keyLabel, ROWS, SettingsMenuView } from "../ui/SettingsMenuView.js";
import type { SettingsModel } from "./SettingsModel.js";

/**
 * The pause menu's interactive half: navigation state (`row`/`column`),
 * key-capture, and translating a key press into a mutation on
 * {@link SettingsModel} or {@link AppLifecycle}. The menu owns *no* settings
 * state itself — every read goes through the model, so there is exactly one
 * copy of the settings and persistence stays with the code that owns it.
 *
 * Rendering is delegated entirely to {@link SettingsMenuView}; this class
 * never touches a `Graphics` or `Text` object directly.
 */

const VOLUME_STEP = 0.1;

function isReserved(code: string): boolean {
  return code === "Escape" || /^F\d+$/.test(code);
}

export interface SettingsMenuControllerOptions {
  model: SettingsModel;
  lifecycle: AppLifecycle;
  sounds: SoundEffects;
  /** A key held on the way in must not stay held for as long as the menu is up. */
  releaseAllKeys: () => void;
  onMainMenu: () => void;
  onVisibilityChange?: (visible: boolean) => void;
}

export class SettingsMenuController {
  private readonly display = new SettingsMenuView();

  private row = 0;
  private column = 0;
  private capturing: { action: Action; slot: number } | null = null;
  private opaque = false;

  constructor(private readonly options: SettingsMenuControllerOptions) {}

  get view(): Container {
    return this.display.view;
  }

  get visible(): boolean {
    return this.display.visible;
  }

  /**
   * True while a slot is waiting for a key press.
   *
   * Exposed for the gamepad, which drives the menu by synthesizing key codes:
   * those are not keys the player pressed, and binding one would put a code in
   * the settings file that no keyboard can ever produce again.
   */
  get isCapturing(): boolean {
    return this.capturing !== null;
  }

  setPixelScale(scale: number): void {
    this.display.setPixelScale(scale);
  }

  /**
   * @param opaque Hide whatever is behind the menu entirely instead of dimly
   * showing it through the scrim. Set from the title screen, where "behind"
   * is only ever the idle scene the game boots into, not a run in progress —
   * showing it through the scrim reads as a rendering glitch, not a pause.
   */
  open(opaque = false): void {
    if (this.display.visible) return;
    this.display.setVisible(true);
    this.capturing = null;
    this.opaque = opaque;
    this.refresh();
    this.options.onVisibilityChange?.(true);
  }

  close(): void {
    if (!this.display.visible) return;
    this.display.setVisible(false);
    this.capturing = null;
    this.options.onVisibilityChange?.(false);
  }

  /**
   * Handle a key press. Returns true when the menu consumed it.
   *
   * While open it consumes *everything*: the menu's own navigation keys are also
   * gameplay bindings by default, so anything that fell through would have X
   * walking around behind the panel.
   */
  handleKey(code: string): boolean {
    if (!this.display.visible) {
      if (code !== "Escape") return false;
      this.open();
      return true;
    }

    if (this.capturing) {
      this.captureKey(code);
      return true;
    }

    switch (code) {
      case "Escape":
        this.close();
        return true;
      case "ArrowUp":
      case "KeyW":
        this.moveRow(-1);
        return true;
      case "ArrowDown":
      case "KeyS":
        this.moveRow(1);
        return true;
      case "ArrowLeft":
      case "KeyA":
        this.moveColumn(-1);
        return true;
      case "ArrowRight":
      case "KeyD":
        this.moveColumn(1);
        return true;
      case "Enter":
      case "Space":
        this.activate();
        return true;
      case "Delete":
      case "Backspace":
        this.clearBinding();
        return true;
      default:
        return true;
    }
  }

  private moveRow(delta: number): void {
    this.row = (this.row + delta + ROWS.length) % ROWS.length;
    this.refresh();
  }

  private moveColumn(delta: number): void {
    const row = ROWS[this.row];
    if (row.kind === "volume") {
      const current = this.options.model.get().masterVolume;
      const next = Math.round((current + delta * VOLUME_STEP) * 10) / 10;
      this.options.model.setVolume(Math.max(0, Math.min(1, next)));
      // The point of a volume slider is hearing the result, and the meter alone
      // says nothing about how loud that actually is.
      this.options.sounds.play("lemon");
    } else if (row.kind === "scale") {
      const current = this.options.model.get().scale ?? DEFAULT_WINDOW_SCALE;
      const max = Math.max(1, this.options.model.maxScale);
      this.options.lifecycle.setScale(Math.max(1, Math.min(max, current + delta)));
    } else if (row.kind === "fullscreen") {
      this.toggleFullscreen();
    } else {
      this.column = Math.max(0, Math.min(1, this.column + delta));
    }
    this.refresh();
  }

  private activate(): void {
    const row = ROWS[this.row];
    if (row.kind === "mainMenu") {
      this.options.onMainMenu();
      return;
    }
    if (row.kind === "fullscreen") {
      this.toggleFullscreen();
      this.refresh();
      return;
    }
    if (row.kind === "resetBindings") {
      this.options.model.resetBindings();
      // The key that was physically down when it was captured belongs to the old
      // mapping, and no keyup will ever arrive for it under the new one.
      this.options.releaseAllKeys();
      this.refresh();
      return;
    }
    if (row.kind !== "binding") return;
    this.capturing = { action: row.action, slot: this.column };
    this.refresh();
  }

  private toggleFullscreen(): void {
    this.options.lifecycle.setFullscreen(!this.options.model.get().fullscreen);
  }

  private clearBinding(): void {
    const row = ROWS[this.row];
    if (row.kind !== "binding") return;
    this.options.model.setBinding(row.action, this.column, "");
    this.options.releaseAllKeys();
    this.refresh();
  }

  private captureKey(code: string): void {
    const capturing = this.capturing;
    if (!capturing) return;
    if (code === "Escape") {
      this.capturing = null;
      this.refresh();
      return;
    }
    if (isReserved(code)) {
      this.refresh(`${keyLabel(code)} is reserved`);
      return;
    }
    this.capturing = null;
    this.options.model.setBinding(capturing.action, capturing.slot, code);
    // The key that was physically down when it was captured belongs to the old
    // mapping, and no keyup will ever arrive for it under the new one.
    this.options.releaseAllKeys();
    this.refresh();
  }

  private refresh(notice?: string): void {
    this.display.render({
      settings: this.options.model.get(),
      maxScale: this.options.model.maxScale,
      row: this.row,
      column: this.column,
      capturing: this.capturing,
      opaque: this.opaque,
      notice,
    });
  }
}
