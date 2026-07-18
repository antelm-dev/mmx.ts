import { Container, Graphics, Text } from 'pixi.js';
import { COLOR_BG, COLOR_TILE_EDGE } from './terrain.js';

/**
 * Health gauge, drawn in the same style as the in-game HUD: an outlined column
 * that fills from the bottom, with the pilot's initial in a cell underneath.
 *
 * Split into a static half (panels, borders, the initial) built once and a live
 * half redrawn only when the health ratio actually changes — which, in a game with
 * no damage sources wired up yet, is never.
 */

const X = 8;
const Y = 8;
const W = 10;
const H = 56;

const COLOR_PANEL = 0x060c1c;
const PANEL_ALPHA = 0.85;
const COLOR_FILL = 0xbfe9ff;
const COLOR_PILOT = 0x4ea8ff;

export class Hud {
  readonly view = new Container();
  private readonly gauge = new Graphics();
  private lastFilled = -1;

  constructor() {
    const panels = new Graphics()
      .rect(X, Y, W, H)
      .rect(X, Y + H + 2, W, 12)
      .fill({ color: COLOR_PANEL, alpha: PANEL_ALPHA });

    const borders = new Graphics()
      .rect(X + 0.5, Y + 0.5, W - 1, H - 1)
      .rect(X + 0.5, Y + H + 2.5, W - 1, 11)
      .stroke({ width: 1, color: COLOR_TILE_EDGE, alignment: 0.5 });

    const pilot = new Text({
      text: 'X',
      style: { fontFamily: 'monospace', fontSize: 9, fontWeight: 'bold', fill: COLOR_PILOT },
    });
    pilot.anchor.set(0.5);
    pilot.position.set(X + W / 2, Y + H + 9);

    // Order matters and mirrors the immediate-mode sequence exactly: the panel is
    // translucent, so the gauge has to sit *above* it or the fill reads washed out,
    // and the border above them both so a full bar cannot paint over the outline.
    this.view.addChild(panels, this.gauge, borders, pilot);
  }

  /**
   * Text is rasterised at a fixed resolution and then scaled by the viewport, so it
   * has to be re-rasterised when the integer zoom changes or the initial goes soft.
   * Everything else here is vector geometry and scales exactly.
   */
  setScale(scale: number): void {
    for (const child of this.view.children) {
      if (child instanceof Text) child.resolution = scale;
    }
  }

  update(currentHealth: number, maxHealth: number): void {
    const ratio = Math.max(0, currentHealth / maxHealth);
    const filled = Math.round((H - 2) * ratio);
    if (filled === this.lastFilled) return;
    this.lastFilled = filled;

    this.gauge.clear().rect(X + 1, Y + H - 1 - filled, W - 2, filled).fill(COLOR_FILL);

    // Segment ticks, three pixels apart, reading as the original's stacked bars.
    for (let ty = Y + 2; ty < Y + H - 1; ty += 3) this.gauge.rect(X + 1, ty, W - 2, 1);
    this.gauge.fill(COLOR_BG);
  }
}
