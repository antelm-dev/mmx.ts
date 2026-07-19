import { Container, Graphics, Text } from "pixi.js";
import { VIEW_HEIGHT, VIEW_WIDTH } from "@mmx/engine/core/constants.js";
import type { LevelData } from "@mmx/engine/engine/LevelData.js";
import { uiTextStyle } from "./font.js";

const COLOR_BG = 0x050a16;
const COLOR_PANEL = 0x0b1622;
const COLOR_BORDER = 0x395564;
const COLOR_TEXT = 0xd7edf7;
const COLOR_DIM = 0x7f9daa;
const COLOR_SELECTED = 0xffd166;
const COLOR_BLUE = 0x55dde0;

type Row = "play" | "level" | "settings";
const ROWS: readonly Row[] = ["play", "level", "settings"];

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
  private readonly texts: Text[] = [];
  private readonly rowTexts: Text[] = [];
  private readonly coreText: Text;
  private readonly levelText: Text;
  private row = 0;
  private level = 0;
  private resolution = 1;

  constructor(private readonly options: HomeScreenOptions) {
    if (options.levels.length === 0) throw new Error("home screen needs at least one level");
    this.view.eventMode = "none";
    this.paint();
    this.view.addChild(this.art, this.highlight);

    this.addText("MEGA MAN X", 159, 35, COLOR_TEXT);
    this.coreText = this.addText("CORE", 185, 49, COLOR_BLUE);
    this.addText("SELECT MISSION", 151, 81, COLOR_DIM);

    const labels = ["START", "LEVEL", "SETTINGS"];
    labels.forEach((label, index) => {
      this.rowTexts.push(this.addText(label, 112, 106 + index * 25, COLOR_TEXT));
    });
    this.levelText = this.addText("", 202, 131, COLOR_TEXT);
    this.addText("Arrows select   Enter confirm", 96, 199, COLOR_DIM);
    this.refresh();
  }

  get visible(): boolean {
    return this.view.visible;
  }

  open(): void {
    this.view.visible = true;
    // Re-setting the short subtitle invalidates Pixi's cached text quad after
    // the much larger settings overlay has been hidden at a different scale.
    this.coreText.position.set(185, 49);
    this.coreText.text = "CORE";
    this.refresh();
  }

  close(): void {
    this.view.visible = false;
  }

  setPixelScale(scale: number): void {
    if (scale === this.resolution || scale <= 0) return;
    this.resolution = scale;
    for (const text of this.texts) text.resolution = scale;
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
    const y = 102 + this.row * 25;
    this.highlight.clear().roundRect(94, y, 210, 20, 2).fill({ color: COLOR_BORDER, alpha: 0.55 });
    this.highlight.rect(99, y + 8, 4, 4).fill(COLOR_SELECTED);
    this.rowTexts.forEach((text, index) => {
      text.style.fill = index === this.row ? COLOR_SELECTED : COLOR_TEXT;
    });
    const selected = this.options.levels[this.level];
    this.levelText.text = `< ${friendlyName(selected.identifier)} >`;
    this.levelText.style.fill = this.row === 1 ? COLOR_SELECTED : COLOR_TEXT;
  }

  private paint(): void {
    this.art
      .rect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
      .fill(COLOR_BG)
      .rect(0, 0, VIEW_WIDTH, 5)
      .fill(COLOR_BLUE)
      .rect(54, 24, 290, 43)
      .fill({ color: COLOR_PANEL, alpha: 0.96 })
      .rect(54.5, 24.5, 289, 42)
      .stroke({ color: COLOR_BORDER, width: 1 })
      .rect(84, 94, 230, 88)
      .fill({ color: COLOR_PANEL, alpha: 0.96 })
      .rect(84.5, 94.5, 229, 87)
      .stroke({ color: COLOR_BORDER, width: 1 })
      .moveTo(62, 73)
      .lineTo(336, 73)
      .stroke({ color: COLOR_BORDER, width: 1 });
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
}

function friendlyName(identifier: string): string {
  return identifier
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\D)(\d)/g, "$1 $2")
    .toUpperCase();
}
