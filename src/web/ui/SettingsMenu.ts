import { Container, Graphics, Text } from "pixi.js";
import type { Action } from "../../core/Input.js";
import { VIEW_HEIGHT, VIEW_WIDTH } from "../../core/constants.js";
import { BINDABLE_ACTIONS, type DesktopSettings } from "../DesktopBridge.js";

/**
 * The pause menu: key bindings and master volume, on Escape.
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

// The view is 398x224 and every coordinate below is in those world pixels.
const PANEL_W = 232;
const PANEL_H = 160;
const PANEL_X = Math.round((VIEW_WIDTH - PANEL_W) / 2);
const PANEL_Y = Math.round((VIEW_HEIGHT - PANEL_H) / 2);

const PAD = 10;
const ROW_H = 12;
/**
 * Vertical stops inside the panel. An 8px glyph box is ~10px tall, so each of
 * these is one text line clear of the one above it: title, rule, column heads,
 * then the rows, with the hint pinned to the bottom padding.
 */
const TITLE_Y = PANEL_Y + PAD;
const RULE_Y = PANEL_Y + 22;
const HEADER_Y = PANEL_Y + 26;
const ROWS_Y = PANEL_Y + 40;
const HINT_Y = PANEL_Y + PANEL_H - 20;
/** Column origins, relative to the panel. */
const LABEL_X = PANEL_X + PAD;
const SLOT_X = [PANEL_X + 104, PANEL_X + 164] as const;
const SLOT_W = 54;

const COLOR_SCRIM = 0x05070f;
const COLOR_PANEL = 0x0b1622;
const COLOR_BORDER = 0x395564;
const COLOR_TEXT = 0xd7edf7;
const COLOR_DIM = 0x7f9daa;
const COLOR_SELECTED = 0xffd166;
const COLOR_CAPTURING = 0xff6b6b;

/** Volume steps, matching the F9/F10 nudges. */
const VOLUME_STEP = 0.1;
const METER_CELLS = 10;

/** Rows, in the order they are drawn and walked. */
type Row = { kind: "binding"; action: Action } | { kind: "volume" };

