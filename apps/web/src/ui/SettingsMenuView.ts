import { Container, Graphics, Text } from "pixi.js";
import type { Action } from "@mmx/engine/core/Input.js";
import { VIEW_HEIGHT, VIEW_WIDTH } from "@mmx/engine/core/constants.js";
import { BINDABLE_ACTIONS, DEFAULT_WINDOW_SCALE, type DesktopSettings } from "../DesktopBridge.js";
import { TextLayer } from "./TextLayer.js";
import {
  COLOR_BG,
  COLOR_BORDER,
  COLOR_CAPTURING,
  COLOR_DIM,
  COLOR_PANEL,
  COLOR_SCRIM,
  COLOR_SELECTED,
  COLOR_TEXT,
} from "./theme.js";

/**
 * Pure rendering for the pause menu: key bindings, window scale, fullscreen
 * and master volume. Owns no state of its own beyond what it needs to avoid
 * repainting the static backdrop every frame — everything it draws comes
 * from the {@link SettingsMenuViewState} passed to {@link render}, and every
 * key press or settings mutation is handled by {@link SettingsMenuController}.
 *
 * Drawn into the Pixi scene rather than overlaid as DOM — unlike the debug panel
 * (see {@link DebugPanel}, which is deliberately DOM), this is player-facing
 * furniture, so it belongs on the same pixel grid as the game and has to survive
 * fullscreen and the integer-zoom fit. It lives in the renderer's screen-space UI
 * layer, so its coordinates are the 398x224 view and the zoom is applied above it.
 */

// Sized around the UI face rather than around the strings: every glyph advances
// UI_CHAR_W (7px), so a column is just its longest label times that. The widest
// things that have to fit are the hint line at 36 characters (252px inside the
// padding) and "press..." in a key slot (56px).
const PANEL_W = 296;
// +ROW_H (11) per row added over the 11-row baseline: one for "Restore Defaults",
// two more for weapon_left/weapon_right once weapon switching became bindable.
const PANEL_H = 221;
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

const METER_CELLS = 10;

export type Row =
  | { kind: "binding"; action: Action }
  | { kind: "scale" }
  | { kind: "fullscreen" }
  | { kind: "volume" }
  | { kind: "resetBindings" }
  | { kind: "mainMenu" };

export const ROWS: readonly Row[] = [
  ...BINDABLE_ACTIONS.map((action): Row => ({ kind: "binding", action })),
  { kind: "scale" },
  { kind: "fullscreen" },
  { kind: "volume" },
  { kind: "resetBindings" },
  { kind: "mainMenu" },
];

export function rowIndex(kind: Row["kind"]): number {
  return ROWS.findIndex((row) => row.kind === kind);
}

const ACTION_LABELS: Record<Action, string> = {
  move_left: "Left",
  move_right: "Right",
  move_up: "Up",
  move_down: "Down",
  jump: "Jump",
  dash: "Dash",
  fire: "Fire",
  weapon_left: "Prev Weapon",
  weapon_right: "Next Weapon",
};

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

export interface SettingsMenuViewState {
  settings: DesktopSettings;
  maxScale: number;
  row: number;
  column: number;
  capturing: { action: Action; slot: number } | null;
  opaque: boolean;
  /** Overrides the row hint with a transient message, e.g. "F1 is reserved". */
  notice?: string;
}

export class SettingsMenuView {
  readonly view = new Container();

  private readonly backdrop = new Graphics();
  private readonly highlight = new Graphics();
  private readonly meter = new Graphics();
  private readonly labels = new TextLayer(this.view);
  private readonly rowLabels: Text[] = [];
  private readonly slotLabels: Text[][] = [];
  private readonly scaleValue: Text;
  private readonly fullscreenValue: Text;
  private readonly volumeValue: Text;
  private readonly hint: Text;

  /** Whichever `opaque` {@link render} last painted the backdrop for. */
  private opaquePainted = false;

