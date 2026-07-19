import { Container, Graphics, Text } from "pixi.js";
import type { Action } from "@mmx/engine/core/Input.js";
import { VIEW_HEIGHT, VIEW_WIDTH } from "@mmx/engine/core/constants.js";
import { BINDABLE_ACTIONS, DEFAULT_WINDOW_SCALE, type DesktopSettings } from "../DesktopBridge.js";
import { uiTextStyle } from "./font.js";

/**
 * The pause menu: key bindings, window scale and master volume, on Escape.
 *
 * Drawn into the Pixi scene rather than overlaid as DOM — unlike the debug panel
 * (see {@link DebugPanel}, which is deliberately DOM), this is player-facing
 * furniture, so it belongs on the same pixel grid as the game and has to survive
 * fullscreen and the integer-zoom fit. It lives in the renderer's screen-space UI
 * layer, so its coordinates are the 398x224 view and the zoom is applied above it.
 *
 * The menu owns *no* settings state. It reads the live object through
 * {@link SettingsMenuOptions.getSettings} and reports every change back out, so
 * there is exactly one copy of the settings and persistence stays with the code
 * that owns the bridge.
 */

// Sized around the UI face rather than around the strings: every glyph advances
// UI_CHAR_W (7px), so a column is just its longest label times that. The widest
// things that have to fit are the hint line at 36 characters (252px inside the
// padding) and "press..." in a key slot (56px).
const PANEL_W = 296;
const PANEL_H = 188;
const PANEL_X = Math.round((VIEW_WIDTH - PANEL_W) / 2);
const PANEL_Y = Math.round((VIEW_HEIGHT - PANEL_H) / 2);

const PAD = 12;
const ROW_H = 11;
const TITLE_Y = PANEL_Y + PAD;
const RULE_Y = PANEL_Y + 24;
const HEADER_Y = PANEL_Y + 28;
const ROWS_Y = PANEL_Y + 42;
const HINT_Y = PANEL_Y + PANEL_H - 20;
const LABEL_X = PANEL_X + PAD;
const SLOT_X = [PANEL_X + 132, PANEL_X + 208] as const;
const SLOT_W = 68;

const COLOR_SCRIM = 0x05070f;
const COLOR_PANEL = 0x0b1622;
const COLOR_BORDER = 0x395564;
const COLOR_TEXT = 0xd7edf7;
const COLOR_DIM = 0x7f9daa;
const COLOR_SELECTED = 0xffd166;
const COLOR_CAPTURING = 0xff6b6b;

const VOLUME_STEP = 0.1;
const METER_CELLS = 10;

type Row =
  | { kind: "binding"; action: Action }
  | { kind: "scale" }
  | { kind: "fullscreen" }
  | { kind: "volume" }
  | { kind: "mainMenu" };

const ROWS: readonly Row[] = [
  ...BINDABLE_ACTIONS.map((action): Row => ({ kind: "binding", action })),
  { kind: "scale" },
  { kind: "fullscreen" },
  { kind: "volume" },
  { kind: "mainMenu" },
];

const ACTION_LABELS: Record<Action, string> = {
  move_left: "Left",
  move_right: "Right",
  move_up: "Up",
  move_down: "Down",
  jump: "Jump",
  dash: "Dash",
  fire: "Fire",
};

function isReserved(code: string): boolean {
  return code === "Escape" || /^F\d+$/.test(code);
}

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  ArrowDown: "Down",
  Space: "Space",
  ShiftLeft: "LShift",
  ShiftRight: "RShift",
  ControlLeft: "LCtrl",
  ControlRight: "RCtrl",
  AltLeft: "LAlt",
  AltRight: "RAlt",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Bksp",
  CapsLock: "Caps",
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Slash: "/",
  // Spelled out because the UI face has no backslash glyph, and a lone character
  // dropping to the fallback font beside the pixel caps reads as a rendering bug.
  Backslash: "Bslash",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backquote: "`",
};