const ROWS: readonly Row[] = [
  ...BINDABLE_ACTIONS.map((action): Row => ({ kind: "binding", action })),
  { kind: "volume" },
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

/**
 * Keys the menu will not hand out.
 *
 * Escape is the menu's own way in and out, and the function keys are the debug
 * layer — gameplay bindings are dispatched *before* debug commands (see
 * main.ts), so a bindable F-key would be a way to permanently lose the debug
 * panel from inside the menu that is supposed to be the safe surface.
 */
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
  Backslash: "\\",
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
  /** The live settings object; read on every refresh, never written here. */
  getSettings: () => DesktopSettings;
  setVolume: (volume: number) => void;
  /** Bind `code` to one of an action's two slots; "" clears it. */
  setBinding: (action: Action, slot: number, code: string) => void;
  /** Called on open and on close, for pausing and for dropping held keys. */
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
  private readonly volumeValue: Text;
  private readonly hint: Text;

  private row = 0;
  private column = 0;
  /** The slot waiting for a key press, if the menu is listening for one. */
  private capturing: { action: Action; slot: number } | null = null;
  private resolution = 1;

  constructor(private readonly options: SettingsMenuOptions) {
    this.view.visible = false;
    // Nothing in the game view should be reachable behind the menu, and Pixi hit
    // tests children even when nothing here is interactive.
    this.view.eventMode = "none";

    this.paintFrame();
    this.view.addChild(this.backdrop, this.highlight, this.meter);

    this.addText("SETTINGS", LABEL_X, TITLE_Y, COLOR_TEXT);
    this.addText("KEY 1", SLOT_X[0], HEADER_Y, COLOR_DIM);
    this.addText("KEY 2", SLOT_X[1], HEADER_Y, COLOR_DIM);

    ROWS.forEach((row, index) => {
      const y = ROWS_Y + index * ROW_H;
      const label = row.kind === "volume" ? "Volume" : ACTION_LABELS[row.action];
      this.rowLabels.push(this.addText(label, LABEL_X, y, COLOR_TEXT));
      this.slotLabels.push(
        row.kind === "binding"
          ? [
              this.addText("", SLOT_X[0] + 3, y, COLOR_TEXT),
              this.addText("", SLOT_X[1] + 3, y, COLOR_TEXT),
            ]
          : [],
      );
    });

    // The meter is drawn geometry; only the percentage is text.
    this.volumeValue = this.addText(
      "",
      SLOT_X[1] + 3,
      ROWS_Y + (ROWS.length - 1) * ROW_H,
      COLOR_TEXT,
    );
    this.hint = this.addText("", LABEL_X, HINT_Y, COLOR_DIM);
  }

  get visible(): boolean {
    return this.view.visible;
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

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  private moveRow(delta: number): void {
    this.row = (this.row + delta + ROWS.length) % ROWS.length;
    this.refresh();
  }

  /** Left/right picks the key slot on a binding row and nudges the volume on the volume row. */
  private moveColumn(delta: number): void {
    const row = ROWS[this.row];
    if (row.kind === "volume") {
      const current = this.options.getSettings().masterVolume;
      // Rounded to the step so repeated nudges cannot drift onto 0.30000000000000004.
      const next = Math.round((current + delta * VOLUME_STEP) * 10) / 10;
      this.options.setVolume(Math.max(0, Math.min(1, next)));
    } else {
      this.column = Math.max(0, Math.min(1, this.column + delta));
    }
    this.refresh();
  }

  private activate(): void {
    const row = ROWS[this.row];
    if (row.kind !== "binding") return;
    this.capturing = { action: row.action, slot: this.column };
    this.refresh();
  }

  private clearBinding(): void {
    const row = ROWS[this.row];
    if (row.kind !== "binding") return;
    this.options.setBinding(row.action, this.column, "");
    this.refresh();
  }

  /** Take the pressed key as the new binding, unless it is one the menu keeps. */
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

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  private addText(content: string, x: number, y: number, color: number): Text {
    const text = new Text({
      text: content,
      style: { fontFamily: "monospace", fontSize: 8, fill: color },
    });
    text.x = x;
    text.y = y;
    text.resolution = this.resolution;
    this.texts.push(text);
    this.view.addChild(text);
    return text;
  }

  /** The scrim, the panel and its border — none of which ever change. */
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

  /** Bring every changeable part in line with the current settings and selection. */
  private refresh(notice?: string): void {
    const settings = this.options.getSettings();
    const row = ROWS[this.row];

    this.highlight.clear();
    const rowY = ROWS_Y + this.row * ROW_H;
    this.highlight
      .rect(PANEL_X + PAD - 3, rowY - 2, PANEL_W - (PAD - 3) * 2, ROW_H - 2)
      .fill({ color: COLOR_BORDER, alpha: 0.3 });
    if (row.kind === "binding") {
      // The cell cursor: which of the two slots Enter would rebind.
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

    this.paintVolume(settings.masterVolume);
    this.hint.text =
      notice ??
      (this.capturing
        ? "press a key to bind, Esc to cancel"
        : row.kind === "volume"
          ? "Left/Right volume  -  Esc close"
          : "Enter rebind  -  Del clear  -  Esc close");
    this.hint.style.fill = notice ? COLOR_CAPTURING : COLOR_DIM;
  }

  /** The volume row's meter: one filled cell per tenth. */
  private paintVolume(volume: number): void {
    const filled = Math.round(volume * METER_CELLS);
    const y = ROWS_Y + (ROWS.length - 1) * ROW_H;

    this.meter.clear();
    for (let cell = 0; cell < METER_CELLS; cell++) {
      const x = SLOT_X[0] + cell * 5;
      // +2 lines the cells up with the glyph body of the row label rather than
      // with the top of its (taller) text box.
      this.meter.rect(x, y + 2, 4, 7).fill({
        color: cell < filled ? COLOR_SELECTED : COLOR_BORDER,
        alpha: cell < filled ? 1 : 0.5,
      });
    }
    this.volumeValue.text = `${Math.round(volume * 100)}%`;
  }
}