  constructor() {
    this.view.visible = false;
    this.view.eventMode = "none";

    this.paintFrame();
    this.view.addChild(this.backdrop, this.highlight, this.meter);

    this.labels.add("SETTINGS", LABEL_X, TITLE_Y, COLOR_TEXT);
    this.labels.add("KEY 1", SLOT_X[0], HEADER_Y, COLOR_DIM);
    this.labels.add("KEY 2", SLOT_X[1], HEADER_Y, COLOR_DIM);

    ROWS.forEach((row, index) => {
      const y = ROWS_Y + index * ROW_H;
      this.rowLabels.push(this.labels.add(rowLabel(row), LABEL_X, y, COLOR_TEXT));
      this.slotLabels.push(
        row.kind === "binding"
          ? [
              this.labels.add("", SLOT_X[0] + 3, y, COLOR_TEXT),
              this.labels.add("", SLOT_X[1] + 3, y, COLOR_TEXT),
            ]
          : [],
      );
    });

    this.scaleValue = this.labels.add(
      "",
      SLOT_X[0] + 3,
      ROWS_Y + rowIndex("scale") * ROW_H,
      COLOR_TEXT,
    );
    this.fullscreenValue = this.labels.add(
      "",
      SLOT_X[0] + 3,
      ROWS_Y + rowIndex("fullscreen") * ROW_H,
      COLOR_TEXT,
    );
    this.volumeValue = this.labels.add(
      "",
      SLOT_X[1] + 3,
      ROWS_Y + rowIndex("volume") * ROW_H,
      COLOR_TEXT,
    );
    this.hint = this.labels.add("", LABEL_X, HINT_Y, COLOR_DIM);
  }

  get visible(): boolean {
    return this.view.visible;
  }

  setVisible(visible: boolean): void {
    this.view.visible = visible;
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
    this.labels.setPixelScale(scale);
  }

  render(state: SettingsMenuViewState): void {
    if (state.opaque !== this.opaquePainted) {
      this.opaquePainted = state.opaque;
      this.paintFrame();
    }

    const { settings, row, column, capturing, notice } = state;
    const current = ROWS[row];

    this.highlight.clear();
    const rowY = ROWS_Y + row * ROW_H;
    this.highlight
      .rect(PANEL_X + PAD - 3, rowY - 2, PANEL_W - (PAD - 3) * 2, ROW_H - 2)
      .fill({ color: COLOR_BORDER, alpha: 0.3 });
    if (current.kind === "binding") {
      this.highlight
        .rect(SLOT_X[column], rowY - 2, SLOT_W, ROW_H - 2)
        .fill({ color: capturing ? COLOR_CAPTURING : COLOR_SELECTED, alpha: 0.25 });
    }

    ROWS.forEach((entry, index) => {
      const selected = index === row;
      this.rowLabels[index].style.fill = selected ? COLOR_SELECTED : COLOR_TEXT;
      if (entry.kind !== "binding") return;

      const bindings = settings.bindings[entry.action];
      this.slotLabels[index].forEach((text, slot) => {
        const isCapturing = capturing?.action === entry.action && capturing.slot === slot;
        text.text = isCapturing ? "press..." : keyLabel(bindings[slot]);
        text.style.fill = isCapturing ? COLOR_CAPTURING : bindings[slot] ? COLOR_TEXT : COLOR_DIM;
      });
    });

    this.scaleValue.text = `${settings.scale ?? DEFAULT_WINDOW_SCALE}x`;
    this.fullscreenValue.text = settings.fullscreen ? "On" : "Off";
    this.paintVolume(settings.masterVolume);
    this.hint.text = notice ?? (capturing ? "press a key to bind, Esc to cancel" : rowHint(current));
    this.hint.style.fill = notice ? COLOR_CAPTURING : COLOR_DIM;
  }

  private paintFrame(): void {
    this.backdrop.clear();
    if (this.opaquePainted) this.backdrop.rect(0, 0, VIEW_WIDTH, VIEW_HEIGHT).fill(COLOR_BG);
    else
      this.backdrop.rect(0, 0, VIEW_WIDTH, VIEW_HEIGHT).fill({ color: COLOR_SCRIM, alpha: 0.78 });
    this.backdrop
      .rect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H)
      .fill({ color: COLOR_PANEL, alpha: 0.96 })
      .rect(PANEL_X + 0.5, PANEL_Y + 0.5, PANEL_W - 1, PANEL_H - 1)
      .stroke({ color: COLOR_BORDER, width: 1 })
      .rect(PANEL_X + PAD, RULE_Y, PANEL_W - PAD * 2, 1)
      .fill(COLOR_BORDER);
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
    case "resetBindings":
      return "Restore Defaults";
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
    case "resetBindings":
      return "Enter restore default key bindings";
    case "binding":
      return "Enter rebind - Del clear - Esc close";
    case "mainMenu":
      return "Enter return to home";
  }
}