/** `KeyboardEvent.code` as something a player recognises on a key cap. */
export function keyLabel(code: string): string {
  if (!code) return "--";
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num${code.slice(6)}`;
  return code;
}

export interface SettingsMenuOptions {
  getSettings: () => DesktopSettings;
  setVolume: (volume: number) => void;
  setScale: (scale: number) => void;
  setFullscreen: (fullscreen: boolean) => void;
  /** Upper bound for the scale row; refreshed whenever the menu opens. */
  getMaxScale: () => number;
  setBinding: (action: Action, slot: number, code: string) => void;
  onMainMenu: () => void;
  onVisibilityChange?: (visible: boolean) => void;
}

export class SettingsMenu {
  readonly view = new Container();

  private readonly backdrop = new Graphics();
  private readonly highlight = new Graphics();
  private readonly meter = new Graphics();
  private readonly texts: Text[] = [];
  private readonly rowLabels: Text[] = [];
  private readonly slotLabels: Text[][] = [];
  private readonly scaleValue: Text;
  private readonly fullscreenValue: Text;
  private readonly volumeValue: Text;
  private readonly hint: Text;

  private row = 0;
  private column = 0;
  private capturing: { action: Action; slot: number } | null = null;
  private resolution = 1;

  constructor(private readonly options: SettingsMenuOptions) {
    this.view.visible = false;
    this.view.eventMode = "none";

    this.paintFrame();
    this.view.addChild(this.backdrop, this.highlight, this.meter);

    this.addText("SETTINGS", LABEL_X, TITLE_Y, COLOR_TEXT);
    this.addText("KEY 1", SLOT_X[0], HEADER_Y, COLOR_DIM);
    this.addText("KEY 2", SLOT_X[1], HEADER_Y, COLOR_DIM);

    ROWS.forEach((row, index) => {
      const y = ROWS_Y + index * ROW_H;
      this.rowLabels.push(this.addText(rowLabel(row), LABEL_X, y, COLOR_TEXT));
      this.slotLabels.push(
        row.kind === "binding"
          ? [
              this.addText("", SLOT_X[0] + 3, y, COLOR_TEXT),
              this.addText("", SLOT_X[1] + 3, y, COLOR_TEXT),
            ]
          : [],
      );
    });

    this.scaleValue = this.addText(
      "",
      SLOT_X[0] + 3,
      ROWS_Y + rowIndex("scale") * ROW_H,
      COLOR_TEXT,
    );
    this.fullscreenValue = this.addText(
      "",
      SLOT_X[0] + 3,
      ROWS_Y + rowIndex("fullscreen") * ROW_H,
      COLOR_TEXT,
    );
    this.volumeValue = this.addText(
      "",
      SLOT_X[1] + 3,
      ROWS_Y + rowIndex("volume") * ROW_H,
      COLOR_TEXT,
    );
    this.hint = this.addText("", LABEL_X, HINT_Y, COLOR_DIM);
  }

  get visible(): boolean {
    return this.view.visible;
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

  /**
   * Match the text resolution to the renderer's integer zoom.
   *
   * The layer is scaled up by whole device pixels, so 8px glyphs rasterised at 1x
   * would be magnified along with everything else and come out as mush. Rendering
   * the atlas at the zoom factor and letting the same scale bring it back down
   * puts the glyphs on the device pixel grid instead. Cheap to call every frame:
   * it only touches the Text objects when the zoom actually changed.
   */
  setPixelScale(scale: number): void {
    if (scale === this.resolution || scale <= 0) return;
    this.resolution = scale;
    for (const text of this.texts) text.resolution = scale;
  }

  open(): void {
    if (this.view.visible) return;
    this.view.visible = true;
    this.capturing = null;
    this.refresh();
    this.options.onVisibilityChange?.(true);
  }

  close(): void {
    if (!this.view.visible) return;
    this.view.visible = false;
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
    if (!this.view.visible) {
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
      const current = this.options.getSettings().masterVolume;
      const next = Math.round((current + delta * VOLUME_STEP) * 10) / 10;
      this.options.setVolume(Math.max(0, Math.min(1, next)));
    } else if (row.kind === "scale") {
      const current = this.options.getSettings().scale ?? DEFAULT_WINDOW_SCALE;
      const max = Math.max(1, this.options.getMaxScale());
      this.options.setScale(Math.max(1, Math.min(max, current + delta)));
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
    if (row.kind !== "binding") return;
    this.capturing = { action: row.action, slot: this.column };
    this.refresh();
  }

  private toggleFullscreen(): void {
    this.options.setFullscreen(!this.options.getSettings().fullscreen);
  }

  private clearBinding(): void {
    const row = ROWS[this.row];
    if (row.kind !== "binding") return;
    this.options.setBinding(row.action, this.column, "");
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
    this.options.setBinding(capturing.action, capturing.slot, code);
    this.refresh();
  }

  private addText(content: string, x: number, y: number, color: number): Text {
    const text = new Text({ text: content, style: uiTextStyle(color) });
    text.x = x;
    text.y = y;
    text.resolution = this.resolution;
    this.texts.push(text);
    this.view.addChild(text);
    return text;
  }

  private paintFrame(): void {
    this.backdrop
      .rect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
      .fill({ color: COLOR_SCRIM, alpha: 0.78 })
      .rect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H)
      .fill({ color: COLOR_PANEL, alpha: 0.96 })
      .rect(PANEL_X + 0.5, PANEL_Y + 0.5, PANEL_W - 1, PANEL_H - 1)
      .stroke({ color: COLOR_BORDER, width: 1 })
      .rect(PANEL_X + PAD, RULE_Y, PANEL_W - PAD * 2, 1)
      .fill(COLOR_BORDER);
  }

  private refresh(notice?: string): void {
    const settings = this.options.getSettings();
    const row = ROWS[this.row];

    this.highlight.clear();
    const rowY = ROWS_Y + this.row * ROW_H;
    this.highlight
      .rect(PANEL_X + PAD - 3, rowY - 2, PANEL_W - (PAD - 3) * 2, ROW_H - 2)
      .fill({ color: COLOR_BORDER, alpha: 0.3 });
    if (row.kind === "binding") {
      this.highlight
        .rect(SLOT_X[this.column], rowY - 2, SLOT_W, ROW_H - 2)
        .fill({ color: this.capturing ? COLOR_CAPTURING : COLOR_SELECTED, alpha: 0.25 });
    }

    ROWS.forEach((current, index) => {
      const selected = index === this.row;
      this.rowLabels[index].style.fill = selected ? COLOR_SELECTED : COLOR_TEXT;
      if (current.kind !== "binding") return;

      const bindings = settings.bindings[current.action];
      this.slotLabels[index].forEach((text, slot) => {
        const capturing = this.capturing?.action === current.action && this.capturing.slot === slot;
        text.text = capturing ? "press..." : keyLabel(bindings[slot]);
        text.style.fill = capturing ? COLOR_CAPTURING : bindings[slot] ? COLOR_TEXT : COLOR_DIM;
      });
    });

    this.scaleValue.text = `${settings.scale ?? DEFAULT_WINDOW_SCALE}x`;
    this.fullscreenValue.text = settings.fullscreen ? "On" : "Off";
    this.paintVolume(settings.masterVolume);
    this.hint.text =
      notice ?? (this.capturing ? "press a key to bind, Esc to cancel" : rowHint(row));
    this.hint.style.fill = notice ? COLOR_CAPTURING : COLOR_DIM;
  }

  private paintVolume(volume: number): void {
    const filled = Math.round(volume * METER_CELLS);
    const y = ROWS_Y + rowIndex("volume") * ROW_H;

    this.meter.clear();
    for (let cell = 0; cell < METER_CELLS; cell++) {
      const x = SLOT_X[0] + cell * 5;
      this.meter.rect(x, y + 2, 4, 7).fill({
        color: cell < filled ? COLOR_SELECTED : COLOR_BORDER,
        alpha: cell < filled ? 1 : 0.5,
      });
    }
    // No percent sign: the face has no `%` glyph. The ten-cell meter immediately
    // to the left already says the number is a proportion, so the bare figure
    // loses nothing that a fallback-font `%` would have bought.
    this.volumeValue.text = `${Math.round(volume * 100)}`;
  }
}

function rowIndex(kind: Row["kind"]): number {
  return ROWS.findIndex((row) => row.kind === kind);
}

function rowLabel(row: Row): string {
  switch (row.kind) {
    case "volume":
      return "Volume";
    case "scale":
      return "Scale";
    case "fullscreen":
      return "Fullscreen";
    case "binding":
      return ACTION_LABELS[row.action];
    case "mainMenu":
      return "Main Menu";
  }
}

function rowHint(row: Row): string {
  switch (row.kind) {
    case "volume":
      return "Left/Right volume - Esc close";
    case "scale":
      return "Left/Right scale - Esc close";
    case "fullscreen":
      return "Enter toggle - Esc close";
    case "binding":
      return "Enter rebind - Del clear - Esc close";
    case "mainMenu":
      return "Enter return to home";
  }
}
