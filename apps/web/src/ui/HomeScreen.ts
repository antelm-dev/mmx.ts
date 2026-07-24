import { Container, Graphics, Text } from "pixi.js";
import { VIEW_HEIGHT, VIEW_WIDTH } from "@mmx/engine/core/constants.js";
import type { LevelData } from "@mmx/engine/game/LevelData.js";
import { UI_CHAR_W } from "./font.js";
import { TextLayer } from "./TextLayer.js";
import { COLOR_BG, COLOR_BORDER, COLOR_SELECTED, COLOR_TEXT } from "./theme.js";

type Row = "play" | "level" | "settings";
const ROWS: readonly Row[] = ["play", "level", "settings"];

const ROW_TOP = 102;
const ROW_H = 25;
const ROW_LABEL_OFFSET = 4;

/** Top of the row's highlight band; the label sits {@link ROW_LABEL_OFFSET}px below it. */
function rowY(row: number): number {
  return ROW_TOP + row * ROW_H;
}

/** Horizontal position that centers a string of the UI face on the view. */
function centerX(text: string): number {
  return Math.round((VIEW_WIDTH - text.length * UI_CHAR_W) / 2);
}

export interface HomeScreenOptions {
  levels: readonly LevelData[];
  onPlay: (level: LevelData) => void;
  onSettings: () => void;
}

/** Keyboard/gamepad-first title screen and authored-level picker. */
export class HomeScreen {
  readonly view = new Container();

  private readonly art = new Graphics();
  private readonly highlight = new Graphics();
  private readonly labels = new TextLayer(this.view);
  private readonly rowTexts: Text[] = [];
  private readonly levelText: Text;
  private row = 0;
  private level = 0;

  constructor(private readonly options: HomeScreenOptions) {
    if (options.levels.length === 0) throw new Error("home screen needs at least one level");
    this.view.eventMode = "none";
    // Explicit rather than relying on Pixi's default: the screen that should be
    // showing first is whichever one main.ts calls open() on, not whichever one
    // happened to be constructed with nothing telling it otherwise.
    this.view.visible = false;
    this.paint();
    this.view.addChild(this.art, this.highlight);

    this.labels.add("MEGA MAN X", centerX("MEGA MAN X"), 52, COLOR_TEXT);

    const labels = ["START", "LEVEL", "SETTINGS"];
    labels.forEach((label, index) => {
      this.rowTexts.push(this.labels.add(label, 112, rowY(index) + ROW_LABEL_OFFSET, COLOR_TEXT));
    });
    this.levelText = this.labels.add("", 165, rowY(1) + ROW_LABEL_OFFSET, COLOR_TEXT);
    this.refresh();
  }

  get visible(): boolean {
    return this.view.visible;
  }

  open(): void {
    this.view.visible = true;
    this.refresh();
  }

  close(): void {
    this.view.visible = false;
  }

  setPixelScale(scale: number): void {
    this.labels.setPixelScale(scale);
  }

  handleKey(code: string): boolean {
    if (!this.visible) return false;
    switch (code) {
      case "ArrowUp":
      case "KeyW":
        this.row = (this.row + ROWS.length - 1) % ROWS.length;
        break;
      case "ArrowDown":
      case "KeyS":
        this.row = (this.row + 1) % ROWS.length;
        break;
      case "ArrowLeft":
      case "KeyA":
        if (ROWS[this.row] === "level") this.changeLevel(-1);
        break;
      case "ArrowRight":
      case "KeyD":
        if (ROWS[this.row] === "level") this.changeLevel(1);
        break;
      case "Enter":
      case "Space":
        this.activate();
        break;
      default:
        return true;
    }
    this.refresh();
    return true;
  }

  private changeLevel(delta: number): void {
    this.level = (this.level + delta + this.options.levels.length) % this.options.levels.length;
  }

  private activate(): void {
    const row = ROWS[this.row];
    if (row === "settings") this.options.onSettings();
    else if (row === "play") this.options.onPlay(this.options.levels[this.level]);
    else this.changeLevel(1);
  }

  private refresh(): void {
    this.paintHighlight();
    this.rowTexts.forEach((text, index) => {
      text.style.fill = index === this.row ? COLOR_SELECTED : COLOR_TEXT;
    });
    const selected = this.options.levels[this.level];
    this.levelText.text = `< ${friendlyName(selected.identifier)} >`;
    this.levelText.style.fill = this.row === 1 ? COLOR_SELECTED : COLOR_TEXT;
  }

  /** Same plain fill-behind-the-row treatment as {@link SettingsMenuView}'s highlight, no frame or cursor. */
  private paintHighlight(): void {
    const y = rowY(this.row);
    this.highlight.clear().rect(94, y, 210, 20).fill({ color: COLOR_BORDER, alpha: 0.3 });
  }

  private paint(): void {
    this.art.rect(0, 0, VIEW_WIDTH, VIEW_HEIGHT).fill(COLOR_BG);
  }
}

function friendlyName(identifier: string): string {
  return identifier
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\D)(\d)/g, "$1 $2")
    .toUpperCase();
}
