import { Container, Graphics, Text } from "pixi.js";
import { VIEW_HEIGHT, VIEW_WIDTH } from "@mmx/engine/core/constants.js";
import type { LevelData } from "@mmx/engine/engine/LevelData.js";
import { TextLayer } from "./TextLayer.js";
import {
  COLOR_ACCENT,
  COLOR_BG,
  COLOR_BORDER,
  COLOR_DIM,
  COLOR_PANEL,
  COLOR_SELECTED,
  COLOR_TEXT,
} from "./theme.js";

type Row = "play" | "level" | "settings";
const ROWS: readonly Row[] = ["play", "level", "settings"];

const ROW_TOP = 102;
const ROW_H = 25;
const ROW_LABEL_OFFSET = 4;

/** Top of the row's highlight band; the label sits {@link ROW_LABEL_OFFSET}px below it. */
function rowY(row: number): number {
  return ROW_TOP + row * ROW_H;
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
  private readonly coreText: Text;
  private readonly levelText: Text;
  private row = 0;
  private level = 0;
  private cursorBob = 0;

  constructor(private readonly options: HomeScreenOptions) {
    if (options.levels.length === 0) throw new Error("home screen needs at least one level");
    this.view.eventMode = "none";
    // Explicit rather than relying on Pixi's default: the screen that should be
    // showing first is whichever one main.ts calls open() on, not whichever one
    // happened to be constructed with nothing telling it otherwise.
    this.view.visible = false;
    this.paint();
    this.view.addChild(this.art, this.highlight);

    this.labels.add("MEGA MAN X", 159, 35, COLOR_TEXT);
    this.coreText = this.labels.add("CORE", 185, 49, COLOR_ACCENT);
    this.labels.add("SELECT MISSION", 151, 81, COLOR_DIM);

    const labels = ["START", "LEVEL", "SETTINGS"];
    labels.forEach((label, index) => {
      this.rowTexts.push(this.labels.add(label, 112, rowY(index) + ROW_LABEL_OFFSET, COLOR_TEXT));
    });
    this.levelText = this.labels.add("", 165, rowY(1) + ROW_LABEL_OFFSET, COLOR_TEXT);
    this.labels.add("Arrows select   Enter confirm", 96, 199, COLOR_DIM);
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

  /** Advance the cursor's idle bob. */
  update(now: number): void {
    if (!this.view.visible) return;
    this.cursorBob = Math.sin(now / 220) * 1.5;
    this.paintHighlight();
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

  /**
   * The selection band and its cursor. Redrawn every frame (not just on input)
   * so the cursor's idle bob — a small side-to-side drift, the one bit of motion
   * on an otherwise static screen — stays smooth between key presses.
   */
  private paintHighlight(): void {
    const y = rowY(this.row);
    this.highlight.clear().roundRect(94, y, 210, 20, 2).fill({ color: COLOR_BORDER, alpha: 0.55 });
    const cx = 99 + this.cursorBob;
    // A right-pointing chevron reads as "select this" the way the square dot it
    // replaced didn't, and costs the same one draw call.
    this.highlight.poly([cx, y + 6, cx, y + 14, cx + 6, y + 10]).fill(COLOR_SELECTED);
  }

  private paint(): void {
    this.art
      .rect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
      .fill(COLOR_BG)
      .rect(0, 0, VIEW_WIDTH, 5)
      .fill(COLOR_ACCENT)
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
    paintCorners(this.art, 54, 24, 290, 43);
    paintCorners(this.art, 84, 94, 230, 88);
  }
}

/**
 * Small L-shaped brackets just outside a panel's corners, in the accent color —
 * a targeting-frame accent borrowed from the series' own HUD furniture, cheap
 * enough to be worth it on a screen that otherwise has no motion or artwork.
 */
function paintCorners(g: Graphics, x: number, y: number, w: number, h: number): void {
  const len = 6;
  const o = 3;
  const corners: [number, number, 1 | -1, 1 | -1][] = [
    [x - o, y - o, 1, 1],
    [x + w + o, y - o, -1, 1],
    [x - o, y + h + o, 1, -1],
    [x + w + o, y + h + o, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    g.moveTo(cx, cy)
      .lineTo(cx + dx * len, cy)
      .stroke({ color: COLOR_ACCENT, width: 1 });
    g.moveTo(cx, cy)
      .lineTo(cx, cy + dy * len)
      .stroke({ color: COLOR_ACCENT, width: 1 });
  }
}

function friendlyName(identifier: string): string {
  return identifier
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\D)(\d)/g, "$1 $2")
    .toUpperCase();
}
